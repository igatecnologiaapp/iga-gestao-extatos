import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/lib/backend-client";
import { APP_NAME, RECORD_STATUS_LABELS, type Company } from "@/lib/domain";
import { stablePattern } from "@/lib/importers/classification-memory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/regras-classificacao")({
  head: () => ({
    meta: [
      { title: `Regras de Classificação — ${APP_NAME}` },
      { name: "description", content: "Memória de classificação: padrões aprendidos e regras manuais por empresa." },
      { property: "og:title", content: `Regras de Classificação — ${APP_NAME}` },
      { property: "og:description", content: "Padrões de descrição que classificam lançamentos futuros automaticamente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireCompany>{({ company }) => <RulesContent company={company} />}</RequireCompany>
  ),
});

type Rule = {
  id: string;
  pattern: string;
  match_type: "exata" | "contem";
  category_id: string;
  subcategory_id: string | null;
  origin: "aprendida" | "manual";
  usage_count: number;
  rejected_count: number;
  sample_description: string | null;
  status: "ativo" | "inativo";
};

const NONE = "__none__";

function RulesContent({ company }: { company: Company }) {
  const { hasPermission, user } = useCompany();
  const canManage = hasPermission("category.manage");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["classification-rules", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classification_rules")
        .select("id, pattern, match_type, category_id, subcategory_id, origin, usage_count, rejected_count, sample_description, status")
        .eq("company_id", company.id)
        .order("pattern");
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });
  const { data: cats } = useQuery({
    queryKey: ["categories-all-min", company.id],
    queryFn: async () =>
      (await supabase.from("transaction_categories").select("id, name, status").eq("company_id", company.id).order("name")).data ?? [],
  });
  const { data: subs } = useQuery({
    queryKey: ["subcategories-all-min", company.id],
    queryFn: async () =>
      (await supabase.from("transaction_subcategories").select("id, name, category_id, status").eq("company_id", company.id).order("name")).data ?? [],
  });

  const catName = (id: string) => cats?.find((c) => c.id === id)?.name ?? "—";
  const subName = (id: string | null) => (id ? subs?.find((s) => s.id === id)?.name ?? "—" : "—");
  const conflictPatterns = new Set(
    Object.entries(
      (rules ?? []).filter((r) => r.status === "ativo").reduce<Record<string, Set<string>>>((acc, r) => {
        (acc[r.pattern] ??= new Set()).add(`${r.category_id}|${r.subcategory_id ?? ""}`);
        return acc;
      }, {}),
    )
      .filter(([, set]) => set.size > 1)
      .map(([p]) => p),
  );

  function situation(r: Rule): string {
    if (r.status !== "ativo") return "Desativada";
    if (conflictPatterns.has(r.pattern)) return "Ambígua — apenas sugere";
    if (r.rejected_count > 0) return `Corrigida ${r.rejected_count}x — apenas sugere`;
    const cat = cats?.find((c) => c.id === r.category_id);
    const sub = r.subcategory_id ? subs?.find((s) => s.id === r.subcategory_id) : null;
    if (cat?.status !== "ativo" || (r.subcategory_id && sub?.status !== "ativo")) return "Categoria inativa — revisar";
    return "Aplicação automática";
  }

  async function toggle(r: Rule) {
    const { error } = await supabase
      .from("classification_rules")
      .update({ status: r.status === "ativo" ? "inativo" : "ativo" })
      .eq("id", r.id);
    if (error) return toast.error(`Não foi possível alterar: ${error.message}`);
    toast.success(r.status === "ativo" ? "Regra desativada." : "Regra reativada.");
    await qc.invalidateQueries({ queryKey: ["classification-rules", company.id] });
  }

  return (
    <AppShell
      title="Regras de Classificação"
      description="Classificações manuais viram regras da empresa e são aplicadas a novos lançamentos. Lançamentos já confirmados não são alterados."
      actions={canManage ? <Button onClick={() => setEditing("new")}>Nova regra</Button> : undefined}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : (rules ?? []).length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Nenhuma regra ainda"
          description="Ao classificar manualmente um lançamento, o sistema memoriza a decisão aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Padrão</TableHead>
                <TableHead>Correspondência</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Subcategoria</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Usos</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-mono text-xs">{r.pattern}</p>
                    {r.sample_description && <p className="text-[11px] text-muted-foreground">ex.: {r.sample_description}</p>}
                  </TableCell>
                  <TableCell className="text-xs">{r.match_type === "exata" ? "Exata" : "Contém"}</TableCell>
                  <TableCell>{catName(r.category_id)}</TableCell>
                  <TableCell>{subName(r.subcategory_id)}</TableCell>
                  <TableCell className="text-xs">{r.origin === "aprendida" ? "Aprendida" : "Manual"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.usage_count}</TableCell>
                  <TableCell className="text-xs">{situation(r)}</TableCell>
                  <TableCell><StatusBadge status={r.status} label={RECORD_STATUS_LABELS[r.status]} /></TableCell>
                  {canManage && (
                    <TableCell className="whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label="Editar regra" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggle(r)}>
                        {r.status === "ativo" ? "Desativar" : "Reativar"}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && (
        <RuleDialog
          company={company}
          userId={user?.id ?? null}
          rule={editing === "new" ? null : editing}
          cats={(cats ?? []).filter((c) => c.status === "ativo")}
          subs={(subs ?? []).filter((s) => s.status === "ativo")}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await qc.invalidateQueries({ queryKey: ["classification-rules", company.id] });
          }}
        />
      )}
    </AppShell>
  );
}

function RuleDialog({
  company, userId, rule, cats, subs, onClose, onSaved,
}: {
  company: Company;
  userId: string | null;
  rule: Rule | null;
  cats: Array<{ id: string; name: string }>;
  subs: Array<{ id: string; name: string; category_id: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [matchType, setMatchType] = useState<"exata" | "contem">(rule?.match_type ?? "contem");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(rule?.subcategory_id ?? NONE);
  const [busy, setBusy] = useState(false);

  async function save() {
    const p = stablePattern(pattern);
    if (p.length < 3) return toast.error("Informe um padrão com pelo menos 3 letras (números são ignorados).");
    if (!categoryId) return toast.error("Selecione a categoria.");
    setBusy(true);
    const values = {
      pattern: p,
      match_type: matchType,
      category_id: categoryId,
      subcategory_id: subcategoryId === NONE ? null : subcategoryId,
      // Editar uma regra zera as rejeições: passa a ser decisão explícita do usuário.
      rejected_count: 0,
    };
    const { error } = rule
      ? await supabase.from("classification_rules").update({ ...values, origin: "manual" }).eq("id", rule.id)
      : await supabase.from("classification_rules").insert({ ...values, company_id: company.id, origin: "manual", created_by: userId });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Já existe uma regra igual." : `Não foi possível salvar: ${error.message}`);
      return;
    }
    toast.success("Regra salva.");
    await onSaved();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{rule ? "Editar regra" : "Nova regra"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-pattern">Padrão da descrição</Label>
            <Input id="r-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="ex.: getninjas" />
            <p className="text-xs text-muted-foreground">Maiúsculas, acentos, datas, parcelas e números são ignorados.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Correspondência</Label>
            <Select value={matchType} onValueChange={(v) => setMatchType(v as "exata" | "contem")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="exata">Exata (descrição inteira)</SelectItem>
                <SelectItem value="contem">Contém as palavras</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSubcategoryId(NONE); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subcategoria</Label>
              <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {subs.filter((s) => s.category_id === categoryId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
