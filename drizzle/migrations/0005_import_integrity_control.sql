ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS integrity jsonb;

CREATE OR REPLACE FUNCTION public.ensure_import_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE
  v_integrity jsonb;
BEGIN
  IF NEW.import_id IS NULL THEN RETURN NEW; END IF;
  SELECT b.integrity INTO v_integrity FROM public.import_batches b
   WHERE b.id = NEW.import_id AND b.company_id = NEW.company_id;
  IF v_integrity IS NOT NULL
     AND v_integrity ->> 'status' = 'divergente'
     AND (v_integrity -> 'override') IS NULL THEN
    RAISE EXCEPTION 'importacao_divergente_sem_decisao';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_transaction_import_integrity ON public.transactions;
CREATE TRIGGER check_transaction_import_integrity
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_import_integrity();