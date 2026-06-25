import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExportButtonProps {
  /** Percorso del file da scaricare, es. "/api/exports/pipeline.xlsx". */
  href: string;
  filename: string;
  label: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
  testId?: string;
}

/**
 * Scarica un file dal backend in modo DETERMINISTICO (fetch → blob → download),
 * con feedback toast. Nessun prompt, nessun passaggio dall'assistente.
 */
export default function ExportButton({
  href,
  filename,
  label,
  variant = "default",
  className,
  testId,
}: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Preparo il file…");
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("File scaricato", { id: t });
    } catch (err) {
      toast.error(`Export non riuscito: ${String((err as Error).message)}`, {
        id: t,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={handle}
      disabled={busy}
      variant={variant}
      className={cn("gap-2", className)}
      data-testid={testId}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
