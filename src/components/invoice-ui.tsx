import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { INVOICE_STATUS_LABELS, type DueTone, type InvoiceDisplayStatus } from "@/lib/invoices";

const STATUS_CLASSES: Record<InvoiceDisplayStatus, string> = {
  aberta: "bg-accent text-accent-foreground",
  fechada: "bg-muted text-foreground",
  vencida: "bg-destructive/12 text-destructive",
  parcialmente_paga: "bg-warning/25 text-warning-foreground",
  paga: "bg-success/15 text-success",
  cancelada: "bg-muted text-muted-foreground line-through",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", STATUS_CLASSES[status])}>
      {INVOICE_STATUS_LABELS[status]}
    </Badge>
  );
}

const TONE_DOT: Record<DueTone, string> = {
  verde: "bg-success",
  amarelo: "bg-warning",
  vermelho: "bg-destructive",
  neutro: "bg-muted-foreground/40",
};

const TONE_LABEL: Record<DueTone, string> = {
  verde: "Situação normal",
  amarelo: "Próximo do vencimento",
  vermelho: "Vencida com saldo pendente",
  neutro: "Sem sinalização",
};

export function DueDot({ tone, className }: { tone: DueTone; className?: string }) {
  return (
    <span
      role="img"
      aria-label={TONE_LABEL[tone]}
      title={TONE_LABEL[tone]}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[tone], className)}
    />
  );
}
