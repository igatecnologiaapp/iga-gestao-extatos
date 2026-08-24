import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPE_LABELS,
  APP_NAME,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  INSTITUTION_TYPE_LABELS,
  PERMISSION_LABELS,
  RECORD_STATUS_LABELS,
  ROLE_LABELS,
} from "@/lib/domain";

const APP_ROLES = ["admin", "financeiro", "consulta", "auditor"] as const;
const INSTITUTION_TYPES = ["banco", "cooperativa", "fintech", "administradora_cartao", "instituicao_pagamento", "outra"] as const;
const ACCOUNT_TYPES = ["corrente", "poupanca", "pagamento", "investimento", "outra"] as const;
const CARD_TYPES = ["credito", "debito", "credito_debito"] as const;
const CARD_STATUSES = ["ativo", "bloqueado", "cancelado", "inativo"] as const;
const RECORD_STATUSES = ["ativo", "inativo"] as const;
const AUDIT_ACTIONS = ["create", "update", "status_change", "delete", "role_change", "invite"] as const;
const AUDITED_ENTITIES = [
  "companies",
  "financial_institutions",
  "bank_accounts",
  "cards",
  "transaction_categories",
  "transaction_subcategories",
  "user_roles",
] as const;

describe("mapas de rótulos do domínio", () => {
  it("cobrem todos os papéis da aplicação", () => {
    for (const role of APP_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });

  it("cobrem todos os tipos de instituição", () => {
    for (const t of INSTITUTION_TYPES) expect(INSTITUTION_TYPE_LABELS[t]).toBeTruthy();
  });

  it("cobrem todos os tipos de conta", () => {
    for (const t of ACCOUNT_TYPES) expect(ACCOUNT_TYPE_LABELS[t]).toBeTruthy();
  });

  it("cobrem todos os tipos e status de cartão", () => {
    for (const t of CARD_TYPES) expect(CARD_TYPE_LABELS[t]).toBeTruthy();
    for (const s of CARD_STATUSES) expect(CARD_STATUS_LABELS[s]).toBeTruthy();
  });

  it("cobrem todos os status de registro", () => {
    for (const s of RECORD_STATUSES) expect(RECORD_STATUS_LABELS[s]).toBeTruthy();
  });

  it("cobrem todas as ações e entidades auditadas", () => {
    for (const a of AUDIT_ACTIONS) expect(AUDIT_ACTION_LABELS[a]).toBeTruthy();
    for (const e of AUDITED_ENTITIES) expect(AUDIT_ENTITY_LABELS[e]).toBeTruthy();
  });

  it("todas as permissões rotuladas seguem o padrão entidade.ação", () => {
    for (const key of Object.keys(PERMISSION_LABELS)) {
      expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(PERMISSION_LABELS[key].length).toBeGreaterThan(3);
    }
  });

  it("nome do aplicativo está definido", () => {
    expect(APP_NAME.length).toBeGreaterThan(0);
  });
});
