import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { EntityConfig, FieldDef } from "@/lib/schema";
import type { CrmType } from "@/lib/api";
import { useCreateRecord } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CreateDialog({
  config,
  type,
}: {
  config: EntityConfig;
  type: CrmType;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const create = useCreateRecord(type);
  const fields = config.fields.filter((f) => f.create);

  const inputType = (f: FieldDef) =>
    f.kind === "currency" || f.kind === "number"
      ? "number"
      : f.kind === "date"
        ? "date"
        : f.kind === "email"
          ? "email"
          : "text";

  const submit = async () => {
    const payload: Record<string, string> = {};
    for (const [k, val] of Object.entries(values)) {
      if (val.trim()) payload[k] = val.trim();
    }
    if (Object.keys(payload).length === 0) {
      toast.error("Compila almeno un campo");
      return;
    }
    try {
      await create.mutateAsync(payload);
      toast.success(`${config.singular} creata su HubSpot`);
      setValues({});
      setOpen(false);
    } catch (err) {
      toast.error(`Creazione non riuscita: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2" data-testid="button-new">
          <Plus className="h-4 w-4" /> Nuovo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova {config.singular.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Il record viene creato direttamente nel CRM HubSpot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`new-${f.key}`}>{f.label}</Label>
              <Input
                id={`new-${f.key}`}
                type={inputType(f)}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((s) => ({ ...s, [f.key]: e.target.value }))
                }
                data-testid={`new-${f.key}`}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={create.isPending}
          >
            Annulla
          </Button>
          <Button onClick={submit} disabled={create.isPending} className="gap-2">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Crea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
