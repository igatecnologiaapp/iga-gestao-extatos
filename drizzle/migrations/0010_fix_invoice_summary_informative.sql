DROP VIEW IF EXISTS public.card_invoice_summary;
CREATE VIEW public.card_invoice_summary WITH (security_invoker = true) AS
SELECT
  i.id AS invoice_id,
  i.company_id,
  i.card_id,
  COALESCE(SUM(t.amount) FILTER (WHERE t.affects_invoice_total AND t.direction = 'saida' AND COALESCE(t.charge_kind,'compra') = 'compra'), 0)::numeric(14,2) AS purchases,
  COALESCE(SUM(t.amount) FILTER (WHERE t.affects_invoice_total AND t.direction = 'saida' AND t.charge_kind = 'juros'), 0)::numeric(14,2) AS interest,
  COALESCE(SUM(t.amount) FILTER (WHERE t.affects_invoice_total AND t.direction = 'saida' AND t.charge_kind = 'encargo'), 0)::numeric(14,2) AS charges,
  COALESCE(SUM(t.amount) FILTER (WHERE t.affects_invoice_total AND t.direction = 'saida' AND t.charge_kind = 'tarifa'), 0)::numeric(14,2) AS fees,
  COALESCE(SUM(CASE WHEN t.affects_invoice_total AND t.charge_kind = 'ajuste' THEN CASE WHEN t.direction = 'saida' THEN t.amount ELSE -t.amount END END), 0)::numeric(14,2) AS adjustments,
  COALESCE(SUM(t.amount) FILTER (WHERE t.affects_invoice_total AND t.direction = 'entrada' AND COALESCE(t.charge_kind,'credito') IN ('credito','devolucao')), 0)::numeric(14,2) AS credits,
  COALESCE(SUM(t.amount) FILTER (WHERE t.affects_invoice_total AND t.direction = 'entrada' AND t.charge_kind = 'estorno'), 0)::numeric(14,2) AS refunds,
  COALESCE(SUM(CASE WHEN NOT t.affects_invoice_total OR COALESCE(t.charge_kind,'compra') = 'pagamento' THEN 0
                    WHEN t.direction = 'saida' THEN t.amount ELSE -t.amount END), 0)::numeric(14,2) AS total,
  COUNT(t.id) AS transaction_count,
  COUNT(t.id) FILTER (WHERE t.charge_kind = 'pagamento' OR NOT t.affects_invoice_total) AS payment_lines,
  (SELECT COALESCE(SUM(p.amount), 0) FROM public.invoice_payments p
    WHERE p.invoice_id = i.id AND p.status = 'ativo')::numeric(14,2) AS paid
FROM public.card_invoices i
LEFT JOIN public.transactions t ON t.invoice_id = i.id AND t.status = 'ativo'
GROUP BY i.id;
REVOKE ALL ON public.card_invoice_summary FROM anon;
GRANT SELECT ON public.card_invoice_summary TO authenticated;
GRANT SELECT ON public.card_invoice_summary TO service_role;

REVOKE ALL ON public.classification_rules FROM anon;