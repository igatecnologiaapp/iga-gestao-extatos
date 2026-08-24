-- ============================================================================
-- Suíte de testes de segurança — Fases 0 e 1 — App "Gestor de Extratos"
-- Uso:  bun run test:security
--       (ou: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f tests/security/foundation-tests.sql)
--
-- Cobertura:
--   GRANT  — privilégios da Data API nas tabelas públicas
--   STO    — bucket privado e políticas de storage
--   SEC    — isolamento multiempresa (RLS) entre Empresa Alfa e Empresa Beta
--   RBAC   — matriz de permissões por papel (admin, financeiro, consulta, auditor)
--   XREF   — integridade de referências dentro da mesma empresa (triggers)
--   AUD    — trilha de auditoria: geração automática e imutabilidade
--   ADM    — proteção do último administrador ativo (trigger de banco)
--   PRIV   — funções de segurança fora da API pública (schema private)
--   ANON   — nenhum acesso anônimo
--
-- Tudo roda dentro de uma transação revertida ao final (ROLLBACK):
-- nenhum dado real é criado, alterado ou removido.
-- ============================================================================

\set QUIET on
\pset footer off

BEGIN;

-- ===================== Infraestrutura de teste =====================
CREATE SCHEMA test_lab;

CREATE TABLE test_lab.results (
  id text,
  scenario text,
  expected text,
  status text,
  detail text DEFAULT ''
);

