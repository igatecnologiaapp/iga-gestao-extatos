CREATE TYPE public.app_role AS ENUM ('admin', 'financeiro', 'consulta', 'auditor');
CREATE TYPE public.institution_type AS ENUM ('banco', 'cooperativa', 'fintech', 'administradora_cartao', 'instituicao_pagamento', 'outra');
CREATE TYPE public.record_status AS ENUM ('ativo', 'inativo');
CREATE TYPE public.account_type AS ENUM ('corrente', 'poupanca', 'pagamento', 'investimento', 'outra');
CREATE TYPE public.card_type AS ENUM ('credito', 'debito', 'credito_debito');
CREATE TYPE public.card_status AS ENUM ('ativo', 'bloqueado', 'cancelado', 'inativo');

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  document text,
  dias_alerta_vencimento smallint NOT NULL DEFAULT 5 CHECK (dias_alerta_vencimento BETWEEN 0 AND 60),
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, role)
);
GRANT SELECT, INSERT, UPDATE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE TABLE public.permissions (
  key text PRIMARY KEY,
  description text NOT NULL
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  UNIQUE (role, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

INSERT INTO public.permissions (key, description) VALUES
  ('institution.view', 'Visualizar instituições financeiras'),
  ('institution.create', 'Cadastrar instituições financeiras'),
  ('institution.update', 'Editar instituições financeiras'),
  ('institution.inactivate', 'Inativar instituições financeiras'),
  ('account.view', 'Visualizar contas bancárias'),
  ('account.create', 'Cadastrar contas bancárias'),
  ('account.update', 'Editar contas bancárias'),
  ('account.inactivate', 'Inativar contas bancárias'),
  ('card.view', 'Visualizar cartões'),
  ('card.create', 'Cadastrar cartões'),
  ('card.update', 'Editar cartões'),
  ('card.inactivate', 'Inativar cartões'),
  ('category.view', 'Visualizar categorias e subcategorias'),
  ('category.manage', 'Criar e editar categorias e subcategorias'),
  ('transaction.view', 'Visualizar lançamentos'),
  ('transaction.manage', 'Criar e editar lançamentos'),
  ('import.execute', 'Importar extratos e faturas'),
  ('reconciliation.execute', 'Executar conciliação'),
  ('report.view', 'Visualizar relatórios e dashboards'),
  ('audit.view', 'Visualizar trilha de auditoria'),
  ('company.manage', 'Gerenciar dados da empresa'),
  ('member.manage', 'Gerenciar usuários e papéis');

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', key FROM public.permissions;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('financeiro', 'institution.view'), ('financeiro', 'institution.create'),
  ('financeiro', 'institution.update'), ('financeiro', 'institution.inactivate'),
  ('financeiro', 'account.view'), ('financeiro', 'account.create'),
  ('financeiro', 'account.update'), ('financeiro', 'account.inactivate'),
  ('financeiro', 'card.view'), ('financeiro', 'card.create'),
  ('financeiro', 'card.update'), ('financeiro', 'card.inactivate'),
  ('financeiro', 'category.view'), ('financeiro', 'category.manage'),
  ('financeiro', 'transaction.view'), ('financeiro', 'transaction.manage'),
  ('financeiro', 'import.execute'), ('financeiro', 'reconciliation.execute'),
  ('financeiro', 'report.view');

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('consulta', 'institution.view'), ('consulta', 'account.view'),
  ('consulta', 'card.view'), ('consulta', 'category.view'),
  ('consulta', 'transaction.view'), ('consulta', 'report.view');

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('auditor', 'institution.view'), ('auditor', 'account.view'),
  ('auditor', 'card.view'), ('auditor', 'category.view'),
  ('auditor', 'transaction.view'), ('auditor', 'report.view'),
  ('auditor', 'audit.view');

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND company_id = _company_id AND status = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_company_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND company_id = _company_id AND role = _role AND status = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_company_id uuid, _permission text)
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

CREATE OR REPLACE FUNCTION public.shares_company_with(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() OR EXISTS (
    SELECT 1
    FROM public.user_roles a
    JOIN public.user_roles b ON b.company_id = a.company_id AND b.status = 'ativo'
    WHERE a.user_id = auth.uid() AND a.status = 'ativo' AND b.user_id = _user_id
  );
$$;

CREATE TABLE public.financial_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  type public.institution_type NOT NULL DEFAULT 'banco',
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE ON public.financial_institutions TO authenticated;
GRANT ALL ON public.financial_institutions TO service_role;

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.financial_institutions(id),
  agency text,
  account_number text NOT NULL,
  account_digit text,
  type public.account_type NOT NULL DEFAULT 'corrente',
  holder text,
  holder_document text,
  nickname text,
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.financial_institutions(id),
  administrator_id uuid REFERENCES public.financial_institutions(id),
  brand text,
  holder text,
  nickname text NOT NULL,
  type public.card_type NOT NULL DEFAULT 'credito',
  last_four_digits text CHECK (last_four_digits IS NULL OR last_four_digits ~ '^\d{4}$'),
  closing_day smallint CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31),
  due_day smallint CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  credit_limit numeric(14,2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  status public.card_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;

CREATE TABLE public.transaction_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE ON public.transaction_categories TO authenticated;
GRANT ALL ON public.transaction_categories TO service_role;

CREATE TABLE public.transaction_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.transaction_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);
GRANT SELECT, INSERT, UPDATE ON public.transaction_subcategories TO authenticated;
GRANT ALL ON public.transaction_subcategories TO service_role;

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF TG_TABLE_NAME = 'user_roles' AND OLD.role IS DISTINCT FROM NEW.role THEN
      v_action := 'role_change';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'status_change';
    ELSE
      v_action := 'update';
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
$$;

CREATE TRIGGER audit_financial_institutions
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_institutions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_bank_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_cards
  AFTER INSERT OR UPDATE OR DELETE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_transaction_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.transaction_categories
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_transaction_subcategories
  AFTER INSERT OR UPDATE OR DELETE ON public.transaction_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE OR REPLACE FUNCTION public.ensure_same_company_refs()
RETURNS trigger
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'bank_accounts' THEN
    IF NOT EXISTS (SELECT 1 FROM public.financial_institutions fi
                   WHERE fi.id = NEW.institution_id AND fi.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'instituicao_nao_pertence_a_empresa';
    END IF;
  ELSIF TG_TABLE_NAME = 'cards' THEN
    IF NEW.institution_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.financial_institutions fi
      WHERE fi.id = NEW.institution_id AND fi.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'instituicao_nao_pertence_a_empresa';
    END IF;
    IF NEW.administrator_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.financial_institutions fi
      WHERE fi.id = NEW.administrator_id AND fi.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'administradora_nao_pertence_a_empresa';
    END IF;
  ELSIF TG_TABLE_NAME = 'transaction_subcategories' THEN
    IF NOT EXISTS (SELECT 1 FROM public.transaction_categories c
                   WHERE c.id = NEW.category_id AND c.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'categoria_nao_pertence_a_empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_bank_account_company
  BEFORE INSERT OR UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_same_company_refs();
CREATE TRIGGER check_card_company
  BEFORE INSERT OR UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.ensure_same_company_refs();
CREATE TRIGGER check_subcategory_company
  BEFORE INSERT OR UPDATE ON public.transaction_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.ensure_same_company_refs();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_companies BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_user_roles BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_financial_institutions BEFORE UPDATE ON public.financial_institutions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_bank_accounts BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_cards BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_transaction_categories BEFORE UPDATE ON public.transaction_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_transaction_subcategories BEFORE UPDATE ON public.transaction_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (public.is_company_member(id));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
  USING (public.has_permission(id, 'company.manage'))
  WITH CHECK (public.has_permission(id, 'company.manage'));

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (public.shares_company_with(id));
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_company_member(company_id));
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_company_role(company_id, 'admin'));
CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_company_role(company_id, 'admin'))
  WITH CHECK (public.has_company_role(company_id, 'admin'));

CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY institutions_select ON public.financial_institutions FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY institutions_insert ON public.financial_institutions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(company_id, 'institution.create'));
CREATE POLICY institutions_update ON public.financial_institutions FOR UPDATE TO authenticated
  USING (public.has_permission(company_id, 'institution.update'))
  WITH CHECK (public.has_permission(company_id, 'institution.update'));

CREATE POLICY bank_accounts_select ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY bank_accounts_insert ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(company_id, 'account.create'));
CREATE POLICY bank_accounts_update ON public.bank_accounts FOR UPDATE TO authenticated
  USING (public.has_permission(company_id, 'account.update'))
  WITH CHECK (public.has_permission(company_id, 'account.update'));

CREATE POLICY cards_select ON public.cards FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY cards_insert ON public.cards FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(company_id, 'card.create'));
CREATE POLICY cards_update ON public.cards FOR UPDATE TO authenticated
  USING (public.has_permission(company_id, 'card.update'))
  WITH CHECK (public.has_permission(company_id, 'card.update'));

CREATE POLICY categories_select ON public.transaction_categories FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY categories_insert ON public.transaction_categories FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(company_id, 'category.manage'));
CREATE POLICY categories_update ON public.transaction_categories FOR UPDATE TO authenticated
  USING (public.has_permission(company_id, 'category.manage'))
  WITH CHECK (public.has_permission(company_id, 'category.manage'));

