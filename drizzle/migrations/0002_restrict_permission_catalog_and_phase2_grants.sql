DROP POLICY permissions_select ON public.permissions;
DROP POLICY role_permissions_select ON public.role_permissions;

CREATE POLICY permissions_select ON public.permissions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'ativo'
      AND rp.permission_key = permissions.key
  )
);

CREATE POLICY role_permissions_select ON public.role_permissions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.status = 'ativo'
      AND ur.role = role_permissions.role
  )
);

REVOKE ALL PRIVILEGES ON TABLE public.permissions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.role_permissions FROM anon, authenticated;
GRANT SELECT ON TABLE public.permissions TO authenticated;
GRANT SELECT ON TABLE public.role_permissions TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.import_batches FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.staged_transactions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.transactions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staged_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.transactions TO authenticated;