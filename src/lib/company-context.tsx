import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Company } from "@/lib/domain";
import {
  resolveCompanyContextStatus,
  type CompanyContextStatus,
} from "@/lib/company-context-state";

export type Membership = {
  id: string;
  company_id: string;
  role: AppRole;
  status: "ativo" | "inativo";
  companies: Company | null;
};

type CompanyContextValue = {
  user: User | null;
  memberships: Membership[];
  hasOnlyInactiveMemberships: boolean;
  company: Company | null;
  role: AppRole | null;
  permissions: Set<string>;
  hasPermission: (key: string) => boolean;
  setCompanyId: (id: string) => void;
  loading: boolean;
  status: CompanyContextStatus;
  retry: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

const STORAGE_KEY = "gestor-extratos:company";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setUserLoaded(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setUser(session?.user ?? null);
        setUserLoaded(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Garante que o perfil exista (não usamos trigger no schema auth por segurança).
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name: (user.user_metadata?.["full_name"] as string | undefined) ?? null,
        },
        { onConflict: "id" },
      )
      .then(({ error }) => {
        if (error) console.error("[CompanyProvider] Falha ao sincronizar perfil", error);
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const membershipsQuery = useQuery({
    queryKey: ["memberships", user?.id],
    enabled: !!user,
    retry: 1,
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, company_id, role, status, companies(*)")
        .eq("user_id", userId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Membership[];
    },
  });

  const allMemberships = membershipsQuery.data ?? [];
  const memberships = useMemo(
    () => allMemberships.filter((m) => m.status === "ativo"),
    [allMemberships],
  );
  const hasOnlyInactiveMemberships =
    membershipsQuery.isSuccess && allMemberships.length > 0 && memberships.length === 0;

  const company = useMemo(() => {
    if (memberships.length === 0) return null;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const found = memberships.find((m) => m.company_id === (selectedCompanyId ?? stored));
    return (found ?? memberships[0])?.companies ?? null;
  }, [memberships, selectedCompanyId]);

  const role = useMemo(() => {
    if (!company) return null;
    return memberships.find((m) => m.company_id === company.id)?.role ?? null;
  }, [memberships, company]);

  const permissionsQuery = useQuery({
    queryKey: ["role-permissions", role],
    enabled: !!role,
    retry: 1,
    queryFn: async () => {
      const selectedRole = role;
      if (!selectedRole) return new Set<string>();
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .eq("role", selectedRole);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.permission_key));
    },
  });

  const permissions = permissionsQuery.data ?? new Set<string>();

  const status = resolveCompanyContextStatus({
    userLoaded,
    hasUser: !!user,
    membershipsLoading: membershipsQuery.isLoading,
    membershipsError: membershipsQuery.error,
    allMembershipsCount: allMemberships.length,
    activeMembershipsCount: memberships.length,
    company,
    role,
    permissionsLoading: permissionsQuery.isLoading,
    permissionsError: permissionsQuery.error,
  });

  const value: CompanyContextValue = {
    user,
    memberships,
    hasOnlyInactiveMemberships,
    company,
    role,
    permissions,
    hasPermission: (key) => permissions.has(key),
    setCompanyId: (id) => {
      setSelectedCompanyId(id);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
    },
    loading: status.kind === "loading",
    status,
    retry: async () => {
      await Promise.all([membershipsQuery.refetch(), permissionsQuery.refetch()]);
    },
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany deve ser usado dentro de CompanyProvider");
  return ctx;
}
