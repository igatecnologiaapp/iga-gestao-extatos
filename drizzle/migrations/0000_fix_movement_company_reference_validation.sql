CREATE OR REPLACE FUNCTION public.ensure_movement_company_refs()
RETURNS trigger
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_institution_id uuid := NULLIF(v_row ->> 'institution_id', '')::uuid;
  v_account_id uuid := NULLIF(v_row ->> 'account_id', '')::uuid;
  v_card_id uuid := NULLIF(v_row ->> 'card_id', '')::uuid;
  v_category_id uuid := NULLIF(v_row ->> 'category_id', '')::uuid;
  v_subcategory_id uuid := NULLIF(v_row ->> 'subcategory_id', '')::uuid;
BEGIN
  IF v_institution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financial_institutions fi
    WHERE fi.id = v_institution_id AND fi.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'instituicao_nao_pertence_a_empresa'; END IF;

  IF v_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bank_accounts ba
    WHERE ba.id = v_account_id AND ba.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'conta_nao_pertence_a_empresa'; END IF;

  IF v_card_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = v_card_id AND c.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'cartao_nao_pertence_a_empresa'; END IF;

  IF v_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transaction_categories tc
    WHERE tc.id = v_category_id AND tc.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'categoria_nao_pertence_a_empresa'; END IF;

  IF v_subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.transaction_subcategories ts
    WHERE ts.id = v_subcategory_id AND ts.company_id = NEW.company_id
  ) THEN RAISE EXCEPTION 'subcategoria_nao_pertence_a_empresa'; END IF;

  RETURN NEW;
END;
$$;