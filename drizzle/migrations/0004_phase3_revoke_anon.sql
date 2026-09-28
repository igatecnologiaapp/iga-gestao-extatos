REVOKE ALL ON public.card_invoices FROM anon;
REVOKE ALL ON public.invoice_payments FROM anon;
REVOKE ALL ON public.card_invoice_summary FROM anon;
REVOKE DELETE, TRUNCATE ON public.card_invoices FROM authenticated;
REVOKE DELETE, TRUNCATE ON public.invoice_payments FROM authenticated;