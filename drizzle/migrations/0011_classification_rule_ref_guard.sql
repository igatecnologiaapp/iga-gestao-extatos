CREATE OR REPLACE FUNCTION public.ensure_classification_rule_ref()
RETURNS trigger LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN
  IF NEW.classification_rule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.classification_rules r WHERE r.id = NEW.classification_rule_id AND r.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'regra_nao_pertence_a_empresa';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_transaction_rule BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_classification_rule_ref();
CREATE TRIGGER check_staged_rule BEFORE INSERT OR UPDATE ON public.staged_transactions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_classification_rule_ref();