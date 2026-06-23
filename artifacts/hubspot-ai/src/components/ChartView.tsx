import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ChartSpec } from '../lib/types';

const COLORS = [
  '#FF7A59',
  '#2D3E50',
  '#00A4BD',
  '#F5C26B',
  '#516F90',
  '#7FD1AE',
  '#9FB0C5',
  '#FF5C35',
  '#33475B',
  '#00BDA5',
];

function makeFormatter(fmt?: string): (v: unknown) => string {
  if (fmt === 'currency') {
    const nf = new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    });
    return (v: unknown) => nf.format(Number(v) || 0);
  }
  if (fmt === 'percent') {
    return (v: unknown) => `${Number(v) || 0}%`;
  }
  const nf = new Intl.NumberFormat('it-IT');
  return (v: unknown) => nf.format(Number(v) || 0);
}

function makeAxisFormatter(fmt?: string): (v: unknown) => string {
  const prefix = fmt === 'currency' ? '€' : '';
  const suffix = fmt === 'percent' ? '%' : '';
  return (v: unknown) => {
    const n = Number(v) || 0;
    const abs = Math.abs(n);
    let s: string;
    if (abs >= 1_000_000) s = (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    else if (abs >= 1_000) s = (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    else s = String(n);
    return prefix + s + suffix;
  };
}

export default function ChartView({ spec }: { spec: ChartSpec }) {
  const data = (spec.data || []).map((d) => ({
    label: String(d.label),
    value: Number(d.value) || 0,
  }));

  if (data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-sm text-gray-400">
        {spec.title}: nessun dato disponibile
      </div>
    );
  }

  const fmt = makeFormatter(spec.valueFormat);
  const axisFmt = makeAxisFormatter(spec.valueFormat);
  const tipFormatter = (value: unknown) => fmt(value);
  const tipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm w-full">
      <div className="text-[13px] font-semibold text-[#2D3E50] mb-2">{spec.title}</div>
      <ResponsiveContainer width="100%" height={240}>
        {spec.type === 'pie' ? (
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={85}
              labelLine={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={(e: any) => `${e.name}: ${((e.percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={tipFormatter} contentStyle={tipStyle} />
          </PieChart>
        ) : spec.type === 'line' ? (
          <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={52} />
            <Tooltip formatter={tipFormatter} contentStyle={tipStyle} />
            <Line type="monotone" dataKey="value" stroke="#FF7A59" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : spec.type === 'area' ? (
          <AreaChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${spec.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF7A59" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#FF7A59" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={52} />
            <Tooltip formatter={tipFormatter} contentStyle={tipStyle} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#FF7A59"
              strokeWidth={2}
              fill={`url(#grad-${spec.id})`}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={52} />
            <Tooltip formatter={tipFormatter} contentStyle={tipStyle} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