CREATE POLICY subcategories_select ON public.transaction_subcategories FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY subcategories_insert ON public.transaction_subcategories FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(company_id, 'category.manage'));
CREATE POLICY subcategories_update ON public.transaction_subcategories FOR UPDATE TO authenticated
  USING (public.has_permission(company_id, 'category.manage'))
  WITH CHECK (public.has_permission(company_id, 'category.manage'));

CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_permission(company_id, 'audit.view'));

CREATE INDEX idx_user_roles_user ON public.user_roles (user_id);
CREATE INDEX idx_user_roles_company ON public.user_roles (company_id);
CREATE INDEX idx_institutions_company ON public.financial_institutions (company_id);
CREATE INDEX idx_bank_accounts_company ON public.bank_accounts (company_id);
CREATE INDEX idx_bank_accounts_institution ON public.bank_accounts (institution_id);
CREATE INDEX idx_cards_company ON public.cards (company_id);
CREATE INDEX idx_categories_company ON public.transaction_categories (company_id);
CREATE INDEX idx_subcategories_category ON public.transaction_subcategories (category_id);
CREATE INDEX idx_audit_log_company_time ON public.audit_log (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_company(_name text, _document text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;

  INSERT INTO public.companies (name, document) VALUES (_name, _document)
  RETURNING id INTO v_company;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (auth.uid(), v_company, 'admin');

  INSERT INTO public.transaction_categories (company_id, name, is_system) VALUES
    (v_company, 'Compra', true),
    (v_company, 'Taxa', true),
    (v_company, 'Juros', true),
    (v_company, 'Pagamento', false),
    (v_company, 'Transferência', false),
    (v_company, 'PIX', false),
    (v_company, 'Recebimento', false),
    (v_company, 'Estorno', false),
    (v_company, 'Saque', false),
    (v_company, 'Investimento', false),
    (v_company, 'Imposto', false),
    (v_company, 'Tarifa', false),
    (v_company, 'Multa', false),
    (v_company, 'Anuidade', false),
    (v_company, 'Encargos', false),
    (v_company, 'Outros', false);

  INSERT INTO public.transaction_subcategories (company_id, category_id, name)
  SELECT v_company, c.id, s.sub_name
  FROM public.transaction_categories c
  JOIN (VALUES
    ('Taxa', 'Tarifa bancária'),
    ('Taxa', 'Anuidade'),
    ('Taxa', 'Taxa administrativa'),
    ('Taxa', 'Taxa de manutenção'),
    ('Taxa', 'IOF'),
    ('Taxa', 'Taxa de saque'),
    ('Juros', 'Juros rotativos'),
    ('Juros', 'Juros de atraso'),
    ('Juros', 'Juros de financiamento'),
    ('Juros', 'Juros de parcelamento')
  ) AS s(cat_name, sub_name) ON s.cat_name = c.name AND c.company_id = v_company;

  INSERT INTO public.audit_log (company_id, user_id, action, entity, entity_id, new_data)
  SELECT v_company, auth.uid(), 'create', 'companies', v_company,
         jsonb_build_object('name', _name, 'document', _document);

  RETURN v_company;
END;
$$;

CREATE POLICY financial_documents_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY financial_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'financial-documents'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY financial_documents_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND public.is_company_member((storage.foldername(name))[1]::uuid)
  );
CREATE POLICY financial_documents_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'financial-documents'
    AND public.has_company_role((storage.foldername(name))[1]::uuid, 'admin')
  );