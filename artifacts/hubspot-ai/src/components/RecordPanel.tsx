import { useEffect, useMemo, useState } from "react";
import { Pencil, X, Check, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { EntityConfig, FieldDef } from "@/lib/schema";
import type { CrmRecord, CrmType } from "@/lib/api";
import { useUpdateRecord } from "@/lib/api";
import { initials, colorFromString, textColorFromString } from "@/lib/format";
import FieldValue from "@/components/FieldValue";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStageOrdered } from "@/lib/stage-context";
import { cn } from "@/lib/utils";

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

interface RecordPanelProps {
  config: EntityConfig;
  type: CrmType;
  record: CrmRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RecordPanel({
  config,
  type,
  record,
  open,
  onOpenChange,
}: RecordPanelProps) {
  const isMobile = useIsMobile();
  const dealStages = useStageOrdered("dealstage");
  const lifecycleStages = useStageOrdered("lifecyclestage");
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const update = useUpdateRecord(type);

  // Reset dello stato quando cambia il record o si chiude il pannello.
  useEffect(() => {
    setEditing(false);
    setEdits({});
  }, [record?.id, open]);

  const editableFields = useMemo(
    () => config.fields.filter((f) => f.editable),
    [config],
  );

  if (!record) return null;
  const title = config.title(record);

  const startEdit = () => {
    const init: Record<string, string> = {};
    for (const f of editableFields) {
      init[f.key] = (record.properties[f.key] ?? "").toString();
    }
    setEdits(init);
    setEditing(true);
  };

  const changed = editableFields.filter(
    (f) => (record.properties[f.key] ?? "").toString() !== (edits[f.key] ?? ""),
  );

  const doSave = async () => {
    const payload: Record<string, string> = {};
    for (const f of changed) payload[f.key] = edits[f.key] ?? "";
    setConfirmOpen(false);
    try {
      await update.mutateAsync({ id: record.id, properties: payload });
      toast.success(`${config.singular} aggiornata su HubSpot`);
      setEditing(false);
    } catch (err) {
      toast.error(`Salvataggio non riuscito: ${(err as Error).message}`);
    }
  };

  const inputType = (f: FieldDef) =>
    f.kind === "currency" || f.kind === "number"
      ? "number"
      : f.kind === "date"
        ? "date"
        : f.kind === "email"
          ? "email"
          : "text";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 p-0",
            isMobile
              ? "h-[88vh] rounded-t-3xl"
              : "w-full sm:max-w-md",
          )}
          data-testid="record-panel"
        >
          {/* Header */}
          <SheetHeader className="space-y-0 border-b border-border p-5 text-left">
            <div className="flex items-center gap-3">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-base font-bold"
                style={{
                  background: colorFromString(title),
                  color: textColorFromString(title),
                }}
              >
                {initials(title)}
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-lg">{title}</SheetTitle>
                <p className="truncate text-[13px] text-muted-foreground">
                  {config.subtitle?.(record) || config.singular}
                </p>
              </div>
            </div>
          </SheetHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            <dl className="space-y-1">
              {config.fields.map((f) => {
                const isEditing = editing && f.editable;
                return (
                  <div
                    key={f.key}
                    className="grid grid-cols-[120px_1fr] items-center gap-3 rounded-lg px-2 py-2 odd:bg-secondary/30"
                  >
                    <dt className="text-[12.5px] font-medium text-muted-foreground">
                      {f.label}
                    </dt>
                    <dd className="text-[14px]">
                      {isEditing ? (
                        f.kind === "stage" ? (
                          <select
                            value={edits[f.key] ?? ""}
                            onChange={(e) =>
                              setEdits((s) => ({ ...s, [f.key]: e.target.value }))
                            }
                            className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                            data-testid={`edit-${f.key}`}
                          >
                            <option value="">—</option>
                            {(f.key === "dealstage"
                              ? dealStages
                              : f.key === "lifecyclestage"
                                ? lifecycleStages
                                : []
                            ).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={
                              f.kind === "date"
                                ? toDateInput(edits[f.key])
                                : (edits[f.key] ?? "")
                            }
                            type={inputType(f)}
                            onChange={(e) =>
                              setEdits((s) => ({ ...s, [f.key]: e.target.value }))
                            }
                            className="h-9"
                            data-testid={`edit-${f.key}`}
                          />
                        )
                      ) : (
                        <FieldValue field={f} value={record.properties[f.key]} />
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-2 border-t border-border p-4">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  className="flex-1 gap-2"
                  onClick={() => setEditing(false)}
                  disabled={update.isPending}
                >
                  <X className="h-4 w-4" /> Annulla
                </Button>
                <Button
                  className="flex-1 gap-2"
                  disabled={changed.length === 0 || update.isPending}
                  onClick={() => setConfirmOpen(true)}
                  data-testid="button-save"
                >
                  {update.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Salva{changed.length ? ` (${changed.length})` : ""}
                </Button>
              </>
            ) : (
              <>
                {record.id && (
                  <a
                    href={`https://app.hubspot.com/contacts/objects/${config.type}/${record.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" /> HubSpot
                  </a>
                )}
                <Button
                  className="ml-auto gap-2"
                  onClick={startEdit}
                  data-testid="button-edit"
                >
                  <Pencil className="h-4 w-4" /> Modifica
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Conferma scrittura su HubSpot (gating UI) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Confermi la modifica su HubSpot?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Stai per aggiornare {changed.length}{" "}
                  {changed.length === 1 ? "campo" : "campi"} di{" "}
                  <strong>{title}</strong>. La modifica è scritta direttamente nel
                  CRM.
                </p>
                <ul className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                  {changed.map((f) => {
                    const raw = edits[f.key] ?? "";
                    let shown = raw || "(vuoto)";
                    if (f.kind === "stage" && raw) {
                      const opts =
                        f.key === "dealstage" ? dealStages : lifecycleStages;
                      shown = opts.find((o) => o.value === raw)?.label || raw;
                    }
                    return (
                      <li key={f.key} className="flex gap-2 py-0.5">
                        <span className="font-medium text-muted-foreground">
                          {f.label}:
                        </span>
                        <span className="truncate">{shown}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={doSave} data-testid="confirm-save">
              Conferma e salva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
