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

  -- Confirmação: o lançamento definitivo herda exatamente a classificação/evidência do item revisado.
  IF TG_TABLE_NAME = 'transactions' AND TG_OP = 'INSERT' AND NEW.staged_id IS NOT NULL THEN
    SELECT s.* INTO v_staged FROM public.staged_transactions s
     WHERE s.id = NEW.staged_id AND s.company_id = NEW.company_id;
    IF FOUND
       AND v_staged.classification_source = NEW.classification_source
       AND v_staged.category_id IS NOT DISTINCT FROM NEW.category_id
       AND v_staged.subcategory_id IS NOT DISTINCT FROM NEW.subcategory_id
       AND v_staged.classification_rule_id IS NOT DISTINCT FROM NEW.classification_rule_id
       AND v_staged.classification_system_rule IS NOT DISTINCT FROM NEW.classification_system_rule THEN
      NEW.classified_by := v_staged.classified_by;
      NEW.classified_at := v_staged.classified_at;
      RETURN NEW;
    END IF;
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
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'manual_sem_usuario'; END IF;
    NEW.classified_by := auth.uid(); NEW.classified_at := now();
  END IF;
  RETURN NEW;
END;
$$;