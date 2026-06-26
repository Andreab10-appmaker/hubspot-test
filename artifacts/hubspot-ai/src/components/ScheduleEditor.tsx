import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Editor user-friendly per la "Distribuzione fatturato per anno": righe
 * anno→importo con aggiungi/rimuovi. Serializza in JSON {anno:importo} (la
 * stessa forma di `revenue_schedule` su HubSpot), così l'utente non tocca il JSON.
 */
export default function ScheduleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (json: string) => void;
}) {
  let obj: Record<string, number> = {};
  try {
    const p = JSON.parse(value || "{}");
    if (p && typeof p === "object" && !Array.isArray(p)) obj = p as Record<string, number>;
  } catch {
    obj = {};
  }
  const rows = Object.keys(obj)
    .filter((y) => /^\d{4}$/.test(y))
    .sort()
    .map((y) => ({ year: y, amount: Number(obj[y]) || 0 }));

  const serialize = (list: Array<{ year: string; amount: number }>) => {
    const out: Record<string, number> = {};
    for (const r of list) {
      if (/^\d{4}$/.test(r.year)) out[r.year] = r.amount;
    }
    onChange(JSON.stringify(out));
  };

  const setRow = (i: number, patch: Partial<{ year: string; amount: number }>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    serialize(next);
  };
  const removeRow = (i: number) => serialize(rows.filter((_, idx) => idx !== i));
  const addRow = () => {
    const lastYear = rows.length ? Number(rows[rows.length - 1].year) : new Date().getFullYear();
    serialize([...rows, { year: String(lastYear + 1), amount: 0 }]);
  };

  const total = rows.reduce((a, r) => a + (r.amount || 0), 0);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={r.year}
            inputMode="numeric"
            onChange={(e) => setRow(i, { year: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
            className="h-8 w-16 text-center"
            aria-label="Anno"
          />
          <Input
            value={String(r.amount)}
            type="number"
            onChange={(e) => setRow(i, { amount: Number(e.target.value) || 0 })}
            className="h-8 flex-1"
            aria-label="Importo €"
          />
          <span className="text-[12px] text-muted-foreground">€</span>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Rimuovi anno"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[12px]"
          onClick={addRow}
        >
          <Plus className="h-3.5 w-3.5" /> Aggiungi anno
        </Button>
        <span className="text-[11.5px] text-muted-foreground tabular-nums">
          Totale {total.toLocaleString("it-IT")} €
        </span>
      </div>
    </div>
  );
}
