DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
  END LOOP;
END;
$$;