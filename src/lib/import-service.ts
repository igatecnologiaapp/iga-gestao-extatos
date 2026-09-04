import { supabase } from "@/lib/backend-client";
import type {
  ImportBatch,
  ImportSourceType,
  StagedTransaction,
  TransactionDirection,
} from "@/lib/domain";
import {
  detectFormat,
  fingerprintOf,
  hashFile,
  ImportError,
  normalizeDescription,
  parseDocument,
  resolveCategoryId,
} from "@/lib/importers";

export const STORAGE_BUCKET = "financial-documents";

export type DuplicateFileInfo = { batch: ImportBatch };

export class DuplicateFileError extends ImportError {
  batch: ImportBatch;
  constructor(batch: ImportBatch) {
    super(
      "arquivo_duplicado",
      `Este arquivo já foi importado em ${new Date(batch.created_at).toLocaleString("pt-BR")} (${batch.file_name}).`,
    );
    this.batch = batch;
  }
}

export type CreateImportInput = {
  companyId: string;
  userId: string | null;
  sourceType: ImportSourceType;
  institutionId: string | null;
  accountId: string | null;
  cardId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  file: File;
  categories: Array<{ id: string; name: string }>;
  /** Permite prosseguir mesmo com arquivo já importado anteriormente. */
  allowDuplicateFile?: boolean;
};

function sanitizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

/**
 * Pipeline: Recebido → Processando → Revisão (ou Erro).
 * O arquivo original vai para o storage privado antes de qualquer processamento.
 */
export async function createImport(input: CreateImportInput): Promise<ImportBatch> {
  const { file, companyId } = input;

  if (!input.accountId && !input.cardId) {
    throw new ImportError(
      "conta_nao_selecionada",
      "Selecione a conta bancária ou o cartão de destino da importação.",
    );
  }
  if (file.size === 0) throw new ImportError("arquivo_vazio", "O arquivo enviado está vazio.");

  const format = detectFormat(file.name);
  const buffer = await file.arrayBuffer();
  const fileHash = await hashFile(buffer);

  // Nível 1 — arquivo duplicado
  if (!input.allowDuplicateFile) {
    const { data: existing } = await supabase
      .from("import_batches")
      .select("*")
      .eq("company_id", companyId)
      .eq("file_hash", fileHash)
      .not("status", "in", "(cancelado,erro)")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existing && existing.length > 0) throw new DuplicateFileError(existing[0]!);
  }

  const storagePath = `${companyId}/importacoes/${crypto.randomUUID()}-${sanitizeName(file.name)}`;
  const upload = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (upload.error) {
    throw new ImportError(
      "falha_upload",
      `Não foi possível enviar o arquivo ao armazenamento seguro: ${upload.error.message}`,
    );
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      company_id: companyId,
      source_type: input.sourceType,
      institution_id: input.institutionId,
      account_id: input.accountId,
      card_id: input.cardId,
      file_name: file.name,
      file_format: format,
      file_size: file.size,
      file_hash: fileHash,
      storage_path: storagePath,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      status: "processando",
      created_by: input.userId,
    })
    .select("*")
    .single();
  if (batchError || !batch) {
    throw new ImportError(
      "falha_registro",
      batchError?.message ?? "Não foi possível registrar a importação.",
    );
  }

  try {
    const parsed = await parseDocument(format, buffer);

    const seen = new Map<string, number>();
    const rows = parsed.rows.map((row, index) => {
      const fingerprint = fingerprintOf({
        companyId,
        accountId: input.accountId,
        cardId: input.cardId,
        postedAt: row.posted_at,
        amount: row.amount,
        direction: row.direction,
        description: row.description,
      });
      const firstIndex = seen.get(fingerprint);
      if (firstIndex === undefined) seen.set(fingerprint, index);
      return {
        row,
        fingerprint,
        duplicateInFile: firstIndex !== undefined,
      };
    });

    // Nível 2 — lançamento duplicado contra o que já está confirmado
    const fingerprints = [...new Set(rows.map((r) => r.fingerprint))];
    const existingFingerprints = new Set<string>();
    for (let i = 0; i < fingerprints.length; i += 100) {
      const chunk = fingerprints.slice(i, i + 100);
      const { data } = await supabase
        .from("transactions")
        .select("fingerprint")
        .eq("company_id", companyId)
        .eq("status", "ativo")
        .in("fingerprint", chunk);
      for (const r of data ?? []) if (r.fingerprint) existingFingerprints.add(r.fingerprint);
    }

    const payload = rows.map(({ row, fingerprint, duplicateInFile }, index) => {
      const duplicateExisting = existingFingerprints.has(fingerprint);
      return {
        company_id: companyId,
        import_id: batch.id,
        posted_at: row.posted_at,
        description: row.description,
        normalized_description: normalizeDescription(row.description),
        amount: row.amount,
        direction: row.direction,
        currency: row.currency,
        category_id: resolveCategoryId(row.description, input.categories),
        status: "pendente" as const,
        duplicate_state: (duplicateExisting || duplicateInFile
          ? "possivel"
          : "nenhuma") as StagedTransaction["duplicate_state"],
        duplicate_reason: duplicateExisting
          ? "Lançamento idêntico já confirmado nesta empresa"
          : duplicateInFile
            ? "Lançamento repetido dentro do próprio arquivo"
            : null,
        warnings: row.warnings,
        fingerprint,
        raw: row.raw as never,
        row_index: index,
      };
    });

    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await supabase
        .from("staged_transactions")
        .insert(payload.slice(i, i + 200));
      if (error) throw new ImportError("falha_registro", error.message);
    }

    const { data: updated } = await supabase
      .from("import_batches")
      .update({
        status: "revisao",
        parsed_count: payload.length,
        processed_at: new Date().toISOString(),
      })
      .eq("id", batch.id)
      .select("*")
      .single();

    return updated ?? batch;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Falha desconhecida ao processar o documento.";
    await supabase
      .from("import_batches")
      .update({ status: "erro", error_message: message })
      .eq("id", batch.id);
    throw err;
  }
}

