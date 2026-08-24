CREATE OR REPLACE FUNCTION private.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só se aplica quando a linha original é de um administrador ativo
  IF OLD.role = 'admin' AND OLD.status = 'ativo' THEN
    IF TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.status <> 'ativo' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE company_id = OLD.company_id
          AND role = 'admin'
          AND status = 'ativo'
          AND id <> OLD.id
      ) THEN
        RAISE EXCEPTION 'ultimo_admin_protegido: a empresa precisa manter pelo menos um administrador ativo.';
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_last_admin_removal() FROM public, anon, authenticated;

CREATE TRIGGER protect_last_admin
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.prevent_last_admin_removal();