CREATE TYPE public.classification_source AS ENUM ('manual','regra_aprendida','regra_parser','nao_classificado');
CREATE TYPE public.classification_match AS ENUM ('exata','contem');
CREATE TYPE public.classification_rule_origin AS ENUM ('aprendida','manual');

CREATE TABLE public.classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  pattern text NOT NULL CHECK (length(btrim(pattern)) >= 3),
  match_type public.classification_match NOT NULL DEFAULT 'exata',
  category_id uuid NOT NULL REFERENCES public.transaction_categories(id),
  subcategory_id uuid REFERENCES public.transaction_subcategories(id),
  origin public.classification_rule_origin NOT NULL DEFAULT 'aprendida',
  usage_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  sample_description text,
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX classification_rules_unique
  ON public.classification_rules (company_id, pattern, match_type, category_id, COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX classification_rules_company ON public.classification_rules (company_id, status);

GRANT SELECT, INSERT, UPDATE ON public.classification_rules TO authenticated;
GRANT ALL ON public.classification_rules TO service_role;
ALTER TABLE public.classification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY classification_rules_select ON public.classification_rules FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY classification_rules_insert ON public.classification_rules FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'category.manage')
    OR private.has_permission(company_id, 'transaction.manage')
    OR private.has_permission(company_id, 'import.execute'));
CREATE POLICY classification_rules_update ON public.classification_rules FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'category.manage')
    OR private.has_permission(company_id, 'transaction.manage')
    OR private.has_permission(company_id, 'import.execute'))
  WITH CHECK (private.has_permission(company_id, 'category.manage')
    OR private.has_permission(company_id, 'transaction.manage')
    OR private.has_permission(company_id, 'import.execute'));

CREATE OR REPLACE FUNCTION public.ensure_rule_refs()
RETURNS trigger LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.transaction_categories c WHERE c.id = NEW.category_id AND c.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'categoria_nao_pertence_a_empresa';
  END IF;
  IF NEW.subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transaction_subcategories s
    WHERE s.id = NEW.subcategory_id AND s.company_id = NEW.company_id AND s.category_id = NEW.category_id) THEN
    RAISE EXCEPTION 'subcategoria_invalida_para_categoria';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'regra_empresa_imutavel';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_rule_refs BEFORE INSERT OR UPDATE ON public.classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.ensure_rule_refs();
CREATE TRIGGER touch_classification_rules BEFORE UPDATE ON public.classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_classification_rules AFTER INSERT OR UPDATE OR DELETE ON public.classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

ALTER TABLE public.staged_transactions
  ADD COLUMN classification_source public.classification_source NOT NULL DEFAULT 'nao_classificado',
  ADD COLUMN classification_rule_id uuid REFERENCES public.classification_rules(id),
  ADD COLUMN classification_suggestion jsonb;
ALTER TABLE public.transactions
  ADD COLUMN classification_source public.classification_source NOT NULL DEFAULT 'nao_classificado',
  ADD COLUMN classification_rule_id uuid REFERENCES public.classification_rules(id),
  ADD COLUMN affects_invoice_total boolean NOT NULL DEFAULT true;

UPDATE public.transactions SET classification_source = CASE WHEN origin = 'manual' AND category_id IS NOT NULL THEN 'manual'::public.classification_source WHEN category_id IS NOT NULL THEN 'regra_parser'::public.classification_source ELSE 'nao_classificado'::public.classification_source END;
UPDATE public.staged_transactions SET classification_source = 'regra_parser' WHERE category_id IS NOT NULL;
UPDATE public.transactions SET affects_invoice_total = false WHERE charge_kind = 'pagamento';

COMMENT ON COLUMN public.transactions.affects_invoice_total IS 'false = movimento informativo/histórico (ex.: pagamento da fatura anterior); não compõe o total da fatura atual.';

CREATE OR REPLACE VIEW public.card_invoice_summary WITH (security_invoker = true) AS
SELECT * FROM public.card_invoice_summary;