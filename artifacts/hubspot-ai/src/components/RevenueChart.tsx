import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChevronRight, X, Info, TrendingUp } from "lucide-react";
import { useRevenue } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Palette sobria con profondità (indaco): contrattualizzato pieno, proiezione
// come stima (tratteggio translucido).
const C_CONTRACT = "#4F46E5";
const C_PROJECT = "#C7D2FE";

const eur0 = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const fmtEur = (n: number) => eur0.format(Math.round(n || 0));
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1_000) return Math.round(n / 1_000) + "k";
  return String(Math.round(n));
}

// Barra con angoli superiori arrotondati SOLO sul segmento più in alto.
function roundedTopPath(x: number, y: number, w: number, h: number, r: number): string {
  const rad = Math.max(0, Math.min(r, w / 2, h));
  if (rad <= 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return `M${x},${y + h} L${x},${y + rad} Q${x},${y} ${x + rad},${y} L${x + w - rad},${y} Q${x + w},${y} ${x + w},${y + rad} L${x + w},${y + h} Z`;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
function ContractedBar(props: any) {
  const { x, y, width, height, fill, payload } = props;
  if (!height || height <= 0) return null;
  const isTop = !(payload?.projected > 0); // arrotonda solo se non c'è proiezione sopra
  return <path d={roundedTopPath(x, y, width, height, isTop ? 7 : 0)} fill={fill} />;
}
function ProjectedBar(props: any) {
  const { x, y, width, height, fill } = props;
  if (!height || height <= 0) return null;
  return <path d={roundedTopPath(x, y, width, height, 7)} fill={fill} />;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as { contracted: number; projected: number };
  const total = (row.contracted || 0) + (row.projected || 0);
  return (
    <div className="rounded-xl border border-black/5 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="mb-1 text-[12px] font-semibold text-slate-900">{label}</div>
      <Legend dot={C_CONTRACT} label="Contrattualizzato" value={fmtEur(row.contracted)} />
      {row.projected > 0 && (
        <Legend hatch label="Proiezione" value={fmtEur(row.projected)} />
      )}
      <div className="mt-1 flex items-center justify-between gap-6 border-t border-black/5 pt-1 text-[12px]">
        <span className="font-medium text-slate-500">Totale</span>
        <span className="font-bold tabular-nums text-slate-900">{fmtEur(total)}</span>
      </div>
      <div className="mt-1 text-[10.5px] text-slate-400">Tocca per il dettaglio</div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function Legend({
  dot,
  hatch,
  label,
  value,
}: {
  dot?: string;
  hatch?: boolean;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 text-[12px]">
      <span className="flex items-center gap-1.5 text-slate-500">
        <span
          className="inline-block h-2.5 w-2.5 rounded-[3px]"
          style={
            hatch
              ? {
                  backgroundImage: `repeating-linear-gradient(45deg, ${C_PROJECT}, ${C_PROJECT} 2px, #EEF2FF 2px, #EEF2FF 4px)`,
                }
              : { background: dot }
          }
        />
        {label}
      </span>
      {value && <span className="font-semibold tabular-nums text-slate-700">{value}</span>}
    </div>
  );
}

export default function RevenueChart() {
  const { data, isLoading, error } = useRevenue();
  const [selected, setSelected] = useState<number | null>(null);

  const { chartData, projOnly } = useMemo(() => {
    if (!data) return { chartData: [] as Array<{ year: number; contracted: number; projected: number }>, projOnly: new Set<number>() };
    const contracted = new Map(data.revenueByYear.map((r) => [r.year, r.value]));
    const projected = new Map(data.projectedByYear.map((r) => [r.year, r.value]));
    const years = [...new Set([...contracted.keys(), ...projected.keys()])].sort((a, b) => a - b);
    const po = new Set(years.filter((y) => !contracted.has(y) && projected.has(y)));
    return {
      chartData: years.map((year) => ({
        year,
        contracted: contracted.get(year) || 0,
        projected: projected.get(year) || 0,
      })),
      projOnly: po,
    };
  }, [data]);

  if (isLoading) return <Skeleton className="h-[420px] w-full rounded-3xl" />;
  if (error)
    return (
      <Card>
        <p className="text-sm font-semibold text-destructive">Fatturato non disponibile</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{String((error as Error).message)}</p>
      </Card>
    );
  if (!data || chartData.length === 0)
    return (
      <Card>
        <Header total={0} projected={0} assumptions="" />
        <div className="grid h-[200px] place-items-center text-sm text-muted-foreground">
          Nessun dato di fatturato.
        </div>
      </Card>
    );

  return (
    <Card>
      <Header total={data.totalScheduled} projected={data.totalProjected} assumptions={data.assumptions} />

      {/* Legenda */}
      <div className="mb-1 mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <Legend dot={C_CONTRACT} label="Contrattualizzato" />
        <Legend hatch label="Proiezione rinnovi (stima)" />
      </div>

      <div className="-ml-2">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={chartData}
            margin={{ top: 16, right: 8, left: 4, bottom: 4 }}
            barCategoryGap="28%"
            onClick={(s: { activeLabel?: string | number } | null) => {
              if (s?.activeLabel != null) setSelected(Number(s.activeLabel));
            }}
          >
            <defs>
              <linearGradient id="rcContract" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#4338CA" />
              </linearGradient>
              <pattern id="rcProject" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill="#EEF2FF" />
                <line x1="0" y1="0" x2="0" y2="7" stroke={C_PROJECT} strokeWidth="3.5" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="#EEF1F6" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              interval={0}
              height={34}
              tick={(p: { x: number; y: number; payload: { value: number } }) => {
                const yr = Number(p.payload.value);
                const proj = projOnly.has(yr);
                return (
                  <g transform={`translate(${p.x},${p.y})`}>
                    <text x={0} dy={14} textAnchor="middle" fontSize={11.5} fontWeight={proj ? 500 : 700} fill={proj ? "#94A3B8" : "#334155"}>
                      {yr}
                    </text>
                    {proj && (
                      <text x={0} dy={26} textAnchor="middle" fontSize={8.5} fill="#A5B4FC">
                        stima
                      </text>
                    )}
                  </g>
                );
              }}
            />
            <YAxis
              tickFormatter={(v: number) => "€" + compact(v)}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
            />
            <Tooltip cursor={{ fill: "rgba(79,70,229,0.06)" }} content={<ChartTooltip />} />
            <Bar dataKey="contracted" stackId="rev" fill="url(#rcContract)" shape={<ContractedBar />} isAnimationActive={false} />
            <Bar dataKey="projected" stackId="rev" fill="url(#rcProject)" shape={<ProjectedBar />} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-1 px-1 text-[11.5px] text-muted-foreground">
        Tocca una colonna per vedere il dettaglio deal per deal di quell'anno.
      </p>

      {selected != null && data && (
        <YearDetail year={selected} data={data} onClose={() => setSelected(null)} />
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] sm:p-6">
      {children}
    </section>
  );
}

function Header({ total, projected, assumptions }: { total: number; projected: number; assumptions: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <TrendingUp className="h-4.5 w-4.5" strokeWidth={2.2} />
          </span>
          <h2 className="text-[17px] font-bold tracking-tight text-slate-900">Fatturato per anno</h2>
        </div>
        <p className="mt-0.5 text-[12.5px] text-slate-500">
          Contrattualizzato vs proiezione dei rinnovi oltre la durata dei contratti.
        </p>
      </div>
      <div className="flex items-stretch gap-2">
        <Stat label="Contrattualizzato" value={fmtEur(total)} tone="contract" />
        <Stat label="Proiezione" value={fmtEur(projected)} tone="project" hint={assumptions} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "contract" | "project";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-[112px] rounded-2xl px-3 py-2",
        tone === "contract" ? "bg-indigo-50/70" : "bg-slate-50",
      )}
    >
      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
        {label}
        {hint && (
          <span title={hint} className="cursor-help text-slate-400">
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className={cn("text-[16px] font-bold tabular-nums", tone === "contract" ? "text-indigo-700" : "text-slate-700")}>
        {value}
      </div>
    </div>
  );
}

function YearDetail({
  year,
  data,
  onClose,
}: {
  year: number;
  data: import("@/lib/api").RevenueDetail;
  onClose: () => void;
}) {
  const rows = useMemo(() => {
    const y = String(year);
    return data.deals
      .map((d) => ({ d, c: d.schedule[y] || 0, p: d.projectedSchedule[y] || 0 }))
      .filter((r) => r.c > 0 || r.p > 0)
      .sort((a, b) => b.c + b.p - (a.c + a.p));
  }, [data, year]);

  const totC = rows.reduce((a, r) => a + r.c, 0);
  const totP = rows.reduce((a, r) => a + r.p, 0);
  const max = Math.max(1, ...rows.map((r) => r.c + r.p));

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-black/[0.06] bg-slate-50/60">
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] bg-white px-4 py-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold text-slate-900">Anno {year}</span>
            <span className="text-[12px] text-slate-500">· {rows.length} deal</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: C_CONTRACT }} />
              <span className="text-slate-500">Contrattualizzato</span>
              <b className="tabular-nums text-slate-800">{fmtEur(totC)}</b>
            </span>
            {totP > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-[2px]"
                  style={{ backgroundImage: `repeating-linear-gradient(45deg, ${C_PROJECT}, ${C_PROJECT} 1.5px, #EEF2FF 1.5px, #EEF2FF 3px)` }}
                />
                <span className="text-slate-500">Proiezione</span>
                <b className="tabular-nums text-slate-800">{fmtEur(totP)}</b>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Chiudi dettaglio"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="divide-y divide-black/[0.04]">
        {rows.map((r) => (
          <li key={r.d.code} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-semibold text-slate-900">{r.d.name}</span>
                {r.d.country && (
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500">
                    {r.d.country}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
                  <span className="flex h-full">
                    <span className="h-full rounded-l-full" style={{ width: `${(r.c / max) * 100}%`, background: C_CONTRACT }} />
                    <span
                      className="h-full"
                      style={{
                        width: `${(r.p / max) * 100}%`,
                        backgroundImage: `repeating-linear-gradient(45deg, ${C_PROJECT}, ${C_PROJECT} 2px, #EEF2FF 2px, #EEF2FF 4px)`,
                      }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{r.d.stage}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[13.5px] font-bold tabular-nums text-slate-900">{fmtEur(r.c + r.p)}</div>
              <div className="text-[10.5px] tabular-nums text-slate-400">
                {r.c > 0 && <span>{fmtEur(r.c)}</span>}
                {r.p > 0 && <span className="text-indigo-400"> +{fmtEur(r.p)} stima</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
