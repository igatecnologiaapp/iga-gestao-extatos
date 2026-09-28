-- ===================== FASE 3 — Cartões e Faturas =====================
CREATE TYPE public.invoice_lifecycle AS ENUM ('aberta','fechada','cancelada');
CREATE TYPE public.card_charge_kind AS ENUM ('compra','juros','encargo','tarifa','ajuste','credito','estorno','devolucao','pagamento');

-- Conta relacionada ao cartão (opcional)
ALTER TABLE public.cards ADD COLUMN account_id uuid REFERENCES public.bank_accounts(id);

-- Faturas
CREATE TABLE public.card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  card_id uuid NOT NULL REFERENCES public.cards(id),
  competence date NOT NULL,
  period_start date NOT NULL,
  closing_date date NOT NULL,
  due_date date NOT NULL,
  status public.invoice_lifecycle NOT NULL DEFAULT 'aberta',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_invoices_competence_first_day CHECK (extract(day FROM competence) = 1),
  CONSTRAINT card_invoices_dates_order CHECK (period_start <= closing_date AND closing_date <= due_date),
  CONSTRAINT card_invoices_unique_competence UNIQUE (card_id, competence)
);
CREATE INDEX idx_card_invoices_company ON public.card_invoices (company_id, due_date DESC);

GRANT SELECT, INSERT, UPDATE ON public.card_invoices TO authenticated;
GRANT ALL ON public.card_invoices TO service_role;
ALTER TABLE public.card_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY card_invoices_select ON public.card_invoices FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY card_invoices_insert ON public.card_invoices FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'invoice.manage'));
CREATE POLICY card_invoices_update ON public.card_invoices FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'invoice.manage'))
  WITH CHECK (private.has_permission(company_id, 'invoice.manage'));

-- Pagamentos de faturas (nunca excluídos: estorno = status inativo)
CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  invoice_id uuid NOT NULL REFERENCES public.card_invoices(id),
  paid_at date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  account_id uuid REFERENCES public.bank_accounts(id),
  bank_transaction_id uuid REFERENCES public.transactions(id),
  notes text,
  idempotency_key uuid NOT NULL,
  status public.record_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payments_idempotency UNIQUE (company_id, idempotency_key)
);
CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments (invoice_id);

GRANT SELECT, INSERT, UPDATE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_payments_select ON public.invoice_payments FOR SELECT TO authenticated
  USING (private.is_company_member(company_id));
CREATE POLICY invoice_payments_insert ON public.invoice_payments FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(company_id, 'invoice.pay'));
CREATE POLICY invoice_payments_update ON public.invoice_payments FOR UPDATE TO authenticated
  USING (private.has_permission(company_id, 'invoice.pay'))
  WITH CHECK (private.has_permission(company_id, 'invoice.pay'));

-- Lançamentos: vínculo com fatura, natureza e parcelamento
ALTER TABLE public.transactions
  ADD COLUMN invoice_id uuid REFERENCES public.card_invoices(id),
  ADD COLUMN charge_kind public.card_charge_kind,
  ADD COLUMN installment_number smallint,
  ADD COLUMN installment_total smallint,
  ADD COLUMN installment_group uuid,
  ADD COLUMN installment_total_amount numeric(14,2);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_installment_valid CHECK (
  (installment_number IS NULL AND installment_total IS NULL)
  OR (installment_number >= 1 AND installment_total >= 2 AND installment_number <= installment_total AND installment_total <= 99)
);
CREATE INDEX idx_transactions_invoice ON public.transactions (invoice_id);
CREATE UNIQUE INDEX uq_transactions_installment_group
  ON public.transactions (installment_group, installment_number)
  WHERE installment_group IS NOT NULL AND status = 'ativo';

