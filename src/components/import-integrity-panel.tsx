import { useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";

import type { ImportIntegrity } from "@/lib/importers";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS: Record<ImportIntegrity["status"], { label: string; cls: string }> = {
  validada: { label: "Validada", cls: "border-primary/40 bg-primary/10 text-foreground" },
  revisao: { label: "Requer revisão", cls: "border-amber-500/40 bg-amber-500/10 text-foreground" },
  divergente: { label: "Divergente", cls: "border-destructive/50 bg-destructive/10 text-foreground" },
};

export function ImportIntegrityPanel(props: {
  integrity: ImportIntegrity | null;
  /** Total atual (compras/despesas − créditos) dos itens pendentes na Revisão. */
  currentTotal: number | null;
  canAct: boolean;
  canReprocess: boolean;
  busy: boolean;
  onReprocess: () => void;
  onOverride: (reason: string) => Promise<void>;
}) {
  const { integrity } = props;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!integrity) {
    return props.canAct && props.canReprocess ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-sm">
        <span className="text-muted-foreground">
          Este lote foi lido antes do controle de integridade. Reprocesse para conferir os totais do documento.
        </span>
        <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onReprocess}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Reprocessar documento
        </Button>
      </div>
    ) : null;
  }

  const st = STATUS[integrity.status];
  const Icon = integrity.status === "validada" ? ShieldCheck : ShieldAlert;
  const liveDiff =
    integrity.declared_total !== null && props.currentTotal !== null
      ? Math.round((integrity.declared_total - props.currentTotal) * 100) / 100
      : null;

  return (
    <div className={`space-y-3 rounded-md border p-4 text-sm ${st.cls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Icon className="h-4 w-4" />
          Integridade da importação: {st.label.toUpperCase()}
          {integrity.status === "divergente" && " — DIVERGÊNCIA DE INTEGRIDADE"}
        </p>
        {props.canAct && props.canReprocess && (
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onReprocess}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Reprocessar documento
          </Button>
        )}
      </div>

      <ul className="list-disc pl-5 text-muted-foreground">
        {integrity.messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>

      {integrity.declared_total !== null && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Metric label="Total identificado no documento" value={formatBRL(integrity.declared_total)} />
          <Metric label="Total reconstruído pelo sistema" value={formatBRL(integrity.extracted_total ?? 0)} />
          <Metric label="Diferença" value={formatBRL(integrity.difference ?? 0)} />
        </div>
      )}

      {integrity.sections.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Seção</th>
                <th className="py-1 pr-3">Registros</th>
                <th className="py-1 pr-3">Compras/despesas</th>
                <th className="py-1 pr-3">Créditos/estornos</th>
                <th className="py-1 pr-3">Pagamentos</th>
                <th className="py-1 pr-3">Declarado</th>
                <th className="py-1">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {integrity.sections.map((s) => (
                <tr key={s.key} className="border-t border-border/60">
                  <td className="py-1 pr-3">{s.label}</td>
                  <td className="py-1 pr-3">{s.count}</td>
                  <td className="py-1 pr-3">{formatBRL(s.purchases_total)}</td>
                  <td className="py-1 pr-3">{formatBRL(s.credits_total)}</td>
                  <td className="py-1 pr-3">{s.payments_total ? `-${formatBRL(s.payments_total)}` : "—"}</td>
                  <td className="py-1 pr-3">{s.declared_total === null ? "—" : formatBRL(s.declared_total)}</td>
                  <td className="py-1">{s.difference === null ? "—" : formatBRL(s.difference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {liveDiff !== null && Math.abs(liveDiff) >= 0.01 && (
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Após as edições na Revisão, os itens pendentes somam {formatBRL(props.currentTotal ?? 0)} — diferença de{" "}
          {formatBRL(liveDiff)} em relação ao documento.
        </p>
      )}

      {integrity.anomalies.length > 0 && (
        <details>
          <summary className="cursor-pointer">Anomalias estruturais ({integrity.anomalies.length})</summary>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {integrity.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        Leitor: {integrity.parser} · Layout: {integrity.layout} · {integrity.row_count} registro(s)
      </p>

      {integrity.status === "divergente" &&
        (integrity.override ? (
          <p className="text-xs">
            Decisão registrada por {integrity.override.email ?? "usuário"} em {formatDate(integrity.override.at.slice(0, 10))}:{" "}
            “{integrity.override.reason}”
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">A importação requer revisão antes da confirmação.</span>
            {props.canAct && (
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                Registrar decisão para confirmar mesmo assim
              </Button>
            )}
          </div>
        ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar apesar da divergência</DialogTitle>
            <DialogDescription>
              Os valores não serão ajustados. A decisão, a justificativa e o seu usuário ficarão registrados na auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="override-reason">Justificativa</Label>
            <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={props.busy || reason.trim().length < 10}
              onClick={async () => {
                await props.onOverride(reason);
                setOpen(false);
                setReason("");
              }}
            >
              Registrar decisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/60 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
