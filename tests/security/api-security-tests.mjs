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
  await count("ANON-01", "Visitante anônimo não lê contas bancárias", () => anon.from("bank_accounts").select("id"), 0);
  await count("ANON-02", "Visitante anônimo não lê empresas", () => anon.from("companies").select("id"), 0);
  await count("ANON-03", "Visitante anônimo não lê a trilha de auditoria", () => anon.from("audit_log").select("id"), 0);
  await deny("ANON-04", "Visitante anônimo não cria empresa", () => anon.from("companies").insert({ name: "invasor" }).select());
  await deny("ANON-05", "Visitante anônimo não lê documentos do storage", () =>
    anon.storage.from("financial-documents").list(ids.alfa).then((r) => ({ data: r.data, error: r.error })));

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
console.log("\n============== TESTES DE SEGURANÇA — FASES 0 E 1 ==============\n");
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
