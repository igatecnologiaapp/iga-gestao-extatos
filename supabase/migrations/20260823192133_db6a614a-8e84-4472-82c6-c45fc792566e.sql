CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND company_id = _company_id AND status = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION private.has_company_role(_company_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND company_id = _company_id AND role = _role AND status = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION private.has_permission(_company_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = auth.uid()
      AND ur.company_id = _company_id
      AND ur.status = 'ativo'
      AND rp.permission_key = _permission
  );
$$;

CREATE OR REPLACE FUNCTION private.shares_company_with(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() OR EXISTS (
    SELECT 1
    FROM public.user_roles a
    JOIN public.user_roles b ON b.company_id = a.company_id AND b.status = 'ativo'
    WHERE a.user_id = auth.uid() AND a.status = 'ativo' AND b.user_id = _user_id
  );
$$;

DROP POLICY companies_select ON public.companies;
DROP POLICY companies_update ON public.companies;
DROP POLICY profiles_select ON public.profiles;
DROP POLICY user_roles_select ON public.user_roles;
DROP POLICY user_roles_insert ON public.user_roles;
DROP POLICY user_roles_update ON public.user_roles;
DROP POLICY institutions_select ON public.financial_institutions;
DROP POLICY institutions_insert ON public.financial_institutions;
DROP POLICY institutions_update ON public.financial_institutions;
DROP POLICY bank_accounts_select ON public.bank_accounts;
DROP POLICY bank_accounts_insert ON public.bank_accounts;
DROP POLICY bank_accounts_update ON public.bank_accounts;
DROP POLICY cards_select ON public.cards;
DROP POLICY cards_insert ON public.cards;
DROP POLICY cards_update ON public.cards;
DROP POLICY categories_select ON public.transaction_categories;
DROP POLICY categories_insert ON public.transaction_categories;
DROP POLICY categories_update ON public.transaction_categories;
DROP POLICY subcategories_select ON public.transaction_subcategories;
DROP POLICY subcategories_insert ON public.transaction_subcategories;
DROP POLICY subcategories_update ON public.transaction_subcategories;
DROP POLICY audit_log_select ON public.audit_log;
DROP POLICY financial_documents_select ON storage.objects;
DROP POLICY financial_documents_insert ON storage.objects;
DROP POLICY financial_documents_update ON storage.objects;
DROP POLICY financial_documents_delete ON storage.objects;

DROP FUNCTION public.is_company_member(uuid);
DROP FUNCTION public.has_company_role(uuid, public.app_role);
DROP FUNCTION public.has_permission(uuid, text);
DROP FUNCTION public.shares_company_with(uuid);
DROP FUNCTION public.create_company(text, text);

REVOKE EXECUTE ON FUNCTION public.log_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_same_company_refs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (private.is_company_member(id));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
  USING (private.has_permission(id, 'company.manage'))
  WITH CHECK (private.has_permission(id, 'company.manage'));

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (private.shares_company_with(id));

CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_company_member(company_id));
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_company_role(company_id, 'admin'));
CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated
  USING (private.has_company_role(company_id, 'admin'))
  WITH CHECK (private.has_company_role(company_id, 'admin'));

CREATE POLICY institutions_select ON public.financial_institutions FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY institutions_insert ON public.financial_institutions FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'institution.create'));
CREATE POLICY institutions_update ON public.financial_institutions FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'institution.update'))
  WITH CHECK (private.has_permission(company_id, 'institution.update'));

CREATE POLICY bank_accounts_select ON public.bank_accounts FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY bank_accounts_insert ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'account.create'));
CREATE POLICY bank_accounts_update ON public.bank_accounts FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'account.update'))
  WITH CHECK (private.has_permission(company_id, 'account.update'));

CREATE POLICY cards_select ON public.cards FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY cards_insert ON public.cards FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'card.create'));
CREATE POLICY cards_update ON public.cards FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'card.update'))
  WITH CHECK (private.has_permission(company_id, 'card.update'));

CREATE POLICY categories_select ON public.transaction_categories FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY categories_insert ON public.transaction_categories FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'category.manage'));
CREATE POLICY categories_update ON public.transaction_categories FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'category.manage'))
  WITH CHECK (private.has_permission(company_id, 'category.manage'));

CREATE POLICY subcategories_select ON public.transaction_subcategories FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY subcategories_insert ON public.transaction_subcategories FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'category.manage'));
CREATE POLICY subcategories_update ON public.transaction_subcategories FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'category.manage'))
  WITH CHECK (private.has_permission(company_id, 'category.manage'));

CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
  USING (private.has_permission(company_id, 'audit.view'));

CREATE POLICY financial_documents_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND private.is_company_member((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY financial_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'financial-documents'
    AND private.is_company_member((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY financial_documents_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND private.is_company_member((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY financial_documents_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND private.has_company_role((storage.foldername(name))[1]::uuid, 'admin')
  );