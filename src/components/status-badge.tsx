import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-transparent bg-success/15 text-success",
  warning: "border-transparent bg-warning/25 text-warning-foreground",
  danger: "border-transparent bg-destructive/12 text-destructive",
  neutral: "border-transparent bg-muted text-muted-foreground",
};

export function toneForStatus(status: string | null | undefined): Tone {
  switch (status) {
    case "ativo":
      return "success";
    case "bloqueado":
      return "warning";
    case "cancelado":
      return "danger";
    case "inativo":
    default:
      return "neutral";
  }
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASSES[toneForStatus(status)])}>
      {label}
    </Badge>
  );
}
