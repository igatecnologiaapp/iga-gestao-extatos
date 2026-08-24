import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ScrollText } from "lucide-react";

import { AccessDenied, AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_NAME,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  type AuditEntry,
  type Company,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({
    meta: [
      { title: `Auditoria — ${APP_NAME}` },
      {
        name: "description",
        content: "Trilha de auditoria de criações, alterações e mudanças de status.",
      },
    ],
  }),
  component: AuditPage,
});

function summarize(entry: AuditEntry): string {
  const parts: string[] = [];
  const newData = (entry.new_data ?? {}) as Record<string, unknown>;
  const oldData = (entry.old_data ?? {}) as Record<string, unknown>;

  if (typeof newData["name"] === "string") parts.push(newData["name"] as string);
  else if (typeof newData["nickname"] === "string") parts.push(newData["nickname"] as string);
  else if (typeof newData["email"] === "string") parts.push(newData["email"] as string);

  if (entry.action === "status_change" || entry.action === "update") {
    const oldStatus = oldData["status"];
    const newStatus = newData["status"];
    if (oldStatus !== newStatus && newStatus) parts.push(`status → ${String(newStatus)}`);
  }
  if (entry.action === "role_change" || typeof newData["role"] === "string") {
    if (newData["role"]) parts.push(`papel → ${String(newData["role"])}`);
  }
  return parts.join(" · ") || "—";
}

function AuditPage() {
  return (
    <RequireCompany>
      {({ company }) => <AuditContent company={company} />}
    </RequireCompany>
  );
}

function AuditContent({ company }: { company: Company }) {
  const { hasPermission } = useCompany();
  const allowed = hasPermission("audit.view");

  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit", company!.id, entityFilter, actionFilter, dateFrom, dateTo],
    enabled: allowed,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (entityFilter !== "all") q = q.eq("entity", entityFilter);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const entities = useMemo(() => Object.entries(AUDIT_ENTITY_LABELS), []);
  const actions = useMemo(() => Object.entries(AUDIT_ACTION_LABELS), []);

  return (
    <AppShell
      title="Auditoria"
      description="Registro imutável de todas as ações realizadas na empresa"
    >
      {!allowed ? (
        <AccessDenied message="A trilha de auditoria é exclusiva dos papéis Administrador e Auditor." />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Entidade</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {entities.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ação</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {actions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (entries ?? []).length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Nenhum registro no período"
              description="Ajuste os filtros ou realize ações nos cadastros para gerar registros de auditoria."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Resumo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(entries ?? []).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        {entry.user_email ?? "sistema"}
                      </TableCell>
                      <TableCell>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</TableCell>
                      <TableCell>{AUDIT_ENTITY_LABELS[entry.entity] ?? entry.entity}</TableCell>
                      <TableCell className="max-w-72 truncate text-muted-foreground">
                        {summarize(entry)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Exibindo os 200 registros mais recentes do filtro aplicado. Os registros não podem
            ser editados ou excluídos.
          </p>
        </>
      )}
    </AppShell>
  );
}
