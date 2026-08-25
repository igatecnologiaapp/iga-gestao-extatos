import { describe, expect, it } from "vitest";

import { resolveCompanyContextStatus } from "@/lib/company-context-state";
import type { Company } from "@/lib/domain";

const activeCompany = { id: "company-1", name: "Empresa", status: "ativo" } as Company;
const base = {
  userLoaded: true,
  hasUser: true,
  membershipsLoading: false,
  membershipsError: null,
  allMembershipsCount: 1,
  activeMembershipsCount: 1,
  company: activeCompany,
  role: "admin" as const,
  permissionsLoading: false,
  permissionsError: null,
};

describe("resolveCompanyContextStatus", () => {
  it("mantém carregamento enquanto a sessão ainda não foi resolvida", () => {
    expect(resolveCompanyContextStatus({ ...base, userLoaded: false }).kind).toBe("loading");
  });

  it("transforma erro de user_roles em estado controlado", () => {
    const status = resolveCompanyContextStatus({
      ...base,
      membershipsError: new Error("RLS negou"),
    });
    expect(status).toEqual({ kind: "error", message: "RLS negou" });
  });

  it("distingue usuário sem vínculo", () => {
    expect(
      resolveCompanyContextStatus({ ...base, allMembershipsCount: 0, activeMembershipsCount: 0 })
        .kind,
    ).toBe("no-membership");
  });

  it("distingue vínculo inativo", () => {
    expect(resolveCompanyContextStatus({ ...base, activeMembershipsCount: 0 }).kind).toBe(
      "inactive-membership",
    );
  });

  it("detecta relacionamento de empresa ausente", () => {
    expect(resolveCompanyContextStatus({ ...base, company: null }).kind).toBe("invalid-membership");
  });

  it("bloqueia empresa inativa", () => {
    const company = { ...activeCompany, status: "inativo" } as Company;
    expect(resolveCompanyContextStatus({ ...base, company }).kind).toBe("inactive-company");
  });

  it("transforma erro de permissões em estado controlado", () => {
    const status = resolveCompanyContextStatus({
      ...base,
      permissionsError: { message: "permissions negadas" },
    });
    expect(status).toEqual({ kind: "error", message: "permissions negadas" });
  });

  it("libera somente após empresa, papel e permissões estarem válidos", () => {
    expect(resolveCompanyContextStatus(base)).toEqual({
      kind: "ready",
      company: activeCompany,
      role: "admin",
    });
  });
});