-- Validação de referências da mesma empresa (Fase 3)
CREATE OR REPLACE FUNCTION public.ensure_invoice_refs()
RETURNS trigger LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_inv record;
BEGIN
  IF TG_TABLE_NAME = 'card_invoices' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cards c WHERE c.id = NEW.card_id AND c.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'cartao_nao_pertence_a_empresa';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.card_id <> OLD.card_id OR NEW.competence <> OLD.competence OR NEW.company_id <> OLD.company_id) THEN
      RAISE EXCEPTION 'fatura_identidade_imutavel';
    END IF;
  ELSIF TG_TABLE_NAME = 'invoice_payments' THEN
    SELECT * INTO v_inv FROM public.card_invoices i WHERE i.id = NEW.invoice_id AND i.company_id = NEW.company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'fatura_nao_pertence_a_empresa'; END IF;
    IF TG_OP = 'INSERT' AND v_inv.status = 'cancelada' THEN RAISE EXCEPTION 'fatura_cancelada'; END IF;
    IF NEW.account_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.bank_accounts ba WHERE ba.id = NEW.account_id AND ba.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'conta_nao_pertence_a_empresa';
    END IF;
    IF NEW.bank_transaction_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.transactions t WHERE t.id = NEW.bank_transaction_id AND t.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'lancamento_nao_pertence_a_empresa';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.invoice_id <> OLD.invoice_id OR NEW.amount <> OLD.amount OR NEW.company_id <> OLD.company_id) THEN
      RAISE EXCEPTION 'pagamento_valor_imutavel';
    END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.invoice_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN
      SELECT * INTO v_inv FROM public.card_invoices i WHERE i.id = NEW.invoice_id AND i.company_id = NEW.company_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'fatura_nao_pertence_a_empresa'; END IF;
      IF NEW.card_id IS DISTINCT FROM v_inv.card_id THEN RAISE EXCEPTION 'lancamento_de_outro_cartao'; END IF;
      IF v_inv.status = 'cancelada' THEN RAISE EXCEPTION 'fatura_cancelada'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'cards' THEN
    IF NEW.account_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.bank_accounts ba WHERE ba.id = NEW.account_id AND ba.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'conta_nao_pertence_a_empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_invoice_refs BEFORE INSERT OR UPDATE ON public.card_invoices
  FOR EACH ROW EXECUTE FUNCTION public.ensure_invoice_refs();
CREATE TRIGGER check_payment_refs BEFORE INSERT OR UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.ensure_invoice_refs();
CREATE TRIGGER check_transaction_invoice BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_invoice_refs();
CREATE TRIGGER check_card_account BEFORE INSERT OR UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.ensure_invoice_refs();

CREATE TRIGGER touch_card_invoices BEFORE UPDATE ON public.card_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_invoice_payments BEFORE UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_card_invoices AFTER INSERT OR UPDATE OR DELETE ON public.card_invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_invoice_payments AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Consolidação da fatura (respeita RLS de quem consulta)
CREATE VIEW public.card_invoice_summary WITH (security_invoker = true) AS
SELECT
  i.id AS invoice_id,
  i.company_id,
  i.card_id,
  COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'saida' AND COALESCE(t.charge_kind,'compra') = 'compra'), 0)::numeric(14,2) AS purchases,
  COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'saida' AND t.charge_kind = 'juros'), 0)::numeric(14,2) AS interest,
  COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'saida' AND t.charge_kind = 'encargo'), 0)::numeric(14,2) AS charges,
  COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'saida' AND t.charge_kind = 'tarifa'), 0)::numeric(14,2) AS fees,
  COALESCE(SUM(CASE WHEN t.charge_kind = 'ajuste' THEN CASE WHEN t.direction = 'saida' THEN t.amount ELSE -t.amount END END), 0)::numeric(14,2) AS adjustments,
  COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'entrada' AND COALESCE(t.charge_kind,'credito') IN ('credito','devolucao')), 0)::numeric(14,2) AS credits,
  COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'entrada' AND t.charge_kind = 'estorno'), 0)::numeric(14,2) AS refunds,
  COALESCE(SUM(CASE WHEN COALESCE(t.charge_kind,'compra') = 'pagamento' THEN 0
                    WHEN t.direction = 'saida' THEN t.amount ELSE -t.amount END), 0)::numeric(14,2) AS total,
  COUNT(t.id) AS transaction_count,
  COUNT(t.id) FILTER (WHERE t.charge_kind = 'pagamento') AS payment_lines,
  (SELECT COALESCE(SUM(p.amount), 0) FROM public.invoice_payments p
    WHERE p.invoice_id = i.id AND p.status = 'ativo')::numeric(14,2) AS paid
FROM public.card_invoices i
LEFT JOIN public.transactions t ON t.invoice_id = i.id AND t.status = 'ativo'
GROUP BY i.id;

GRANT SELECT ON public.card_invoice_summary TO authenticated;
GRANT SELECT ON public.card_invoice_summary TO service_role;

-- Permissões da Fase 3 (catálogo)
INSERT INTO public.permissions (key, description) VALUES
  ('invoice.view', 'Visualizar faturas de cartão'),
  ('invoice.manage', 'Gerenciar faturas de cartão'),
  ('invoice.pay', 'Registrar pagamentos de faturas')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role::public.app_role, r.key FROM (VALUES
  ('admin','invoice.view'),('admin','invoice.manage'),('admin','invoice.pay'),
  ('financeiro','invoice.view'),('financeiro','invoice.manage'),('financeiro','invoice.pay'),
  ('consulta','invoice.view'),('auditor','invoice.view')
) AS r(role, key)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role = r.role::public.app_role AND rp.permission_key = r.key);
