CREATE OR REPLACE FUNCTION public.guard_import_integrity_null()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.integrity IS NOT NULL AND NEW.integrity IS NULL THEN
    RAISE EXCEPTION 'integridade_nao_pode_ser_removida';
  END IF;
  -- Divergência só é superada por decisão justificada (acréscimo de override), nunca por substituição.
  IF OLD.integrity ->> 'status' = 'divergente'
     AND (NEW.integrity ->> 'status') IS DISTINCT FROM 'divergente' THEN
    RAISE EXCEPTION 'divergencia_exige_decisao';
  END IF;
  RETURN NEW;
END;
$$;