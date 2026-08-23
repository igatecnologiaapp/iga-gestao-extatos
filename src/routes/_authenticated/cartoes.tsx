import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_NAME,
  CARD_BRANDS,
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  type Card,
  type CardStatus,
  type CardType,
} from "@/lib/domain";
import { formatBRL, maskCard, parseBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/cartoes")({
  head: () => ({
    meta: [
      { title: `Cartões — ${APP_NAME}` },
      { name: "description", content: "Cadastro de cartões de crédito e débito da empresa." },
    ],
  }),
  component: CardsPage,
});

type CardWithIssuer = Card & { financial_institutions: { name: string } | null };

type FormState = {
  nickname: string;
  type: CardType;
  brand: string;
  institution_id: string;
  administrator_id: string;
  holder: string;
  last_four_digits: string;
  closing_day: string;
  due_day: string;
  credit_limit: string;
  status: CardStatus;
};

function CardsPage() {
  const { company, user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CardWithIssuer | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const canCreate = hasPermission("card.create");
  const canUpdate = hasPermission("card.update");

  const { data: institutions } = useQuery({
    queryKey: ["institutions", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_institutions")
        .select("id, name")
        .eq("company_id", company!.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cards, isLoading } = useQuery({
    queryKey: ["cards", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("*, financial_institutions(name)")
        .eq("company_id", company!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CardWithIssuer[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards ?? [];
    return (cards ?? []).filter(
      (c) =>
        c.nickname.toLowerCase().includes(q) ||
        (c.brand ?? "").toLowerCase().includes(q) ||
        (c.holder ?? "").toLowerCase().includes(q) ||
        (c.last_four_digits ?? "").includes(q),
    );
  }, [cards, search]);

  function emptyForm(): FormState {
    return {
      nickname: "",
      type: "credito",
      brand: "",
      institution_id: "",
      administrator_id: "",
      holder: "",
      last_four_digits: "",
      closing_day: "",
      due_day: "",
      credit_limit: "",
      status: "ativo",
    };
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(card: CardWithIssuer) {
    setEditing(card);
    setForm({
      nickname: card.nickname,
      type: card.type,
      brand: card.brand ?? "",
      institution_id: card.institution_id ?? "",
      administrator_id: card.administrator_id ?? "",
      holder: card.holder ?? "",
      last_four_digits: card.last_four_digits ?? "",
      closing_day: card.closing_day?.toString() ?? "",
      due_day: card.due_day?.toString() ?? "",
      credit_limit: card.credit_limit?.toString() ?? "",
      status: card.status,
    });
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.last_four_digits && !/^\d{4}$/.test(form.last_four_digits)) {
      toast.error("Informe apenas os 4 dígitos finais do cartão.");
      return;
    }
    const limit = form.credit_limit ? parseBRL(form.credit_limit) : null;
    if (form.credit_limit && limit === null) {
      toast.error("Limite inválido. Use o formato 1.234,56.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nickname: form.nickname,
        type: form.type,
        brand: form.brand || null,
        institution_id: form.institution_id || null,
        administrator_id: form.administrator_id || null,
        holder: form.holder || null,
        last_four_digits: form.last_four_digits || null,
        closing_day: form.closing_day ? Number(form.closing_day) : null,
        due_day: form.due_day ? Number(form.due_day) : null,
        credit_limit: limit,
        status: form.status,
      };
      if (editing) {
        const { error } = await supabase.from("cards").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Cartão atualizado.");
      } else {
        const { error } = await supabase.from("cards").insert({
          ...payload,
          company_id: company!.id,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        toast.success("Cartão cadastrado.");
      }
      await queryClient.invalidateQueries({ queryKey: ["cards", company!.id] });
      await queryClient.invalidateQueries({ queryKey: ["count"] });
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function setCardStatus(card: CardWithIssuer, status: CardStatus) {
    const { error } = await supabase.from("cards").update({ status }).eq("id", card.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Status alterado para ${CARD_STATUS_LABELS[status]}.`);
      queryClient.invalidateQueries({ queryKey: ["cards", company!.id] });
    }
  }

  return (
    <AppShell
      title="Cartões"
      description="Cartões de crédito, débito e múltiplos — sem armazenar CVV ou senha"
      actions={
        canCreate ? (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Novo cartão
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por apelido, bandeira, titular ou final…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={search ? "Nenhum cartão encontrado" : "Nenhum cartão cadastrado"}
          description={
            search
              ? "Ajuste a busca para localizar o cartão."
              : "Cadastre os cartões da empresa guardando apenas os 4 dígitos finais."
          }
          action={
            canCreate && !search ? (
              <Button onClick={openCreate} size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Cadastrar cartão
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cartão</TableHead>
                <TableHead>Bandeira</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Emissor</TableHead>
                <TableHead className="text-center">Fecha / Vence</TableHead>
                <TableHead className="text-right">Limite</TableHead>
                <TableHead className="w-28">Status</TableHead>
                {canUpdate && <TableHead className="w-40 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <p className="font-medium">{card.nickname}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {maskCard(card.last_four_digits)}
                      {card.holder ? ` · ${card.holder}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>{card.brand ?? "—"}</TableCell>
                  <TableCell>{CARD_TYPE_LABELS[card.type]}</TableCell>
                  <TableCell>{card.financial_institutions?.name ?? "—"}</TableCell>
                  <TableCell className="tabular text-center text-muted-foreground">
                    {card.closing_day ?? "—"} / {card.due_day ?? "—"}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatBRL(card.credit_limit)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={card.status} label={CARD_STATUS_LABELS[card.status]} />
                  </TableCell>
                  {canUpdate && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(card)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Select
                          value={card.status}
                          onValueChange={(v) => setCardStatus(card, v as CardStatus)}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CARD_STATUS_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          </DialogHeader>
          {form && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="card-nick">Apelido do cartão</Label>
                  <Input
                    id="card-nick"
                    value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                    required
                    placeholder="Ex.: Cartão Corporativo"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as CardType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CARD_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Bandeira</Label>
                  <Select
                    value={form.brand}
                    onValueChange={(v) => setForm({ ...form, brand: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_BRANDS.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-last4">4 dígitos finais</Label>
                  <Input
                    id="card-last4"
                    value={form.last_four_digits}
                    onChange={(e) =>
                      setForm({ ...form, last_four_digits: e.target.value.replace(/\D/g, "") })
                    }
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="1234"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Banco emissor</Label>
                  <Select
                    value={form.institution_id}
                    onValueChange={(v) => setForm({ ...form, institution_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(institutions ?? []).map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Administradora</Label>
                  <Select
                    value={form.administrator_id}
                    onValueChange={(v) => setForm({ ...form, administrator_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {(institutions ?? []).map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="card-holder">Titular</Label>
                  <Input
                    id="card-holder"
                    value={form.holder}
                    onChange={(e) => setForm({ ...form, holder: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-limit">Limite (R$)</Label>
                  <Input
                    id="card-limit"
                    value={form.credit_limit}
                    onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="card-closing">Dia fechamento</Label>
                  <Input
                    id="card-closing"
                    value={form.closing_day}
                    onChange={(e) =>
                      setForm({ ...form, closing_day: e.target.value.replace(/\D/g, "") })
                    }
                    inputMode="numeric"
                    maxLength={2}
                    min={1}
                    max={31}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-due">Dia vencimento</Label>
                  <Input
                    id="card-due"
                    value={form.due_day}
                    onChange={(e) =>
                      setForm({ ...form, due_day: e.target.value.replace(/\D/g, "") })
                    }
                    inputMode="numeric"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as CardStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CARD_STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Por segurança, nunca informe CVV, senha ou o número completo do cartão.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
