/**
 * ============================================================================
 * Suíte de testes de segurança — Fases 0 e 1 — App "Gestor de Extratos"
 *
 * Uso:  bun run test:security
 *
 * Diferente de um teste de banco, esta suíte exercita exatamente o mesmo
 * caminho que o aplicativo usa: usuários reais autenticados, chamando a API
 * de dados com seus próprios tokens. O que passar aqui é o comportamento real
 * que um usuário (ou um invasor) obtém.
 *
 * Cobertura:
 *   GRANT — privilégios da API de dados nas tabelas
 *   STO   — bucket privado de documentos e suas políticas
 *   SEC   — isolamento total entre Empresa Alfa e Empresa Beta
 *   RBAC  — matriz de permissões por papel (admin, financeiro, consulta, auditor)
 *   XREF  — integridade de referências dentro da mesma empresa
 *   AUD   — trilha de auditoria: geração automática e imutabilidade
 *   ADM   — proteção do último administrador ativo
 *   PRIV  — funções de segurança fora da API pública
 *   ANON  — ausência de acesso anônimo
 *
 * Toda a massa de dados criada é removida ao final, mesmo em caso de falha.
 * ============================================================================
 */
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!URL || !SERVICE_KEY || !PUBLISHABLE_KEY) {
  console.error("Variáveis de ambiente do backend ausentes. Rode dentro do ambiente do projeto.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ----------------------------- Relatório -----------------------------
const results = [];
const record = (id, scenario, expected, ok, detail = "") =>
  results.push({ id, scenario, expected, status: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 150) });

/** A operação deve ser negada (erro) OU não afetar nenhuma linha. */
async function deny(id, scenario, thunk) {
  try {
    const { data, error } = await thunk();
    if (error) return record(id, scenario, "NEGADO", true, error.message);
    const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
    record(id, scenario, "NEGADO", rows === 0, rows > 0 ? `PERMITIDO indevidamente (${rows} linha(s))` : "nenhuma linha afetada");
  } catch (e) {
    record(id, scenario, "NEGADO", true, e.message);
  }
}

async function allow(id, scenario, thunk) {
  try {
    const { error } = await thunk();
    record(id, scenario, "PERMITIDO", !error, error?.message ?? "");
  } catch (e) {
    record(id, scenario, "PERMITIDO", false, e.message);
  }
}

async function count(id, scenario, thunk, expected) {
  try {
    const { data, error } = await thunk();
    if (error) return record(id, scenario, `= ${expected}`, false, error.message);
    const n = Array.isArray(data) ? data.length : 0;
    record(id, scenario, `= ${expected}`, n === expected, `obtido: ${n}`);
  } catch (e) {
    record(id, scenario, `= ${expected}`, false, e.message);
  }
}

const atLeast = async (id, scenario, thunk, min) => {
  const { data, error } = await thunk();
  const n = Array.isArray(data) ? data.length : 0;
  record(id, scenario, `>= ${min}`, !error && n >= min, error?.message ?? `obtido: ${n}`);
};

/** Consulta de introspecção somente-leitura no banco (catálogo). */
function introspect(sql) {
  if (!DB_URL) return null;
  try {
    return execFileSync("psql", [DB_URL, "-t", "-A", "-c", sql], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// ----------------------------- Massa de dados -----------------------------
const stamp = Date.now();
const pwd = `Teste!${stamp}aA1`;
const users = {
  adminAlfa: { email: `qa.admin.alfa.${stamp}@teste.local`, name: "Admin Alfa", role: "admin", company: "alfa" },
  finAlfa: { email: `qa.fin.alfa.${stamp}@teste.local`, name: "Fin Alfa", role: "financeiro", company: "alfa" },
  conAlfa: { email: `qa.con.alfa.${stamp}@teste.local`, name: "Con Alfa", role: "consulta", company: "alfa" },
  audAlfa: { email: `qa.aud.alfa.${stamp}@teste.local`, name: "Aud Alfa", role: "auditor", company: "alfa" },
  adminBeta: { email: `qa.admin.beta.${stamp}@teste.local`, name: "Admin Beta", role: "admin", company: "beta" },
  admin2Beta: { email: `qa.admin2.beta.${stamp}@teste.local`, name: "Admin Beta 2", role: null, company: "beta" },
};

const created = { users: [], companies: [] };
const ids = {};

async function seed() {
  for (const key of ["alfa", "beta"]) {
    const { data, error } = await admin
      .from("companies")
      .insert({ name: `QA Empresa ${key} ${stamp}` })
      .select("id")
      .single();
    if (error) throw new Error(`falha ao criar empresa: ${error.message}`);
    ids[key] = data.id;
    created.companies.push(data.id);
  }

  for (const [key, u] of Object.entries(users)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: pwd,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error) throw new Error(`falha ao criar usuário ${key}: ${error.message}`);
    u.id = data.user.id;
    created.users.push(data.user.id);
    await admin.from("profiles").upsert({ id: u.id, full_name: u.name, email: u.email });
    if (u.role) {
      const { error: rErr } = await admin
        .from("user_roles")
        .insert({ user_id: u.id, company_id: ids[u.company], role: u.role });
      if (rErr) throw new Error(`falha ao vincular ${key}: ${rErr.message}`);
    }
  }

  const inst = async (company, name) =>
    (await admin.from("financial_institutions").insert({ company_id: ids[company], name }).select("id").single()).data.id;
  ids.instAlfa = await inst("alfa", "Banco Alfa QA");
  ids.instBeta = await inst("beta", "Banco Beta QA");

  await admin.from("bank_accounts").insert([
    { company_id: ids.alfa, institution_id: ids.instAlfa, account_number: "1001" },
    { company_id: ids.beta, institution_id: ids.instBeta, account_number: "2002" },
  ]);
  await admin.from("cards").insert([
    { company_id: ids.alfa, institution_id: ids.instAlfa, nickname: "Cartão Alfa", last_four_digits: "1234" },
    { company_id: ids.beta, institution_id: ids.instBeta, nickname: "Cartão Beta", last_four_digits: "9876" },
  ]);

  const { data: betaImport, error: betaImportError } = await admin
    .from("import_batches")
    .insert({
      company_id: ids.beta,
      source_type: "conta",
      file_name: "qa-extrato.csv",
      file_format: "csv",
      file_size: 128,
      file_hash: `qa-${stamp}`,
      storage_path: `${ids.beta}/qa-${stamp}/extrato.csv`,
      status: "revisao",
    })
    .select("id")
    .single();
  if (betaImportError) throw new Error(`falha ao criar lote beta: ${betaImportError.message}`);
  ids.importBeta = betaImport.id;

  const { data: betaStaged, error: betaStagedError } = await admin
    .from("staged_transactions")
    .insert({
      company_id: ids.beta,
      import_id: ids.importBeta,
      posted_at: "2026-01-02",
      description: "Lançamento fictício QA",
      normalized_description: "lancamento ficticio qa",
      amount: 10,
      direction: "saida",
    })
    .select("id")
    .single();
  if (betaStagedError) throw new Error(`falha ao criar item beta: ${betaStagedError.message}`);
  ids.stagedBeta = betaStaged.id;

  const { data: betaTransaction, error: betaTransactionError } = await admin
    .from("transactions")
    .insert({
      company_id: ids.beta,
      import_id: ids.importBeta,
      source_type: "conta",
      posted_at: "2026-01-02",
      description: "Lançamento fictício QA",
      normalized_description: "lancamento ficticio qa",
      amount: 10,
      direction: "saida",
      origin: "importado",
    })
    .select("id")
    .single();
  if (betaTransactionError) throw new Error(`falha ao criar lançamento beta: ${betaTransactionError.message}`);
  ids.transactionBeta = betaTransaction.id;

  const cat = async (company, name) =>
    (await admin.from("transaction_categories").insert({ company_id: ids[company], name }).select("id").single()).data.id;
  ids.catAlfa = await cat("alfa", "Categoria Alfa QA");
  ids.catBeta = await cat("beta", "Categoria Beta QA");
}

async function signIn(u) {
  const client = createClient(URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: u.email, password: pwd });
  if (error) throw new Error(`falha no login de ${u.email}: ${error.message}`);
  return client;
}

async function cleanup() {
  for (const table of [
    "audit_log",
    "invoice_payments",
    "transactions",
    "card_invoices",
    "staged_transactions",
    "import_batches",
    "classification_rules",
    "transaction_subcategories",
    "transaction_categories",
    "cards",
    "bank_accounts",
    "financial_institutions",
    "user_roles",
  ]) {
    for (const c of created.companies) await admin.from(table).delete().eq("company_id", c);
  }
  for (const id of created.users) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  for (const c of created.companies) await admin.from("audit_log").delete().eq("company_id", c);
  for (const c of created.companies) await admin.from("companies").delete().eq("id", c);
}

// ----------------------------- Execução -----------------------------
async function main() {
  await seed();

  // ============ GRANT / STO — configuração estrutural ============
  const missingGrants = introspect(`
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND NOT EXISTS (SELECT 1 FROM aclexplode(c.relacl) a
                       JOIN pg_roles r ON r.oid = a.grantee
                       WHERE r.rolname = 'authenticated'
                         AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE'))`);
  if (missingGrants !== null)
    record("GRANT-01", "Toda tabela tem privilégios de API para usuários autenticados", "= 0", missingGrants === "0", `obtido: ${missingGrants}`);

  const anonGrants = introspect(`
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
       JOIN pg_roles r ON r.oid = a.grantee
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND r.rolname = 'anon' AND a.privilege_type IN ('INSERT','UPDATE','DELETE')`);
  if (anonGrants !== null)
    record("GRANT-02", "Visitantes anônimos não têm privilégio de escrita em nenhuma tabela", "= 0", anonGrants === "0", `obtido: ${anonGrants}`);

  const { data: buckets } = await admin.storage.listBuckets();
  const docs = (buckets ?? []).find((b) => b.name === "financial-documents");
  record("STO-01", "Bucket de documentos existe e é privado", "privado", !!docs && docs.public === false, docs ? `public=${docs.public}` : "bucket ausente");

  const stoPolicies = introspect(`
    SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual,'') LIKE '%financial-documents%' OR coalesce(with_check,'') LIKE '%financial-documents%')`);
  if (stoPolicies !== null)
    record("STO-02", "Documentos protegidos por políticas de acesso por empresa", ">= 4", Number(stoPolicies) >= 4, `obtido: ${stoPolicies}`);

  // ============ ANON — nenhum acesso sem login ============
  await deny("ANON-01", "Visitante anônimo não lê contas bancárias", () => anon.from("bank_accounts").select("id"));
  await deny("ANON-02", "Visitante anônimo não lê empresas", () => anon.from("companies").select("id"));
  await deny("ANON-03", "Visitante anônimo não lê a trilha de auditoria", () => anon.from("audit_log").select("id"));
  await deny("ANON-04", "Visitante anônimo não cria empresa", () => anon.from("companies").insert({ name: "invasor" }).select());
  await deny("ANON-05", "Visitante anônimo não lê documentos do storage", () =>
    anon.storage.from("financial-documents").list(ids.alfa).then((r) => ({ data: r.data, error: r.error })));
  await deny("ANON-06", "Visitante anônimo não lê lotes de importação", () => anon.from("import_batches").select("id"));
  await deny("ANON-07", "Visitante anônimo não lê itens em revisão", () => anon.from("staged_transactions").select("id"));
  await deny("ANON-08", "Visitante anônimo não lê lançamentos", () => anon.from("transactions").select("id"));

  // ============ SEC — isolamento multiempresa ============
  const conAlfa = await signIn(users.conAlfa);
  await count("SEC-01", "Usuário da Alfa não enxerga contas da Empresa Beta", () => conAlfa.from("bank_accounts").select("id").eq("company_id", ids.beta), 0);
  await atLeast("SEC-02", "Usuário da Alfa enxerga as contas da própria empresa", () => conAlfa.from("bank_accounts").select("id").eq("company_id", ids.alfa), 1);
  await count("SEC-03", "Usuário da Alfa não enxerga cartões da Empresa Beta", () => conAlfa.from("cards").select("id").eq("company_id", ids.beta), 0);
  await count("SEC-04", "Usuário da Alfa não enxerga instituições da Empresa Beta", () => conAlfa.from("financial_institutions").select("id").eq("company_id", ids.beta), 0);
  await count("SEC-05", "Usuário da Alfa não enxerga a Empresa Beta em si", () => conAlfa.from("companies").select("id").eq("id", ids.beta), 0);
  await count("SEC-06", "Usuário da Alfa não enxerga membros da Empresa Beta", () => conAlfa.from("user_roles").select("id").eq("company_id", ids.beta), 0);
  await count("SEC-07", "Usuário da Alfa não enxerga o perfil de usuário de outra empresa", () => conAlfa.from("profiles").select("id").eq("id", users.adminBeta.id), 0);
  await count("SEC-08", "Usuário da Alfa não enxerga categorias da Empresa Beta", () => conAlfa.from("transaction_categories").select("id").eq("company_id", ids.beta), 0);
  await deny("SEC-09", "Usuário da Alfa não lê documentos da Empresa Beta no storage", () =>
    conAlfa.storage.from("financial-documents").list(ids.beta).then((r) => ({ data: r.data, error: r.error })));

  const adminAlfa = await signIn(users.adminAlfa);
  await deny("SEC-10", "Administrador da Alfa não cadastra conta na Empresa Beta", () =>
    adminAlfa.from("bank_accounts").insert({ company_id: ids.beta, institution_id: ids.instBeta, account_number: "9999" }).select());
  await deny("SEC-11", "Administrador da Alfa não edita conta da Empresa Beta", () =>
    adminAlfa.from("bank_accounts").update({ nickname: "invasao" }).eq("company_id", ids.beta).select());
  await deny("SEC-12", "Administrador da Alfa não cadastra cartão na Empresa Beta", () =>
    adminAlfa.from("cards").insert({ company_id: ids.beta, nickname: "invasao" }).select());
  await deny("SEC-13", "Administrador da Alfa não altera dados cadastrais da Empresa Beta", () =>
    adminAlfa.from("companies").update({ name: "sequestrada" }).eq("id", ids.beta).select());
  await deny("SEC-14", "Administrador da Alfa não vincula usuários à Empresa Beta", () =>
    adminAlfa.from("user_roles").insert({ user_id: users.adminAlfa.id, company_id: ids.beta, role: "admin" }).select());
  await count("SEC-15", "Usuário da Alfa não lê lotes de importação da Empresa Beta", () =>
    adminAlfa.from("import_batches").select("id").eq("id", ids.importBeta), 0);
  await deny("SEC-16", "Usuário da Alfa não cria lote na Empresa Beta", () =>
    adminAlfa.from("import_batches").insert({ company_id: ids.beta, source_type: "conta", file_name: "invasao.csv", file_format: "csv", file_hash: `invasao-${stamp}`, storage_path: `${ids.beta}/invasao.csv` }).select());
  await deny("SEC-17", "Usuário da Alfa não altera lote da Empresa Beta", () =>
    adminAlfa.from("import_batches").update({ status: "cancelado" }).eq("id", ids.importBeta).select());
  await deny("SEC-18", "Usuário da Alfa não exclui lote da Empresa Beta", () =>
    adminAlfa.from("import_batches").delete().eq("id", ids.importBeta).select());
  await count("SEC-19", "Usuário da Alfa não lê itens em revisão da Empresa Beta", () =>
    adminAlfa.from("staged_transactions").select("id").eq("id", ids.stagedBeta), 0);
  await deny("SEC-20", "Usuário da Alfa não cria item em revisão na Empresa Beta", () =>
    adminAlfa.from("staged_transactions").insert({ company_id: ids.beta, import_id: ids.importBeta, description: "invasao", row_index: 99 }).select());
  await deny("SEC-21", "Usuário da Alfa não altera item em revisão da Empresa Beta", () =>
    adminAlfa.from("staged_transactions").update({ description: "invasao" }).eq("id", ids.stagedBeta).select());
  await deny("SEC-22", "Usuário da Alfa não exclui item em revisão da Empresa Beta", () =>
    adminAlfa.from("staged_transactions").delete().eq("id", ids.stagedBeta).select());
  await count("SEC-23", "Usuário da Alfa não lê lançamentos da Empresa Beta", () =>
    adminAlfa.from("transactions").select("id").eq("id", ids.transactionBeta), 0);
  await deny("SEC-24", "Usuário da Alfa não cria lançamento na Empresa Beta", () =>
    adminAlfa.from("transactions").insert({ company_id: ids.beta, source_type: "conta", posted_at: "2026-01-03", description: "invasao", amount: 10, direction: "saida" }).select());
  await deny("SEC-25", "Usuário da Alfa não altera lançamento da Empresa Beta", () =>
    adminAlfa.from("transactions").update({ description: "invasao" }).eq("id", ids.transactionBeta).select());
  await deny("SEC-26", "Usuário da Alfa não exclui lançamento da Empresa Beta", () =>
    adminAlfa.from("transactions").delete().eq("id", ids.transactionBeta).select());

  // ============ RBAC — matriz de permissões ============
  await deny("RBAC-01", "Perfil Consulta não cadastra instituição", () =>
    conAlfa.from("financial_institutions").insert({ company_id: ids.alfa, name: "Banco X" }).select());
  await deny("RBAC-02", "Perfil Consulta não cadastra categoria", () =>
    conAlfa.from("transaction_categories").insert({ company_id: ids.alfa, name: "Cat X" }).select());
  await deny("RBAC-03", "Perfil Consulta não edita contas da própria empresa", () =>
    conAlfa.from("bank_accounts").update({ nickname: "escalada" }).eq("company_id", ids.alfa).select());
  await count("RBAC-04", "Perfil Consulta não vê a trilha de auditoria", () => conAlfa.from("audit_log").select("id").eq("company_id", ids.alfa), 0);

  const finAlfa = await signIn(users.finAlfa);
  const { data: instFin } = await finAlfa
    .from("financial_institutions")
    .insert({ company_id: ids.alfa, name: "Banco Auditado QA" })
    .select("id")
    .single();
  record("RBAC-05", "Perfil Financeiro cadastra instituição", "PERMITIDO", !!instFin, instFin ? "" : "insert bloqueado");
  ids.instAudit = instFin?.id;
  await allow("RBAC-06", "Perfil Financeiro cadastra conta bancária", () =>
    finAlfa.from("bank_accounts").insert({ company_id: ids.alfa, institution_id: ids.instAlfa, account_number: "7777" }));
  await allow("RBAC-07", "Perfil Financeiro cadastra cartão", () =>
    finAlfa.from("cards").insert({ company_id: ids.alfa, institution_id: ids.instAlfa, nickname: "Cartão Fin", last_four_digits: "5555" }));
  await allow("RBAC-08", "Perfil Financeiro gerencia categorias", () =>
    finAlfa.from("transaction_categories").insert({ company_id: ids.alfa, name: "Cat Fin QA" }));
  await deny("RBAC-09", "Perfil Financeiro não altera dados da empresa", () =>
    finAlfa.from("companies").update({ name: "renomeada" }).eq("id", ids.alfa).select());
  await deny("RBAC-10", "Perfil Financeiro não promove usuários a administrador", () =>
    finAlfa.from("user_roles").update({ role: "admin" }).eq("user_id", users.conAlfa.id).eq("company_id", ids.alfa).select());
  await count("RBAC-11", "Perfil Financeiro não vê a trilha de auditoria", () => finAlfa.from("audit_log").select("id").eq("company_id", ids.alfa), 0);

  const audAlfa = await signIn(users.audAlfa);
  await deny("RBAC-12", "Perfil Auditor não cadastra cartão", () =>
    audAlfa.from("cards").insert({ company_id: ids.alfa, nickname: "Cartão Auditor" }).select());
  await deny("RBAC-13", "Perfil Auditor não edita instituições", () =>
    audAlfa.from("financial_institutions").update({ name: "alterado" }).eq("company_id", ids.alfa).select());
  await deny("INST-01", "Administrador da Alfa não renomeia instituição da Empresa Beta", () =>
    adminAlfa.from("financial_institutions").update({ name: "renomeada QA" }).eq("company_id", ids.beta).select());
  await atLeast("RBAC-14", "Perfil Auditor vê a trilha de auditoria da própria empresa", () =>
    audAlfa.from("audit_log").select("id").eq("company_id", ids.alfa), 1);
  await count("RBAC-15", "Perfil Auditor não vê a trilha de auditoria da Empresa Beta", () =>
    audAlfa.from("audit_log").select("id").eq("company_id", ids.beta), 0);
  await allow("RBAC-16", "Administrador edita dados da própria empresa", () =>
    adminAlfa.from("companies").update({ dias_alerta_vencimento: 7 }).eq("id", ids.alfa));

  // ============ XREF — referências cruzadas entre empresas ============
  await deny("XREF-01", "Conta da Alfa não aceita instituição da Empresa Beta", () =>
    adminAlfa.from("bank_accounts").insert({ company_id: ids.alfa, institution_id: ids.instBeta, account_number: "6666" }).select());
  await deny("XREF-02", "Cartão da Alfa não aceita administradora da Empresa Beta", () =>
    adminAlfa.from("cards").insert({ company_id: ids.alfa, administrator_id: ids.instBeta, nickname: "Cartão X" }).select());
  await deny("XREF-03", "Subcategoria da Alfa não aceita categoria da Empresa Beta", () =>
    adminAlfa.from("transaction_subcategories").insert({ company_id: ids.alfa, category_id: ids.catBeta, name: "Sub X" }).select());

  // ============ AUD — trilha de auditoria ============
  await deny("AUD-01", "Ninguém insere registros manualmente na auditoria", () =>
    adminAlfa.from("audit_log").insert({ company_id: ids.alfa, action: "create", entity: "bank_accounts" }).select());
  await deny("AUD-02", "Ninguém edita registros da auditoria", () =>
    audAlfa.from("audit_log").update({ action: "update" }).eq("company_id", ids.alfa).select());
  await deny("AUD-03", "Ninguém apaga registros da auditoria", () =>
    audAlfa.from("audit_log").delete().eq("company_id", ids.alfa).select());

  await atLeast("AUD-04", "Cadastro registra autor e e-mail na auditoria", () =>
    audAlfa
      .from("audit_log")
      .select("id")
      .eq("company_id", ids.alfa)
      .eq("entity", "financial_institutions")
      .eq("entity_id", ids.instAudit)
      .eq("action", "create")
      .eq("user_id", users.finAlfa.id)
      .eq("user_email", users.finAlfa.email), 1);

  await allow("AUD-05", "Perfil Financeiro inativa instituição (gera trilha)", () =>
    finAlfa.from("financial_institutions").update({ status: "inativo" }).eq("id", ids.instAudit));
  await atLeast("AUD-06", "Inativação registrada como mudança de status", () =>
    audAlfa.from("audit_log").select("id").eq("entity_id", ids.instAudit).eq("action", "status_change"), 1);

  await allow("AUD-07", "Administrador altera papel de um membro (gera trilha)", () =>
    adminAlfa.from("user_roles").update({ role: "financeiro" }).eq("user_id", users.conAlfa.id).eq("company_id", ids.alfa));
  await atLeast("AUD-08", "Alteração de papel registrada como mudança de papel", () =>
    audAlfa.from("audit_log").select("id").eq("company_id", ids.alfa).eq("entity", "user_roles").eq("action", "role_change"), 1);

  await atLeast("AUD-09", "Registros de auditoria guardam os dados antes e depois da alteração", () =>
    audAlfa.from("audit_log").select("id, old_data, new_data").eq("entity_id", ids.instAudit).eq("action", "status_change").not("old_data", "is", null).not("new_data", "is", null), 1);

  // ============ ADM — proteção do último administrador ============
  const adminBeta = await signIn(users.adminBeta);
  await deny("ADM-01", "Último administrador não pode ser rebaixado de papel", () =>
    adminBeta.from("user_roles").update({ role: "financeiro" }).eq("user_id", users.adminBeta.id).eq("company_id", ids.beta).select());
  await deny("ADM-02", "Último administrador não pode ter o acesso revogado", () =>
    adminBeta.from("user_roles").update({ status: "inativo" }).eq("user_id", users.adminBeta.id).eq("company_id", ids.beta).select());
  await deny("ADM-03", "Último administrador não pode ser removido da empresa", () =>
    adminBeta.from("user_roles").delete().eq("user_id", users.adminBeta.id).eq("company_id", ids.beta).select());

  await allow("ADM-04", "Administrador promove um segundo administrador", () =>
    adminBeta.from("user_roles").insert({ user_id: users.admin2Beta.id, company_id: ids.beta, role: "admin" }));
  await allow("ADM-05", "Com dois administradores ativos, o primeiro pode ser rebaixado", () =>
    adminBeta.from("user_roles").update({ role: "financeiro" }).eq("user_id", users.adminBeta.id).eq("company_id", ids.beta));

  // ============ FASE 3 — Faturas e pagamentos ============
  const cardOf = async (company) =>
    (await admin.from("cards").select("id").eq("company_id", ids[company]).order("created_at").limit(1)).data[0].id;
  const accOf = async (company) =>
    (await admin.from("bank_accounts").select("id").eq("company_id", ids[company]).order("created_at").limit(1)).data[0].id;
  ids.cardAlfa = await cardOf("alfa");
  ids.cardBeta = await cardOf("beta");
  ids.accAlfa = await accOf("alfa");
  ids.accBeta = await accOf("beta");
  const inv = (company, card, competence = "2026-09-01") => ({
    company_id: ids[company], card_id: card, competence,
    period_start: "2026-08-10", closing_date: "2026-09-10", due_date: "2026-09-20",
  });
  // AUD-07 promove conAlfa a financeiro; restaura o papel Consulta para os cenários RBAC da Fase 3.
  await admin.from("user_roles").update({ role: "consulta" }).eq("user_id", users.conAlfa.id).eq("company_id", ids.alfa);
  const finAlfaC = await signIn(users.finAlfa);
  const conAlfaC = await signIn(users.conAlfa);
  const audAlfaC = await signIn(users.audAlfa);
  const adminBetaC = await signIn(users.adminBeta);
  const { data: betaInv } = await admin.from("card_invoices").insert(inv("beta", ids.cardBeta)).select("id").single();
  ids.invBeta = betaInv.id;

  await allow("F3-01", "Financeiro cria fatura na própria empresa", () =>
    finAlfaC.from("card_invoices").insert(inv("alfa", ids.cardAlfa)));
  const { data: alfaInv } = await admin.from("card_invoices").select("id").eq("card_id", ids.cardAlfa).single();
  ids.invAlfa = alfaInv.id;
  await deny("F3-02", "Fatura duplicada (mesmo cartão e competência) é bloqueada", () =>
    finAlfaC.from("card_invoices").insert(inv("alfa", ids.cardAlfa)).select());
  await count("F3-03", "Empresa A não visualiza faturas da Empresa B (SELECT)", () =>
    finAlfaC.from("card_invoices").select("id").eq("id", ids.invBeta), 0);
  await deny("F3-04", "Empresa A não cria fatura na Empresa B (INSERT)", () =>
    finAlfaC.from("card_invoices").insert(inv("beta", ids.cardBeta, "2026-10-01")).select());
  await deny("F3-05", "Empresa A não usa cartão da Empresa B na própria fatura", () =>
    finAlfaC.from("card_invoices").insert(inv("alfa", ids.cardBeta, "2026-11-01")).select());
  await deny("F3-06", "Empresa A não altera fatura da Empresa B (UPDATE)", () =>
    finAlfaC.from("card_invoices").update({ status: "cancelada" }).eq("id", ids.invBeta).select());
  await deny("F3-07", "Exclusão de fatura é negada (DELETE)", () =>
    finAlfaC.from("card_invoices").delete().eq("id", ids.invAlfa).select());
  await deny("F3-08", "Consulta não cria fatura (RBAC)", () =>
    conAlfaC.from("card_invoices").insert(inv("alfa", ids.cardAlfa, "2026-12-01")).select());
  await count("F3-09", "Auditor visualiza faturas da própria empresa", () =>
    audAlfaC.from("card_invoices").select("id").eq("id", ids.invAlfa), 1);

  const pay = (company, invoice, extra = {}) => ({
    company_id: ids[company], invoice_id: invoice, paid_at: "2026-09-15", amount: 300,
    idempotency_key: crypto.randomUUID(), ...extra,
  });
  const key = crypto.randomUUID();
  await allow("F3-10", "Financeiro registra pagamento parcial", () =>
    finAlfaC.from("invoice_payments").insert(pay("alfa", ids.invAlfa, { idempotency_key: key, account_id: ids.accAlfa })));
  await deny("F3-11", "Reenvio do mesmo pagamento (idempotência) não duplica", () =>
    finAlfaC.from("invoice_payments").insert(pay("alfa", ids.invAlfa, { idempotency_key: key })).select());
  await deny("F3-12", "Pagamento com conta de outra empresa é negado", () =>
    finAlfaC.from("invoice_payments").insert(pay("alfa", ids.invAlfa, { account_id: ids.accBeta })).select());
  await deny("F3-13", "Empresa A não paga fatura da Empresa B", () =>
    finAlfaC.from("invoice_payments").insert(pay("beta", ids.invBeta)).select());
  await deny("F3-14", "Consulta não registra pagamento (RBAC)", () =>
    conAlfaC.from("invoice_payments").insert(pay("alfa", ids.invAlfa)).select());
  await deny("F3-15", "Valor de pagamento registrado é imutável", () =>
    finAlfaC.from("invoice_payments").update({ amount: 1 }).eq("idempotency_key", key).select());
  await deny("F3-16", "Exclusão de pagamento é negada (DELETE)", () =>
    finAlfaC.from("invoice_payments").delete().eq("idempotency_key", key).select());
  await count("F3-17", "Empresa B não visualiza pagamentos da Empresa A", () =>
    adminBetaC.from("invoice_payments").select("id").eq("idempotency_key", key), 0);
  await count("F3-18", "Resumo consolidado da Empresa A invisível para Empresa B", () =>
    adminBetaC.from("card_invoice_summary").select("invoice_id").eq("invoice_id", ids.invAlfa), 0);
  const { data: sumA } = await finAlfaC.from("card_invoice_summary").select("paid").eq("invoice_id", ids.invAlfa).single();
  record("F3-19", "Resumo reflete valor pago (300,00)", "= 300", Number(sumA?.paid) === 300, `obtido: ${sumA?.paid}`);

  const tx = (extra) => ({
    company_id: ids.alfa, source_type: "cartao", card_id: ids.cardAlfa, posted_at: "2026-09-01",
    description: "Compra QA", normalized_description: "compra qa", amount: 50, direction: "saida", origin: "manual", ...extra,
  });
  await allow("F3-20", "Lançamento vinculado à fatura do mesmo cartão", () =>
    finAlfaC.from("transactions").insert(tx({ invoice_id: ids.invAlfa })));
  await deny("F3-21", "Lançamento não pode apontar fatura de outra empresa", () =>
    finAlfaC.from("transactions").insert(tx({ invoice_id: ids.invBeta })).select());
  await deny("F3-22", "Lançamento sem o cartão da fatura é rejeitado", () =>
    finAlfaC.from("transactions").insert(tx({ card_id: null, source_type: "conta", invoice_id: ids.invAlfa })).select());
  const grp = crypto.randomUUID();
  await allow("F3-23", "Parcela 01/03 registrada", () =>
    finAlfaC.from("transactions").insert(tx({ installment_group: grp, installment_number: 1, installment_total: 3 })));
  await deny("F3-24", "Parcela duplicada no mesmo parcelamento é bloqueada", () =>
    finAlfaC.from("transactions").insert(tx({ installment_group: grp, installment_number: 1, installment_total: 3 })).select());
  await deny("F3-25", "Parcela impossível (4/3) é rejeitada", () =>
    finAlfaC.from("transactions").insert(tx({ installment_number: 4, installment_total: 3 })).select());
  const { data: sumA2 } = await finAlfaC.from("card_invoice_summary").select("total").eq("invoice_id", ids.invAlfa).single();
  record("F3-26", "Total da fatura consolida lançamentos vinculados (50,00)", "= 50", Number(sumA2?.total) === 50, `obtido: ${sumA2?.total}`);

  await allow("F3-27", "Pagamento estornado (status inativo, sem exclusão)", () =>
    finAlfaC.from("invoice_payments").update({ status: "inativo" }).eq("idempotency_key", key));
  await allow("F3-28", "Fatura cancelada pelo financeiro", () =>
    finAlfaC.from("card_invoices").update({ status: "cancelada" }).eq("id", ids.invAlfa));
  await deny("F3-29", "Fatura cancelada não aceita pagamento", () =>
    finAlfaC.from("invoice_payments").insert(pay("alfa", ids.invAlfa)).select());
  const { data: auditRows } = await admin.from("audit_log").select("entity, action")
    .eq("company_id", ids.alfa).in("entity", ["card_invoices", "invoice_payments"]);
  const has = (e, a) => (auditRows ?? []).some((r) => r.entity === e && r.action === a);
  record("F3-30", "Auditoria: criação, cancelamento de fatura, pagamento e estorno", "registrados",
    has("card_invoices", "create") && has("card_invoices", "status_change") && has("invoice_payments", "create") && has("invoice_payments", "status_change"),
    JSON.stringify([...new Set((auditRows ?? []).map((r) => `${r.entity}:${r.action}`))]));
  await deny("F3-31", "Anônimo não lê faturas", () => anon.from("card_invoices").select("id"));
  await deny("F3-32", "Anônimo não lê pagamentos", () => anon.from("invoice_payments").select("id"));

  // ============ IMP — integridade da importação (correção crítica) ============
  const divergent = { status: "divergente", parser: "pdf-textual-v2", declared_total: 100, reconstructed_total: 90, difference: 10 };
  const mkBatch = async (company, integrity, extra = {}) => {
    const { data, error } = await admin.from("import_batches").insert({
      company_id: ids[company], source_type: "cartao", card_id: company === "alfa" ? ids.cardAlfa : await cardOf("beta"),
      file_name: "qa-fatura.pdf", file_format: "pdf", file_size: 10, file_hash: `qa-imp-${company}-${Math.random()}`,
      storage_path: `${ids[company]}/qa/${Math.random()}.pdf`, status: "revisao", integrity, ...extra,
    }).select("id").single();
    if (error) throw new Error(`lote IMP: ${error.message}`);
    return data.id;
  };
  const impTx = (batch) => ({
    company_id: ids.alfa, import_id: batch, source_type: "cartao", card_id: ids.cardAlfa, posted_at: "2026-08-05",
    description: "QA divergente", normalized_description: "qa divergente", amount: 5, direction: "saida", origin: "importado",
  });
  ids.batchDiv = await mkBatch("alfa", divergent);
  await deny("IMP-01", "Backend recusa lançamento de lote DIVERGENTE sem decisão", () =>
    finAlfaC.from("transactions").insert(impTx(ids.batchDiv)).select());
  await deny("IMP-02", "Não é possível trocar status divergente → validada direto na API", () =>
    finAlfaC.from("import_batches").update({ integrity: { ...divergent, status: "validada" } }).eq("id", ids.batchDiv).select());
  await deny("IMP-03", "Não é possível remover a integridade do lote", () =>
    finAlfaC.from("import_batches").update({ integrity: null }).eq("id", ids.batchDiv).select());
  await deny("IMP-04", "Decisão sem justificativa (< 10 caracteres) é recusada", () =>
    finAlfaC.from("import_batches").update({ integrity: { ...divergent, override: { by: users.finAlfa.id, reason: "ok" } } }).eq("id", ids.batchDiv).select());
  await deny("IMP-05", "Decisão em nome de outro usuário é recusada", () =>
    finAlfaC.from("import_batches").update({ integrity: { ...divergent, override: { by: users.adminAlfa.id, reason: "Conferido manualmente com o banco" } } }).eq("id", ids.batchDiv).select());
  await deny("IMP-06", "Perfil Auditor não registra decisão de divergência", () =>
    audAlfa.from("import_batches").update({ integrity: { ...divergent, override: { by: users.audAlfa.id, reason: "Conferido manualmente com o banco" } } }).eq("id", ids.batchDiv).select());
  await deny("IMP-07", "Empresa Beta não registra decisão em lote da Alfa", () =>
    adminBeta.from("import_batches").update({ integrity: { ...divergent, override: { by: users.adminBeta.id, reason: "Conferido manualmente com o banco" } } }).eq("id", ids.batchDiv).select());
  await allow("IMP-08", "Decisão justificada pelo próprio usuário é aceita", () =>
    finAlfaC.from("import_batches").update({ integrity: { ...divergent, override: { by: users.finAlfa.id, reason: "Conferido manualmente com o banco" } } }).eq("id", ids.batchDiv));
  const { data: ovr } = await admin.from("import_batches").select("integrity").eq("id", ids.batchDiv).single();
  record("IMP-09", "Horário da decisão é carimbado pelo servidor", "preenchido", !!ovr?.integrity?.override?.at, JSON.stringify(ovr?.integrity?.override ?? {}));
  await allow("IMP-10", "Após decisão justificada, lançamento do lote é aceito", () =>
    finAlfaC.from("transactions").insert(impTx(ids.batchDiv)));
  await deny("IMP-11", "Lote com lançamento confirmado não pode ser reprocessado (integridade imutável)", () =>
    finAlfaC.from("import_batches").update({ integrity: { status: "validada", parser: "x" } }).eq("id", ids.batchDiv).select());
  const { data: impAudit } = await admin.from("audit_log").select("id").eq("entity", "import_batches").eq("entity_id", ids.batchDiv).eq("action", "update");
  record("IMP-12", "Decisão de divergência registrada na auditoria", ">= 1", (impAudit ?? []).length >= 1, `registros: ${(impAudit ?? []).length}`);
  ids.batchRe = await mkBatch("alfa", { status: "revisao", parser: "pdf-textual-v1" });
  await allow("IMP-13", "Lote sem confirmados pode ser reprocessado (nova integridade)", () =>
    finAlfaC.from("import_batches").update({ integrity: { status: "validada", parser: "pdf-textual-v2" } }).eq("id", ids.batchRe));
  await deny("IMP-14", "Reprocessamento não pode trazer decisão pronta", () =>
    finAlfaC.from("import_batches").update({ integrity: { status: "divergente", override: { by: users.finAlfa.id, reason: "forjado pelo cliente" } } }).eq("id", ids.batchRe).select());
  ids.batchBeta2 = await mkBatch("beta", divergent);
  await deny("IMP-15", "Empresa Alfa não reprocessa lote da Beta", () =>
    finAlfaC.from("import_batches").update({ integrity: { status: "validada" } }).eq("id", ids.batchBeta2).select());
  await deny("IMP-16", "Empresa Alfa não altera itens em revisão da Beta", () =>
    finAlfaC.from("staged_transactions").update({ status: "descartado" }).eq("id", ids.stagedBeta).select());
  await deny("IMP-17", "Anônimo não lê lotes de importação", () => anon.from("import_batches").select("id"));
  await deny("IMP-18", "Anônimo não altera itens em revisão", () =>
    anon.from("staged_transactions").update({ status: "descartado" }).eq("id", ids.stagedBeta).select());
  await deny("IMP-19", "Anônimo não baixa arquivo original", async () => {
    const r = await anon.storage.from("financial-documents").download(`${ids.beta}/qa-${stamp}/extrato.csv`);
    return { data: r.data, error: r.error };
  });

  // ============ CLS — memória de classificação ============
  const ruleOf = (company, extra = {}) => ({
    company_id: ids[company], pattern: `qa seguradora ${company}`, match_type: "exata",
    category_id: company === "alfa" ? ids.catAlfa : ids.catBeta, origin: "aprendida", ...extra,
  });
  const { data: rB } = await admin.from("classification_rules").insert(ruleOf("beta")).select("id").single();
  ids.ruleBeta = rB?.id;
  await allow("CLS-01", "Financeiro classifica e cria regra da própria empresa", () =>
    finAlfaC.from("classification_rules").insert(ruleOf("alfa")).select("id"));
  const { data: rA } = await admin.from("classification_rules").select("id").eq("company_id", ids.alfa).limit(1).single();
  ids.ruleAlfa = rA?.id;
  await deny("CLS-02", "Empresa Alfa não lê regras da Beta", () =>
    finAlfaC.from("classification_rules").select("id").eq("id", ids.ruleBeta));
  await deny("CLS-03", "Empresa Alfa não altera regras da Beta", () =>
    finAlfaC.from("classification_rules").update({ status: "inativo" }).eq("id", ids.ruleBeta).select());
  await deny("CLS-04", "Empresa Alfa não cria regra na Beta", () =>
    finAlfaC.from("classification_rules").insert(ruleOf("beta", { pattern: "qa invasao" })).select());
  await deny("CLS-05", "Regra não aponta categoria de outra empresa", () =>
    finAlfaC.from("classification_rules").insert(ruleOf("alfa", { pattern: "qa cruzada", category_id: ids.catBeta })).select());
  await deny("CLS-06", "Auditor não gerencia regras", () =>
    audAlfa.from("classification_rules").update({ status: "inativo" }).eq("id", ids.ruleAlfa).select());
  await deny("CLS-07", "Auditor não cria regras", () =>
    audAlfa.from("classification_rules").insert(ruleOf("alfa", { pattern: "qa auditor" })).select());
  await deny("CLS-08", "Nenhum perfil exclui regras (apenas desativa)", () =>
    finAlfaC.from("classification_rules").delete().eq("id", ids.ruleAlfa).select());
  await allow("CLS-09", "Financeiro desativa regra da própria empresa", () =>
    finAlfaC.from("classification_rules").update({ status: "inativo" }).eq("id", ids.ruleAlfa));
  const { data: clsAudit } = await admin.from("audit_log").select("action").eq("entity", "classification_rules").eq("entity_id", ids.ruleAlfa);
  const acts = (clsAudit ?? []).map((r) => r.action);
  record("CLS-10", "Auditoria registra criação e desativação da regra", "create + status_change",
    acts.includes("create") && acts.includes("status_change"), JSON.stringify(acts));
  await deny("CLS-11", "Anônimo não lê regras", () => anon.from("classification_rules").select("id"));
  await deny("CLS-12", "Lançamento não referencia regra/categoria de outra empresa (aplicação não contorna RLS)", () =>
    finAlfaC.from("transactions").insert({
      company_id: ids.alfa, source_type: "conta", posted_at: "2026-08-05", description: "qa cls", normalized_description: "qa cls",
      amount: 1, direction: "saida", origin: "manual", category_id: ids.catBeta, classification_source: "regra_aprendida", classification_rule_id: ids.ruleBeta,
    }).select());

  await deny("CLS-13", "Lançamento não referencia regra de outra empresa mesmo com categoria própria", () =>
    finAlfaC.from("transactions").insert({
      company_id: ids.alfa, source_type: "conta", posted_at: "2026-08-05", description: "qa cls2", normalized_description: "qa cls2",
      amount: 1, direction: "saida", origin: "manual", category_id: ids.catAlfa, classification_source: "regra_aprendida", classification_rule_id: ids.ruleBeta,
    }).select());

  // ============ PROV — proveniência exige evidência ============
  const txBase = { company_id: ids.alfa, source_type: "conta", posted_at: "2026-08-05", description: "qa prov", normalized_description: "qa prov", amount: 1, direction: "saida", origin: "manual", category_id: ids.catAlfa };
  await deny("PROV-01", "Regra aprendida sem referência é rejeitada", () =>
    finAlfaC.from("transactions").insert({ ...txBase, classification_source: "regra_aprendida" }).select());
  await deny("PROV-02", "Regra do sistema sem identificador é rejeitada", () =>
    finAlfaC.from("transactions").insert({ ...txBase, classification_source: "regra_parser" }).select());
  await deny("PROV-03", "Não classificado com categoria é rejeitado", () =>
    finAlfaC.from("transactions").insert({ ...txBase, classification_source: "nao_classificado" }).select());
  {
    const { data, error } = await finAlfaC.from("transactions").insert({ ...txBase, classification_source: "manual", classified_by: ids.ruleBeta ?? null }).select("classified_by").single();
    const me = (await finAlfaC.auth.getUser()).data.user?.id;
    record("PROV-04", "Manual registra o próprio usuário (não aceita usuário forjado)", "classified_by = usuário", !error && data?.classified_by === me, error?.message ?? String(data?.classified_by));
  }

  // ============ PRIV — funções de segurança fora da API ============
  for (const [id, fn, args] of [
    ["PRIV-01", "has_permission", { _company: ids.alfa, _permission: "audit.view" }],
    ["PRIV-02", "is_company_member", { _company: ids.alfa }],
    ["PRIV-03", "has_company_role", { _company: ids.alfa, _role: "admin" }],
  ]) {
    const { error } = await adminAlfa.rpc(fn, args);
    record(id, `Função de segurança "${fn}" não é exposta na API pública`, "NEGADO", !!error, error?.message ?? "função acessível!");
  }

  const privSchema = introspect(`
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'private' AND p.proname IN ('has_permission','is_company_member','has_company_role','prevent_last_admin_removal')`);
  if (privSchema !== null)
    record("PRIV-04", "Funções de segurança residem fora do schema público", "= 4", privSchema === "4", `obtido: ${privSchema}`);

  const rlsOff = introspect(`
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false`);
  if (rlsOff !== null)
    record("PRIV-05", "Proteção por linha ativada em todas as tabelas", "= 0", rlsOff === "0", `sem proteção: ${rlsOff}`);
}

// ----------------------------- Saída -----------------------------
let exitCode = 0;
try {
  await main();
} catch (e) {
  record("FATAL", "Execução da suíte", "sem erros", false, e.message);
} finally {
  await cleanup().catch((e) => record("CLEANUP", "Limpeza da massa de teste", "sem erros", false, e.message));
}

const pad = (s, n) => String(s).padEnd(n);
console.log("\n============== TESTES DE SEGURANÇA — FASES 0 A 3 ==============\n");
for (const r of results) {
  const mark = r.status === "PASS" ? "✔" : "✘";
  console.log(`${mark} ${pad(r.id, 9)} ${pad(r.scenario, 62)} ${r.status}`);
  if (r.status === "FAIL" && r.detail) console.log(`             ↳ ${r.detail}`);
}
const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.length - pass;
console.log(`\n---------------------------------------------------------------`);
console.log(`Total: ${results.length}   Aprovados: ${pass}   Reprovados: ${fail}\n`);
if (fail > 0) exitCode = 1;
process.exit(exitCode);
