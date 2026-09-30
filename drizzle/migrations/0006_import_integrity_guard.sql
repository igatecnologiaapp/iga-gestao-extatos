CREATE OR REPLACE FUNCTION public.guard_import_integrity_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
  v_old jsonb := OLD.integrity;
  v_new jsonb := NEW.integrity;
  v_has_tx boolean;
BEGIN
  IF v_new IS NOT DISTINCT FROM v_old THEN RETURN NEW; END IF;

  -- Caso 1: somente acréscimo da decisão justificada (restante idêntico).
  IF v_old IS NOT NULL AND v_new IS NOT NULL
     AND (v_old - 'override') = (v_new - 'override')
     AND (v_old -> 'override') IS NULL AND (v_new -> 'override') IS NOT NULL THEN
    IF v_old ->> 'status' <> 'divergente' THEN
      RAISE EXCEPTION 'decisao_apenas_para_divergente';
    END IF;
    IF length(btrim(coalesce(v_new #>> '{override,reason}', ''))) < 10 THEN
      RAISE EXCEPTION 'justificativa_obrigatoria';
    END IF;
    IF auth.uid() IS NULL OR (v_new #>> '{override,by}') IS DISTINCT FROM auth.uid()::text THEN
      RAISE EXCEPTION 'decisao_deve_ser_do_proprio_usuario';
    END IF;
    NEW.integrity := jsonb_set(v_new, '{override,at}', to_jsonb(now()));
    RETURN NEW;
  END IF;

  -- Caso 2: substituição completa (reprocessamento) — só sem lançamentos confirmados.
  SELECT EXISTS (SELECT 1 FROM public.transactions t WHERE t.import_id = OLD.id) INTO v_has_tx;
  IF v_has_tx OR OLD.status = 'confirmado' OR OLD.confirmed_count > 0 THEN
    RAISE EXCEPTION 'integridade_imutavel_lote_confirmado';
  END IF;
  IF v_new IS NOT NULL AND (v_new -> 'override') IS NOT NULL THEN
    RAISE EXCEPTION 'reprocessamento_nao_pode_trazer_decisao';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_import_integrity ON public.import_batches;
CREATE TRIGGER guard_import_integrity
  BEFORE UPDATE OF integrity ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_import_integrity_update();