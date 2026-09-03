-- ============ ENUMS ============
CREATE TYPE public.import_source_type AS ENUM ('conta', 'cartao');
CREATE TYPE public.import_file_format AS ENUM ('pdf', 'ofx', 'csv', 'xlsx');
CREATE TYPE public.import_status AS ENUM ('recebido', 'processando', 'revisao', 'confirmado', 'erro', 'cancelado');
CREATE TYPE public.transaction_direction AS ENUM ('entrada', 'saida');
CREATE TYPE public.transaction_origin AS ENUM ('importado', 'manual');
CREATE TYPE public.staged_status AS ENUM ('pendente', 'confirmado', 'descartado');
CREATE TYPE public.duplicate_flag AS ENUM ('nenhuma', 'possivel', 'confirmada', 'ignorada');

-- ============ IMPORT BATCHES ============
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  source_type public.import_source_type NOT NULL,
  institution_id uuid REFERENCES public.financial_institutions(id),
  account_id uuid REFERENCES public.bank_accounts(id),
  card_id uuid REFERENCES public.cards(id),
  file_name text NOT NULL,
  file_format public.import_file_format NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  file_hash text NOT NULL,
  storage_path text NOT NULL,
  period_start date,
  period_end date,
  status public.import_status NOT NULL DEFAULT 'recebido',
  error_message text,
  parsed_count integer NOT NULL DEFAULT 0,
  confirmed_count integer NOT NULL DEFAULT 0,
  duplicate_of uuid REFERENCES public.import_batches(id),
  created_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_batches_company ON public.import_batches(company_id, created_at DESC);
CREATE INDEX idx_import_batches_hash ON public.import_batches(company_id, file_hash);

GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_batches_select ON public.import_batches FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY import_batches_insert ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'import.execute'));
CREATE POLICY import_batches_update ON public.import_batches FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'import.execute'))
  WITH CHECK (private.has_permission(company_id, 'import.execute'));

-- ============ STAGED TRANSACTIONS ============
CREATE TABLE public.staged_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  import_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  posted_at date,
  description text NOT NULL DEFAULT '',
  normalized_description text NOT NULL DEFAULT '',
  amount numeric(18,2),
  direction public.transaction_direction,
  currency text NOT NULL DEFAULT 'BRL',
  category_id uuid REFERENCES public.transaction_categories(id),
  subcategory_id uuid REFERENCES public.transaction_subcategories(id),
  status public.staged_status NOT NULL DEFAULT 'pendente',
  duplicate_state public.duplicate_flag NOT NULL DEFAULT 'nenhuma',
  duplicate_reason text,
  warnings text[] NOT NULL DEFAULT '{}',
  fingerprint text,
  raw jsonb,
  row_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staged_import ON public.staged_transactions(import_id, row_index);
CREATE INDEX idx_staged_company ON public.staged_transactions(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staged_transactions TO authenticated;
GRANT ALL ON public.staged_transactions TO service_role;
ALTER TABLE public.staged_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY staged_select ON public.staged_transactions FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY staged_insert ON public.staged_transactions FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'import.execute'));
CREATE POLICY staged_update ON public.staged_transactions FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'transaction.manage'))
  WITH CHECK (private.has_permission(company_id, 'transaction.manage'));
CREATE POLICY staged_delete ON public.staged_transactions FOR DELETE TO authenticated
  USING (private.has_permission(company_id, 'import.execute'));

-- ============ TRANSACTIONS ============
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  import_id uuid REFERENCES public.import_batches(id),
  staged_id uuid,
  source_type public.import_source_type NOT NULL,
  institution_id uuid REFERENCES public.financial_institutions(id),
  account_id uuid REFERENCES public.bank_accounts(id),
  card_id uuid REFERENCES public.cards(id),
  posted_at date NOT NULL,
  description text NOT NULL,
  normalized_description text NOT NULL DEFAULT '',
  amount numeric(18,2) NOT NULL,
  direction public.transaction_direction NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  category_id uuid REFERENCES public.transaction_categories(id),
  subcategory_id uuid REFERENCES public.transaction_subcategories(id),
  notes text,
  origin public.transaction_origin NOT NULL DEFAULT 'manual',
  fingerprint text,
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_company_date ON public.transactions(company_id, posted_at DESC);
CREATE INDEX idx_transactions_fingerprint ON public.transactions(company_id, fingerprint);
CREATE INDEX idx_transactions_import ON public.transactions(import_id);

GRANT SELECT, INSERT, UPDATE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY transactions_insert ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'transaction.manage'));
CREATE POLICY transactions_update ON public.transactions FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'transaction.manage'))
  WITH CHECK (private.has_permission(company_id, 'transaction.manage'));

-- ============ VALIDAÇÃO DE COERÊNCIA MULTIEMPRESA ============
CREATE OR REPLACE FUNCTION public.ensure_movement_company_refs()
RETURNS trigger
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF NEW.institution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financial_institutions fi WHERE fi.id = NEW.institution_id AND fi.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'instituicao_nao_pertence_a_empresa'; END IF;

  IF NEW.account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bank_accounts ba WHERE ba.id = NEW.account_id AND ba.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'conta_nao_pertence_a_empresa'; END IF;

  IF NEW.card_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cards c WHERE c.id = NEW.card_id AND c.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'cartao_nao_pertence_a_empresa'; END IF;

  IF to_jsonb(NEW) ? 'category_id' AND NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transaction_categories tc WHERE tc.id = NEW.category_id AND tc.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'categoria_nao_pertence_a_empresa'; END IF;

  IF to_jsonb(NEW) ? 'subcategory_id' AND NEW.subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transaction_subcategories ts WHERE ts.id = NEW.subcategory_id AND ts.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'subcategoria_nao_pertence_a_empresa'; END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_import_company BEFORE INSERT OR UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.ensure_movement_company_refs();
CREATE TRIGGER check_transaction_company BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_movement_company_refs();

-- ============ TIMESTAMPS ============
CREATE TRIGGER touch_import_batches BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_staged_transactions BEFORE UPDATE ON public.staged_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_transactions BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ AUDITORIA ============
CREATE TRIGGER audit_import_batches AFTER INSERT OR UPDATE OR DELETE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_transactions AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ============ STORAGE: upload exige permissão de importação ============
DROP POLICY IF EXISTS financial_documents_insert ON storage.objects;
CREATE POLICY financial_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'financial-documents'
    AND private.has_permission(((storage.foldername(name))[1])::uuid, 'import.execute')
  );