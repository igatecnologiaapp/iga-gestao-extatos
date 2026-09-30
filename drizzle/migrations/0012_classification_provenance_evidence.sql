ALTER TABLE public.staged_transactions
  ADD COLUMN classification_system_rule text,
  ADD COLUMN classified_by uuid,
  ADD COLUMN classified_at timestamptz;
ALTER TABLE public.transactions
  ADD COLUMN classification_system_rule text,
  ADD COLUMN classified_by uuid,
  ADD COLUMN classified_at timestamptz;

COMMENT ON COLUMN public.staged_transactions.classification_system_rule IS 'Identificador da regra determinística do sistema que classificou (obrigatório quando origem = regra_parser).';
COMMENT ON COLUMN public.transactions.classification_system_rule IS 'Identificador da regra determinística do sistema que classificou (obrigatório quando origem = regra_parser).';

-- Evidência de proveniência: nenhuma origem sem prova. Avaliado apenas quando a classificação muda
-- (registros históricos sem evidência não são reescritos; a interface os exibe como origem indeterminada).
CREATE OR REPLACE FUNCTION public.enforce_classification_provenance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_staged record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.classification_source IS NOT DISTINCT FROM OLD.classification_source
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.subcategory_id IS NOT DISTINCT FROM OLD.subcategory_id
     AND NEW.classification_rule_id IS NOT DISTINCT FROM OLD.classification_rule_id
     AND NEW.classification_system_rule IS NOT DISTINCT FROM OLD.classification_system_rule
     AND NEW.classified_by IS NOT DISTINCT FROM OLD.classified_by THEN
    RETURN NEW;
  END IF;

  IF NEW.classification_source = 'nao_classificado' THEN
    IF NEW.category_id IS NOT NULL THEN RAISE EXCEPTION 'origem_nao_classificado_com_categoria'; END IF;
    NEW.classification_rule_id := NULL; NEW.classification_system_rule := NULL;
    NEW.classified_by := NULL; NEW.classified_at := NULL;
  ELSIF NEW.classification_source = 'regra_aprendida' THEN
    IF NEW.category_id IS NULL OR NEW.classification_rule_id IS NULL THEN
      RAISE EXCEPTION 'regra_aprendida_sem_referencia';
    END IF;
    NEW.classification_system_rule := NULL; NEW.classified_by := NULL;
    NEW.classified_at := COALESCE(NEW.classified_at, now());
  ELSIF NEW.classification_source = 'regra_parser' THEN
    IF NEW.category_id IS NULL OR length(btrim(coalesce(NEW.classification_system_rule, ''))) = 0 THEN
      RAISE EXCEPTION 'regra_sistema_sem_identificador';
    END IF;
    NEW.classification_rule_id := NULL; NEW.classified_by := NULL;
    NEW.classified_at := COALESCE(NEW.classified_at, now());
  ELSIF NEW.classification_source = 'manual' THEN
    IF NEW.category_id IS NULL THEN RAISE EXCEPTION 'manual_sem_categoria'; END IF;
    NEW.classification_rule_id := NULL; NEW.classification_system_rule := NULL;
    v_staged := NULL;
    IF TG_TABLE_NAME = 'transactions' AND NEW.staged_id IS NOT NULL THEN
      SELECT s.classified_by, s.classified_at, s.classification_source, s.category_id INTO v_staged
        FROM public.staged_transactions s
       WHERE s.id = NEW.staged_id AND s.company_id = NEW.company_id;
    END IF;
    IF v_staged.classified_by IS NOT NULL AND v_staged.classification_source = 'manual'
       AND v_staged.category_id IS NOT DISTINCT FROM NEW.category_id THEN
      -- Confirmação: herda a evidência registrada na revisão.
      NEW.classified_by := v_staged.classified_by; NEW.classified_at := v_staged.classified_at;
    ELSE
      IF auth.uid() IS NULL THEN RAISE EXCEPTION 'manual_sem_usuario'; END IF;
      NEW.classified_by := auth.uid(); NEW.classified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_staged_provenance BEFORE INSERT OR UPDATE ON public.staged_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_classification_provenance();
CREATE TRIGGER enforce_transaction_provenance BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_classification_provenance();