-- SECURITY DEFINER: registra resultados mesmo quando o papel ativo é authenticated/anon
CREATE FUNCTION test_lab.rec(p_id text, p_scenario text, p_expected text, p_ok boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO test_lab.results
  VALUES (p_id, p_scenario, p_expected, CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, left(coalesce(p_detail, ''), 140));
END $$;

-- As funções abaixo são SECURITY INVOKER de propósito: o SQL testado roda
-- com o papel ativo (authenticated/anon), sujeito a GRANTs e RLS reais.
CREATE FUNCTION test_lab.run(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN NULL; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $$;

CREATE FUNCTION test_lab.scalar(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN EXECUTE p_sql INTO n; RETURN n; EXCEPTION WHEN OTHERS THEN RETURN -1; END $$;

CREATE FUNCTION test_lab.deny(p_id text, p_scenario text, p_sql text, p_match text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE err text := test_lab.run(p_sql);
BEGIN
  PERFORM test_lab.rec(p_id, p_scenario, 'NEGADO',
    err IS NOT NULL AND (p_match IS NULL OR err ILIKE '%' || p_match || '%'),
    coalesce(err, 'operação PERMITIDA indevidamente'));
END $$;

CREATE FUNCTION test_lab.allow(p_id text, p_scenario text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE err text := test_lab.run(p_sql);
BEGIN
  PERFORM test_lab.rec(p_id, p_scenario, 'PERMITIDO', err IS NULL, coalesce(err, ''));
END $$;

CREATE FUNCTION test_lab.eq(p_id text, p_scenario text, p_sql text, p_expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE got bigint := test_lab.scalar(p_sql);
BEGIN
  PERFORM test_lab.rec(p_id, p_scenario, '= ' || p_expected, got = p_expected, 'obtido: ' || got);
END $$;

CREATE FUNCTION test_lab.impersonate(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
END $$;

GRANT USAGE ON SCHEMA test_lab TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_lab TO authenticated, anon;

-- ===================== Massa de dados (superusuário, RLS não se aplica) =====================
INSERT INTO public.companies (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Empresa Alfa (teste)'),
  ('22222222-2222-2222-2222-222222222222', 'Empresa Beta (teste)');

INSERT INTO public.profiles (id, full_name, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Admin Alfa', 'admin.alfa@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Fin Alfa',   'fin.alfa@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Con Alfa',   'con.alfa@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Aud Alfa',   'aud.alfa@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Admin Beta', 'admin.beta@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Admin Beta 2', 'admin2.beta@test.local');

INSERT INTO public.user_roles (user_id, company_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'financeiro'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'consulta'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'auditor'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin');

INSERT INTO public.financial_institutions (id, company_id, name) VALUES
  ('cccccccc-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Banco Alfa'),
  ('cccccccc-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Banco Beta');

INSERT INTO public.bank_accounts (id, company_id, institution_id, account_number) VALUES
  ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-00000000000a', '1001'),
  ('dddddddd-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'cccccccc-0000-0000-0000-00000000000b', '2002');

INSERT INTO public.cards (id, company_id, institution_id, administrator_id, nickname, last_four_digits) VALUES
  ('eeeeeeee-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-00000000000a', 'Cartão Alfa', '1234'),
  ('eeeeeeee-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'cccccccc-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-00000000000b', 'Cartão Beta', '9876');

INSERT INTO public.transaction_categories (id, company_id, name) VALUES
  ('ffffffff-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Categoria Alfa'),
  ('ffffffff-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Categoria Beta');

INSERT INTO public.transaction_subcategories (id, company_id, category_id, name) VALUES
  ('99999999-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-00000000000a', 'Sub Alfa'),
  ('99999999-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'ffffffff-0000-0000-0000-00000000000b', 'Sub Beta');

-- ===================== GRANTs e Storage (visão de superusuário) =====================
SELECT test_lab.eq('GRANT-01', 'Toda tabela pública tem privilégios para o papel authenticated',
  'SELECT count(*) FROM information_schema.tables t
    WHERE t.table_schema = ''public'' AND t.table_type = ''BASE TABLE''
      AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                      WHERE g.table_schema = ''public'' AND g.table_name = t.table_name
                        AND g.grantee = ''authenticated''
                        AND g.privilege_type IN (''SELECT'',''INSERT'',''UPDATE'',''DELETE''))', 0);

SELECT test_lab.eq('GRANT-02', 'Nenhum privilégio de dados concedido ao papel anon em tabelas públicas',
  'SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = ''public'' AND grantee = ''anon''
      AND privilege_type IN (''SELECT'',''INSERT'',''UPDATE'',''DELETE'')', 0);

SELECT test_lab.eq('STO-01', 'Bucket financial-documents existe e é privado',
  'SELECT count(*) FROM storage.buckets WHERE id = ''financial-documents'' AND public = false', 1);

SELECT test_lab.eq('STO-02', 'Storage possui políticas vinculadas ao bucket financial-documents',
  'SELECT CASE WHEN count(*) >= 1 THEN 1 ELSE 0 END FROM pg_policies
    WHERE schemaname = ''storage'' AND tablename = ''objects''
      AND (coalesce(qual, '''') LIKE ''%financial-documents%'' OR coalesce(with_check, '''') LIKE ''%financial-documents%'')', 1);

-- ===================== Testes como papel authenticated =====================
SET ROLE authenticated;

-- ---------- SEC: isolamento multiempresa ----------
SELECT test_lab.impersonate('aaaaaaaa-0000-0000-0000-000000000003'); -- consulta Alfa
SELECT test_lab.eq('SEC-01', 'Consulta Alfa não enxerga contas da Empresa Beta',
  'SELECT count(*) FROM bank_accounts WHERE company_id = ''22222222-2222-2222-2222-222222222222''', 0);
SELECT test_lab.eq('SEC-02', 'Consulta Alfa enxerga as contas da própria empresa',
  'SELECT count(*) FROM bank_accounts WHERE company_id = ''11111111-1111-1111-1111-111111111111''', 1);
SELECT test_lab.eq('SEC-03', 'Consulta Alfa não enxerga cartões da Empresa Beta',
  'SELECT count(*) FROM cards WHERE company_id = ''22222222-2222-2222-2222-222222222222''', 0);
SELECT test_lab.eq('SEC-04', 'Consulta Alfa não enxerga instituições da Empresa Beta',
  'SELECT count(*) FROM financial_institutions WHERE company_id = ''22222222-2222-2222-2222-222222222222''', 0);
SELECT test_lab.eq('SEC-05', 'Consulta Alfa não enxerga a Empresa Beta em si',
  'SELECT count(*) FROM companies WHERE id = ''22222222-2222-2222-2222-222222222222''', 0);
SELECT test_lab.eq('SEC-06', 'Consulta Alfa não enxerga vínculos de usuários da Empresa Beta',
  'SELECT count(*) FROM user_roles WHERE company_id = ''22222222-2222-2222-2222-222222222222''', 0);
SELECT test_lab.eq('SEC-07', 'Consulta Alfa não enxerga perfil de usuário de outra empresa',
  'SELECT count(*) FROM profiles WHERE id = ''bbbbbbbb-0000-0000-0000-000000000001''', 0);
SELECT test_lab.eq('SEC-08', 'Consulta Alfa não enxerga categorias/subcategorias da Empresa Beta',
  'SELECT (SELECT count(*) FROM transaction_categories WHERE company_id = ''22222222-2222-2222-2222-222222222222'')
       + (SELECT count(*) FROM transaction_subcategories WHERE company_id = ''22222222-2222-2222-2222-222222222222'')', 0);

SELECT test_lab.impersonate('aaaaaaaa-0000-0000-0000-000000000001'); -- admin Alfa
SELECT test_lab.deny('SEC-09', 'Admin Alfa NÃO consegue cadastrar conta na Empresa Beta',
  'INSERT INTO bank_accounts (company_id, institution_id, account_number) VALUES
   (''22222222-2222-2222-2222-222222222222'', ''cccccccc-0000-0000-0000-00000000000b'', ''9999'')',
  'row-level security');
SELECT test_lab.eq('SEC-10', 'Admin Alfa tentando editar conta da Beta não afeta nenhuma linha',
  'WITH u AS (UPDATE bank_accounts SET nickname = ''invasao''
              WHERE company_id = ''22222222-2222-2222-2222-222222222222'' RETURNING 1)
   SELECT count(*) FROM u', 0);
SELECT test_lab.eq('SEC-11', 'Consulta Alfa tentando editar conta da própria empresa não afeta linhas',
  'WITH u AS (UPDATE bank_accounts SET nickname = ''escalada''
              WHERE company_id = ''11111111-1111-1111-1111-111111111111'' RETURNING 1)
   SELECT count(*) FROM u', 0);
SELECT test_lab.deny('SEC-12', 'Admin Alfa NÃO consegue cadastrar cartão na Empresa Beta',
  'INSERT INTO cards (company_id, nickname) VALUES (''22222222-2222-2222-2222-222222222222'', ''invasao'')',
  'row-level security');

-- ---------- RBAC: matriz de permissões ----------
SELECT test_lab.impersonate('aaaaaaaa-0000-0000-0000-000000000003'); -- consulta Alfa
SELECT test_lab.deny('RBAC-01', 'Consulta NÃO pode cadastrar instituição',
  'INSERT INTO financial_institutions (company_id, name) VALUES (''11111111-1111-1111-1111-111111111111'', ''Banco X'')',
  'row-level security');
SELECT test_lab.deny('RBAC-02', 'Consulta NÃO pode cadastrar categoria',
  'INSERT INTO transaction_categories (company_id, name) VALUES (''11111111-1111-1111-1111-111111111111'', ''Cat X'')',
  'row-level security');
SELECT test_lab.eq('RBAC-03', 'Consulta NÃO vê a trilha de auditoria',
  'SELECT count(*) FROM audit_log', 0);

SELECT test_lab.impersonate('aaaaaaaa-0000-0000-0000-000000000002'); -- financeiro Alfa
SELECT test_lab.allow('RBAC-04', 'Financeiro PODE cadastrar instituição',
  'INSERT INTO financial_institutions (id, company_id, name) VALUES
   (''cccccccc-0000-0000-0000-0000000000f1'', ''11111111-1111-1111-1111-111111111111'', ''Banco Auditado'')');
SELECT test_lab.allow('RBAC-05', 'Financeiro PODE cadastrar conta bancária',
  'INSERT INTO bank_accounts (company_id, institution_id, account_number) VALUES
   (''11111111-1111-1111-1111-111111111111'', ''cccccccc-0000-0000-0000-00000000000a'', ''7777'')');
SELECT test_lab.allow('RBAC-06', 'Financeiro PODE cadastrar cartão',
  'INSERT INTO cards (company_id, institution_id, nickname, last_four_digits) VALUES
   (''11111111-1111-1111-1111-111111111111'', ''cccccccc-0000-0000-0000-00000000000a'', ''Cartão Fin'', ''5555'')');
SELECT test_lab.allow('RBAC-07', 'Financeiro PODE gerenciar categorias',
  'INSERT INTO transaction_categories (company_id, name) VALUES (''11111111-1111-1111-1111-111111111111'', ''Cat Fin'')');
SELECT test_lab.eq('RBAC-08', 'Financeiro NÃO altera dados da empresa (nenhuma linha afetada)',
  'WITH u AS (UPDATE companies SET name = ''x'' WHERE id = ''11111111-1111-1111-1111-111111111111'' RETURNING 1)
   SELECT count(*) FROM u', 0);
SELECT test_lab.eq('RBAC-09', 'Financeiro NÃO altera papéis de usuários (nenhuma linha afetada)',
  'WITH u AS (UPDATE user_roles SET role = ''admin''
              WHERE user_id = ''aaaaaaaa-0000-0000-0000-000000000003''
                AND company_id = ''11111111-1111-1111-1111-111111111111'' RETURNING 1)
   SELECT count(*) FROM u', 0);
SELECT test_lab.eq('RBAC-10', 'Financeiro NÃO vê a trilha de auditoria',
  'SELECT count(*) FROM audit_log', 0);

SELECT test_lab.impersonate('aaaaaaaa-0000-0000-0000-000000000004'); -- auditor Alfa
SELECT test_lab.deny('RBAC-11', 'Auditor NÃO pode cadastrar cartão',
  'INSERT INTO cards (company_id, nickname) VALUES (''11111111-1111-1111-1111-111111111111'', ''Cartão Auditor'')',
  'row-level security');
SELECT test_lab.eq('RBAC-12', 'Auditor VÊ a trilha de auditoria da própria empresa',
  'SELECT CASE WHEN count(*) >= 1 THEN 1 ELSE 0 END FROM audit_log
    WHERE company_id = ''11111111-1111-1111-1111-111111111111''', 1);
SELECT test_lab.eq('RBAC-13', 'Auditor NÃO vê a trilha de auditoria da Empresa Beta',
  'SELECT count(*) FROM audit_log WHERE company_id = ''22222222-2222-2222-2222-222222222222''', 0);

SELECT test_lab.impersonate('aaaaaaaa-0000-0000-0000-000000000001'); -- admin Alfa
SELECT test_lab.allow('RBAC-14', 'Admin PODE editar dados da própria empresa',
  'UPDATE companies SET dias_alerta_vencimento = 7 WHERE id = ''11111111-1111-1111-1111-111111111111''');

-- ---------- XREF: referências cruzadas entre empresas ----------
SELECT test_lab.deny('XREF-01', 'Conta da Alfa NÃO aceita instituição da Beta (trigger)',
  'INSERT INTO bank_accounts (company_id, institution_id, account_number) VALUES
   (''11111111-1111-1111-1111-111111111111'', ''cccccccc-0000-0000-0000-00000000000b'', ''6666'')',
  'instituicao_nao_pertence_a_empresa');
SELECT test_lab.deny('XREF-02', 'Cartão da Alfa NÃO aceita administradora da Beta (trigger)',
  'INSERT INTO cards (company_id, administrator_id, nickname) VALUES
   (''11111111-1111-1111-1111-111111111111'', ''cccccccc-0000-0000-0000-00000000000b'', ''Cartão X'')',
  'administradora_nao_pertence_a_empresa');
SELECT test_lab.deny('XREF-03', 'Subcategoria da Alfa NÃO aceita categoria da Beta (trigger)',
  'INSERT INTO transaction_subcategories (company_id, category_id, name) VALUES
   (''11111111-1111-1111-1111-111111111111'', ''ffffffff-0000-0000-0000-00000000000b'', ''Sub X'')',
  'categoria_nao_pertence_a_empresa');

-- ---------- AUD: trilha de auditoria ----------
SELECT test_lab.deny('AUD-01', 'Ninguém insere manualmente na trilha de auditoria',
  'INSERT INTO audit_log (company_id, action, entity) VALUES (''11111111-1111-1111-1111-111111111111'', ''create'', ''bank_accounts'')',
  'row-level security');
SELECT test_lab.eq('AUD-02', 'Ninguém edita registros da trilha de auditoria',
  'WITH u AS (UPDATE audit_log SET action = ''update'' WHERE company_id = ''11111111-1111-1111-1111-111111111111'' RETURNING 1)
   SELECT count(*) FROM u', 0);
SELECT test_lab.eq('AUD-03', 'Ninguém apaga registros da trilha de auditoria',
  'WITH d AS (DELETE FROM audit_log WHERE company_id = ''11111111-1111-1111-1111-111111111111'' RETURNING 1)
   SELECT count(*) FROM d', 0);
SELECT test_lab.eq('AUD-04', 'Cadastro do financeiro gerou registro de auditoria com autor e e-mail',
  'SELECT count(*) FROM audit_log
    WHERE company_id = ''11111111-1111-1111-1111-111111111111''
      AND entity = ''financial_institutions'' AND entity_id = ''cccccccc-0000-0000-0000-0000000000f1''
      AND action = ''create'' AND user_id = ''aaaaaaaa-0000-0000-0000-000000000002''
      AND user_email = ''fin.alfa@test.local''', 1);
SELECT test_lab.allow('AUD-05a', 'Financeiro inativa a instituição cadastrada (gera trilha)',
  'UPDATE financial_institutions SET status = ''inativo'' WHERE id = ''cccccccc-0000-0000-0000-0000000000f1''');
SELECT test_lab.eq('AUD-05b', 'Mudança de status registrada como status_change',
  'SELECT count(*) FROM audit_log
    WHERE entity = ''financial_institutions'' AND entity_id = ''cccccccc-0000-0000-0000-0000000000f1''
      AND action = ''status_change'' AND user_id = ''aaaaaaaa-0000-0000-0000-000000000002''', 1);
SELECT test_lab.allow('AUD-06a', 'Admin altera papel de um membro (gera trilha)',
  'UPDATE user_roles SET role = ''financeiro''
    WHERE user_id = ''aaaaaaaa-0000-0000-0000-000000000003''
      AND company_id = ''11111111-1111-1111-1111-111111111111''');
SELECT test_lab.eq('AUD-06b', 'Mudança de papel registrada como role_change',
  'SELECT count(*) FROM audit_log
    WHERE entity = ''user_roles'' AND action = ''role_change''
      AND user_id = ''aaaaaaaa-0000-0000-0000-000000000001''', 1);

-- ---------- ADM: proteção do último administrador ----------
SELECT test_lab.impersonate('bbbbbbbb-0000-0000-0000-000000000001'); -- único admin da Beta
SELECT test_lab.deny('ADM-01', 'Último admin NÃO pode ser rebaixado de papel',
  'UPDATE user_roles SET role = ''financeiro''
    WHERE user_id = ''bbbbbbbb-0000-0000-0000-000000000001''
      AND company_id = ''22222222-2222-2222-2222-222222222222''',
  'ultimo_admin_protegido');
SELECT test_lab.deny('ADM-02', 'Último admin NÃO pode ser inativado',
  'UPDATE user_roles SET status = ''inativo''
    WHERE user_id = ''bbbbbbbb-0000-0000-0000-000000000001''
      AND company_id = ''22222222-2222-2222-2222-222222222222''',
  'ultimo_admin_protegido');

-- ---------- PRIV: funções de segurança fora da API ----------
SELECT test_lab.deny('PRIV-01', 'private.has_permission NÃO é executável diretamente pela API',
  'SELECT private.has_permission(''11111111-1111-1111-1111-111111111111'', ''audit.view'')',
  'permission denied');
SELECT test_lab.deny('PRIV-02', 'private.is_company_member NÃO é executável diretamente pela API',
  'SELECT private.is_company_member(''11111111-1111-1111-1111-111111111111'')',
  'permission denied');
SELECT test_lab.deny('PRIV-03', 'private.has_company_role NÃO é executável diretamente pela API',
  'SELECT private.has_company_role(''11111111-1111-1111-1111-111111111111'', ''admin'')',
  'permission denied');

-- Segundo admin na Beta (como superusuário) para provar que a proteção é cirúrgica
RESET ROLE;
INSERT INTO public.user_roles (user_id, company_id, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'admin');
SET ROLE authenticated;

SELECT test_lab.impersonate('bbbbbbbb-0000-0000-0000-000000000001');
SELECT test_lab.allow('ADM-03', 'Com segundo admin ativo, o primeiro PODE ser rebaixado',
  'UPDATE user_roles SET role = ''financeiro''
    WHERE user_id = ''bbbbbbbb-0000-0000-0000-000000000001''
      AND company_id = ''22222222-2222-2222-2222-222222222222''');

-- ===================== ANON: nenhum acesso anônimo =====================
RESET ROLE;
SET ROLE anon;
SELECT test_lab.deny('ANON-01', 'Anônimo NÃO lê contas bancárias',
  'SELECT count(*) FROM bank_accounts', 'permission denied');
SELECT test_lab.deny('ANON-02', 'Anônimo NÃO lê empresas',
  'SELECT count(*) FROM companies', 'permission denied');
SELECT test_lab.deny('ANON-03', 'Anônimo NÃO lê a trilha de auditoria',
  'SELECT count(*) FROM audit_log', 'permission denied');
RESET ROLE;

-- ===================== Relatório =====================
\echo ''
\echo '==================== RESULTADOS ===================='
SELECT id, scenario, expected, status, nullif(detail, '') AS detail
  FROM test_lab.results ORDER BY id;
\echo ''
SELECT count(*) FILTER (WHERE status = 'PASS') AS pass,
       count(*) FILTER (WHERE status = 'FAIL') AS fail,
       count(*) AS total
  FROM test_lab.results;

ROLLBACK;
