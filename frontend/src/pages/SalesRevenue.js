import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Repeat,
  PieChart as PieIcon,
  Trophy,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

// Colours sourced from the shadcn theme tokens (index.css)
const C = {
  revenue: 'hsl(221 100% 50%)',      // --chart-1 / --primary
  target: 'hsl(240 5% 65%)',         // --muted-foreground
  grid: 'hsl(240 4% 14%)',           // --border-ish
  expansion: 'hsl(271 81% 56%)',     // --chart-4
  newRev: 'hsl(187 94% 43%)',        // --chart-3
  axis: 'hsl(240 5% 55%)',
};

const SalesRevenue = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/analytics/sales-revenue`, { credentials: 'include' });
        if (res.ok) setData(await res.json());
      } catch (err) { console.error('Failed to fetch:', err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 shadow-md" style={{ borderColor: C.grid, backgroundColor: 'hsl(240 5% 7%)' }}>
        <p className="text-muted-foreground text-xs mb-1">{label}</p>
        {payload.map((e, i) => (
          <p key={i} className="text-sm font-medium" style={{ color: e.color || e.stroke }}>
            {e.name}: {fmt(e.value)}
          </p>
        ))}
      </div>
    );
  };

  const nrr = data?.nrr ?? 100;
  const concentration = data?.concentration_risk || 0;
  const riskLevel = concentration > 60 ? 'High' : concentration > 40 ? 'Medium' : 'Low';
  const riskColor = riskLevel === 'High' ? 'text-red-400' : riskLevel === 'Medium' ? 'text-amber-400' : 'text-emerald-400';

  const STATS = [
    { key: 'kpi-mrr', label: 'Monthly Recurring Revenue', value: fmt(data?.mrr), hint: `ARR ${fmt(data?.arr)}`, icon: DollarSign, tone: 'text-foreground' },
    { key: 'kpi-arpu', label: 'Avg Revenue / Account', value: fmt(data?.arpu), hint: `${data?.unique_customers || 0} paying customers`, icon: Users, tone: 'text-foreground' },
    { key: 'kpi-nrr', label: 'Net Revenue Retention', value: `${nrr}%`, hint: nrr >= 100 ? 'Net positive — expansion beats churn' : 'Below 100% — churn outweighs expansion', icon: Repeat, tone: nrr >= 100 ? 'text-emerald-400' : 'text-amber-400' },
    { key: 'kpi-concentration', label: 'Concentration Risk', value: `${concentration}%`, hint: `${riskLevel} — top 3 accounts' share`, icon: AlertTriangle, tone: riskColor },
  ];

  const expPieData = [
    { name: 'Expansion', value: data?.expansion_revenue || 0, color: C.expansion },
    { name: 'New', value: data?.new_revenue || 0, color: C.newRev },
  ];
  const mixTotal = (data?.expansion_revenue || 0) + (data?.new_revenue || 0);

  return (
    <DashboardLayout>
      <main className="flex flex-1 flex-col gap-6" data-testid="sales-revenue-page">
        {/* Page header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: 'Outfit' }}>Revenue Analytics</h1>
          <p className="text-sm text-muted-foreground">Where your money comes from — recurring revenue, retention, and account concentration, all tied to attributable $.</p>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((stat) => (
            <Card key={stat.key} data-testid={stat.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                <stat.icon aria-hidden className="size-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold tabular-nums ${stat.tone}`}>{loading ? '—' : stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Revenue vs target */}
        <Card data-testid="revenue-trend-chart">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="size-4 text-muted-foreground" /> Revenue vs target</CardTitle>
            <CardDescription>Monthly booked revenue against target over the period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.monthly_revenue || []} margin={{ left: 4, right: 4, top: 8 }}>
                  <defs>
                    <linearGradient id="srevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.revenue} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={C.revenue} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} stroke={C.axis} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} width={40} stroke={C.axis} fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: C.grid }} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: C.axis }} />
                  <Area dataKey="target" name="Target" type="monotone" stroke={C.target} strokeDasharray="4 4" fill="none" strokeWidth={2} />
                  <Area dataKey="revenue" name="Revenue" type="monotone" stroke={C.revenue} fill="url(#srevGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Two-column: Top accounts + Revenue mix */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card data-testid="top-accounts">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-muted-foreground" /> Top accounts by revenue</CardTitle>
              <CardDescription>Your largest accounts and their share of revenue</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {(data?.top_accounts || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No account revenue yet.</p>
              ) : (data?.top_accounts || []).map((a, i) => (
                <div key={i} className="flex flex-col gap-2" data-testid={`top-account-${i}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-medium text-foreground flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      {a.company}
                    </h3>
                    <Badge variant={i === 0 ? 'default' : 'secondary'} className="tabular-nums">{fmt(a.value)}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={a.pct} aria-label={`${a.company} share`} />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums w-10 text-right">{a.pct}%</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card data-testid="expansion-new-chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PieIcon className="size-4 text-muted-foreground" /> Revenue mix</CardTitle>
              <CardDescription>Expansion revenue vs net-new revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="h-40 w-40 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={expPieData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={3} stroke="none">
                        {expPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-4">
                  {expPieData.map((e) => (
                    <div key={e.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-foreground">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: e.color }} /> {e.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{fmt(e.value)}</span>
                      </div>
                      <Progress value={mixTotal ? Math.round((e.value / mixTotal) * 100) : 0} className="[&>div]:!bg-current" style={{ color: e.color }} />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </DashboardLayout>
  );
};

export default SalesRevenue;
