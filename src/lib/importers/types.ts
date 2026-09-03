export type ImportFileFormat = "pdf" | "ofx" | "csv" | "xlsx";
export type Direction = "entrada" | "saida";

/** Linha extraída de um documento, antes de virar lançamento em revisão. */
export type ParsedRow = {
  posted_at: string | null; // ISO yyyy-mm-dd
  description: string;
  amount: number | null; // sempre positivo (magnitude); a natureza fica em `direction`
  direction: Direction | null;
  currency: string;
  warnings: string[];
  raw: Record<string, unknown>;
};

export type ParseResult = {
  rows: ParsedRow[];
  warnings: string[];
};

/** Erro de importação com mensagem útil ao usuário (nunca "erro ao processar"). */
export class ImportError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ImportError";
  }
}

export const IMPORT_ERRORS = {
  emptyFile: () => new ImportError("arquivo_vazio", "O arquivo está vazio."),
  unsupported: (ext: string) =>
    new ImportError(
      "formato_nao_suportado",
      `Formato não suportado${ext ? ` (.${ext})` : ""}. Envie PDF, OFX, CSV ou XLS/XLSX.`,
    ),
  unreadable: (detail?: string) =>
    new ImportError(
      "documento_ilegivel",
      `Não foi possível ler o conteúdo do documento${detail ? `: ${detail}` : "."}`,
    ),
  noMovements: () =>
    new ImportError(
      "sem_movimentacoes",
      "Nenhuma movimentação foi encontrada no documento enviado.",
    ),
  missingColumns: () =>
    new ImportError(
      "colunas_ausentes",
      "Não foi possível identificar as colunas de data, descrição e valor no arquivo.",
    ),
} as const;