/** Confirma lançamentos em revisão, criando registros definitivos rastreáveis. */
export async function confirmStaged(params: {
  batch: ImportBatch;
  staged: StagedTransaction[];
  userId: string | null;
}): Promise<{ confirmed: number }> {
  const valid = params.staged.filter(
    (s) => s.status === "pendente" && s.posted_at && s.amount !== null && s.direction,
  );
  if (valid.length === 0) {
    throw new ImportError(
      "nada_a_confirmar",
      "Nenhum lançamento selecionado está completo (data, valor e natureza são obrigatórios).",
    );
  }

  const payload = valid.map((s) => ({
    company_id: s.company_id,
    import_id: s.import_id,
    staged_id: s.id,
    source_type: params.batch.source_type,
    institution_id: params.batch.institution_id,
    account_id: params.batch.account_id,
    card_id: params.batch.card_id,
    posted_at: s.posted_at!,
    description: s.description,
    normalized_description: s.normalized_description,
    amount: s.amount!,
    direction: s.direction as TransactionDirection,
    currency: s.currency,
    category_id: s.category_id,
    subcategory_id: s.subcategory_id,
    origin: "importado" as const,
    fingerprint: s.fingerprint,
    created_by: params.userId,
  }));

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) throw new ImportError("falha_confirmacao", error.message);

  const ids = valid.map((s) => s.id);
  await supabase.from("staged_transactions").update({ status: "confirmado" }).in("id", ids);

  const { count } = await supabase
    .from("staged_transactions")
    .select("id", { count: "exact", head: true })
    .eq("import_id", params.batch.id)
    .eq("status", "pendente");

  await supabase
    .from("import_batches")
    .update({
      confirmed_count: (params.batch.confirmed_count ?? 0) + valid.length,
      status: (count ?? 0) === 0 ? "confirmado" : "revisao",
    })
    .eq("id", params.batch.id);

  return { confirmed: valid.length };
}

/** URL temporária e assinada do arquivo original (bucket privado). */
export async function signedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new ImportError("arquivo_indisponivel", "Arquivo original indisponível.");
  return data.signedUrl;
}
