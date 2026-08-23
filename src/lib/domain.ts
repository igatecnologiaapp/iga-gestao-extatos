import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type InstitutionType = Database["public"]["Enums"]["institution_type"];
export type AccountType = Database["public"]["Enums"]["account_type"];
export type CardType = Database["public"]["Enums"]["card_type"];
export type CardStatus = Database["public"]["Enums"]["card_status"];
export type RecordStatus = Database["public"]["Enums"]["record_status"];

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Institution = Database["public"]["Tables"]["financial_institutions"]["Row"];
export type BankAccount = Database["public"]["Tables"]["bank_accounts"]["Row"];
export type Card = Database["public"]["Tables"]["cards"]["Row"];
export type Category = Database["public"]["Tables"]["transaction_categories"]["Row"];
export type Subcategory = Database["public"]["Tables"]["transaction_subcategories"]["Row"];
export type UserRole = Database["public"]["Tables"]["user_roles"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AuditEntry = Database["public"]["Tables"]["audit_log"]["Row"];

export const APP_NAME = "Gestor de Extratos";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  consulta: "Consulta",
  auditor: "Auditor",
};

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  banco: "Banco",
  cooperativa: "Cooperativa",
  fintech: "Fintech",
  administradora_cartao: "Administradora de cartão",
  instituicao_pagamento: "Instituição de pagamento",
  outra: "Outra",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corrente: "Corrente",
  poupanca: "Poupança",
  pagamento: "Pagamento",
  investimento: "Investimento",
  outra: "Outra",
};

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  credito: "Crédito",
  debito: "Débito",
  credito_debito: "Crédito e Débito",
};

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  ativo: "Ativo",
  bloqueado: "Bloqueado",
  cancelado: "Cancelado",
  inativo: "Inativo",
};

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Alteração",
  status_change: "Mudança de status",
  delete: "Exclusão",
  role_change: "Mudança de papel",
  invite: "Convite de usuário",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  companies: "Empresa",
  financial_institutions: "Instituição financeira",
  bank_accounts: "Conta bancária",
  cards: "Cartão",
  transaction_categories: "Categoria",
  transaction_subcategories: "Subcategoria",
  user_roles: "Usuário/Papel",
};

export const PERMISSION_LABELS: Record<string, string> = {
  "institution.view": "Visualizar instituições",
  "institution.create": "Cadastrar instituições",
  "institution.update": "Editar instituições",
  "institution.inactivate": "Inativar instituições",
  "account.view": "Visualizar contas",
  "account.create": "Cadastrar contas",
  "account.update": "Editar contas",
  "account.inactivate": "Inativar contas",
  "card.view": "Visualizar cartões",
  "card.create": "Cadastrar cartões",
  "card.update": "Editar cartões",
  "card.inactivate": "Inativar cartões",
  "category.view": "Visualizar categorias",
  "category.manage": "Gerenciar categorias",
  "transaction.view": "Visualizar lançamentos",
  "transaction.manage": "Gerenciar lançamentos",
  "import.execute": "Importar documentos",
  "reconciliation.execute": "Executar conciliação",
  "report.view": "Visualizar relatórios",
  "audit.view": "Visualizar auditoria",
  "company.manage": "Gerenciar empresa",
  "member.manage": "Gerenciar usuários",
};

export const CARD_BRANDS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"];
