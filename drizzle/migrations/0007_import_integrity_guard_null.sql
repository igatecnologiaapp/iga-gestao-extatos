CREATE OR REPLACE FUNCTION public.guard_import_integrity_null()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.integrity IS NOT NULL AND NEW.integrity IS NULL THEN
    RAISE EXCEPTION 'integridade_nao_pode_ser_removida';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_import_integrity_null ON public.import_batches;
CREATE TRIGGER guard_import_integrity_null
  BEFORE UPDATE OF integrity ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_import_integrity_null();