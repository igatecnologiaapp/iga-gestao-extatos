import type { AppRole, Company } from "@/lib/domain";

export type CompanyContextStatus =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no-membership" }
  | { kind: "inactive-membership" }
  | { kind: "invalid-membership" }
  | { kind: "inactive-company"; company: Company }
  | { kind: "ready"; company: Company; role: AppRole };

type StatusInput = {
  userLoaded: boolean;
  hasUser: boolean;
  membershipsLoading: boolean;
  membershipsError: unknown;
  allMembershipsCount: number;
  activeMembershipsCount: number;
  company: Company | null;
  role: AppRole | null;
  permissionsLoading: boolean;
  permissionsError: unknown;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Falha desconhecida ao carregar o contexto empresarial.";
}

export function resolveCompanyContextStatus(input: StatusInput): CompanyContextStatus {
  if (!input.userLoaded || (input.hasUser && input.membershipsLoading)) {
    return { kind: "loading" };
  }
  if (input.membershipsError) {
    return { kind: "error", message: errorMessage(input.membershipsError) };
  }
  if (input.allMembershipsCount === 0) return { kind: "no-membership" };
  if (input.activeMembershipsCount === 0) return { kind: "inactive-membership" };
  if (!input.company || !input.role) return { kind: "invalid-membership" };
  if (input.company.status !== "ativo") {
    return { kind: "inactive-company", company: input.company };
  }
  if (input.permissionsLoading) return { kind: "loading" };
  if (input.permissionsError) {
    return { kind: "error", message: errorMessage(input.permissionsError) };
  }
  return { kind: "ready", company: input.company, role: input.role };
}