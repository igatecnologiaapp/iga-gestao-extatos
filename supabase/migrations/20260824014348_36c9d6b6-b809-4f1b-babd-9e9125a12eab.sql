CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_action text;
  v_email text;
BEGIN
  v_company := COALESCE(NEW.company_id, OLD.company_id);
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    IF TG_TABLE_NAME = 'user_roles' THEN
      IF OLD.role IS DISTINCT FROM NEW.role THEN
        v_action := 'role_change';
      ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'status_change';
      END IF;
    ELSE
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'status_change';
      END IF;
    END IF;
  ELSE
    v_action := 'delete';
  END IF;

  INSERT INTO public.audit_log (company_id, user_id, user_email, action, entity, entity_id, old_data, new_data)
  VALUES (
    v_company, auth.uid(), v_email, v_action, TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;