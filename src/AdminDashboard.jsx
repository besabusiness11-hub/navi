import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Database,
  Download,
  Gauge,
  LineChart,
  RefreshCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  XCircle,
} from 'lucide-react';
import { clearAdminToken } from './AdminLogin.jsx';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

const eur = (cents) => `EUR ${((Number(cents) || 0) / 100).toFixed(2)}`;
const fmtN = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const fmtPct = (p) => `${Math.round((Number(p) || 0) * 100)}%`;
const fmtSeconds = (s) => {
  const v = Number(s) || 0;
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const fmtRelative = (epoch) => {
  if (!epoch) return '-';
  const diff = Date.now() / 1000 - Number(epoch);
  if (diff < 60) return `${Math.max(0, Math.round(diff))}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
};

const RANGES = [
  { id: 7, label: '7d' },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
];

const PLANS = ['all', 'free', 'starter', 'business', 'agency'];
const STATUSES = ['all', 'healthy', 'attention', 'quota', 'offline'];
const PAGE_SIZES = [25, 50, 100];

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

function usageTone(value) {
  if (value >= 1) return 'text-[#ff6b6b] bg-[#ff6b6b]/10 border-[#ff6b6b]/25';
  if (value >= 0.8) return 'text-[#ffbf4d] bg-[#ffbf4d]/10 border-[#ffbf4d]/25';
  if (value >= 0.5) return 'text-[#67c7ff] bg-[#67c7ff]/10 border-[#67c7ff]/25';
  return 'text-[#9ea7ad] bg-white/[0.03] border-white/10';
}

function statusOf(c) {
  if (c.max_usage_pct >= 1) return 'quota';
  if (!c.widget_seen_at || c.at_risk || c.max_usage_pct >= 0.8) return 'attention';
  if (c.widget_seen_at && c.last_seen && (Date.now() / 1000 - Number(c.last_seen)) > 7 * 86400) return 'offline';
  return 'healthy';
}

function statusLabel(status) {
  if (status === 'quota') return 'Quota';
  if (status === 'attention') return 'Attention';
  if (status === 'offline') return 'Offline';
  return 'Healthy';
}

function metricLabel(metric) {
  return {
    sessions: 'Sessions',
    voice_seconds: 'Voice',
    tts_chars: 'TTS chars',
    llm_tokens: 'LLM tokens',
    kb_pages: 'KB pages',
  }[metric] ?? metric;
}

function sortValue(row, key) {
  if (key === 'customer') return `${row.email ?? ''} ${row.name ?? ''}`.toLowerCase();
  if (key === 'plan') return row.plan ?? '';
  if (key === 'status') return statusOf(row);
  if (key === 'margin') return Number(row.margin_cents) || 0;
  if (key === 'usage') return Number(row.max_usage_pct) || 0;
  if (key === 'activity') return Number(row.activity_at) || 0;
  if (key === 'sessions') return Number(row.session_count) || 0;
  if (key === 'cost') return Number(row.estimated_cost_cents) || 0;
  return row[key] ?? '';
}

function Pill({ children, tone = 'default' }) {
  const tones = {
    default: 'border-white/10 bg-white/[0.04] text-white/55',
    good: 'border-[#3ddc84]/25 bg-[#3ddc84]/10 text-[#67e6a0]',
    warn: 'border-[#ffbf4d]/25 bg-[#ffbf4d]/10 text-[#ffd58a]',
    bad: 'border-[#ff6b6b]/25 bg-[#ff6b6b]/10 text-[#ff9c9c]',
    blue: 'border-[#65a7ff]/25 bg-[#65a7ff]/10 text-[#9ac4ff]',
  };
  return (
    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]', tones[tone])}>
      {children}
    </span>
  );
}

function SummaryTile({ icon: Icon, label, value, sub, tone = 'neutral' }) {
  const color = {
    neutral: 'text-white',
    good: 'text-[#67e6a0]',
    warn: 'text-[#ffd58a]',
    bad: 'text-[#ff9c9c]',
    blue: 'text-[#9ac4ff]',
  }[tone];

  return (
    <div className="min-h-[92px] border border-white/10 bg-[#0d0e12] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/38">{label}</span>
        <Icon className="h-4 w-4 text-white/28" />
      </div>
      <div className={cx('mt-3 text-2xl font-semibold leading-none', color)}>{value}</div>
      {sub && <div className="mt-2 truncate text-[11px] text-white/38">{sub}</div>}
    </div>
  );
}

function SortButton({ id, label, sort, setSort, align = 'left' }) {
  const active = sort.key === id;
  const Icon = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  const next = () => {
    setSort((s) => s.key === id ? { key: id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: id, dir: 'desc' });
  };

  return (
    <button
      type="button"
      onClick={next}
      className={cx(
        'inline-flex w-full items-center gap-1 text-[10px] uppercase tracking-[0.14em]',
        align === 'right' ? 'justify-end' : 'justify-start',
        active ? 'text-white' : 'text-white/34 hover:text-white/65',
      )}
    >
      {label}
      {active && <Icon className="h-3 w-3" />}
    </button>
  );
}

function UsageBar({ value }) {
  const pct = Math.max(0, Math.min(1.2, Number(value) || 0));
  const width = `${Math.min(100, pct * 100)}%`;
  const color = pct >= 1 ? 'bg-[#ff6b6b]' : pct >= 0.8 ? 'bg-[#ffbf4d]' : 'bg-[#60d394]';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div className={cx('h-full rounded-full', color)} style={{ width }} />
    </div>
  );
}

function CustomerDetail({ customer, onClose }) {
  if (!customer) {
    return (
      <aside className="hidden border-l border-white/10 bg-[#08090d] xl:block xl:w-[360px]">
        <div className="sticky top-[73px] p-5 text-sm text-white/35">
          Select a customer to inspect usage, quota and widget health.
        </div>
      </aside>
    );
  }

  const metrics = [
    ['sessions', customer.session_count, customer.session_limit],
    ['voice_seconds', customer.voice_seconds_used, customer.plan_limits?.voice_seconds],
    ['tts_chars', customer.tts_chars_used, customer.plan_limits?.tts_chars],
    ['llm_tokens', customer.llm_tokens_used, customer.plan_limits?.llm_tokens],
    ['kb_pages', customer.kb_pages_used, customer.plan_limits?.kb_pages],
  ];

  const status = statusOf(customer);

  return (
    <aside className="border-l border-white/10 bg-[#08090d] xl:w-[360px]">
      <div className="sticky top-[73px] max-h-[calc(100vh-73px)] overflow-y-auto p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/32">Customer record</div>
            <h2 className="mt-2 break-words text-lg font-semibold text-white">{customer.email || `User #${customer.id}`}</h2>
            <div className="mt-1 text-xs text-white/42">{customer.name || 'No name'} · id #{customer.id}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 p-1.5 text-white/42 hover:text-white xl:hidden"
            aria-label="Close customer detail"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <Pill tone={customer.plan === 'free' ? 'default' : 'blue'}>{customer.plan}</Pill>
          <Pill tone={status === 'healthy' ? 'good' : status === 'quota' ? 'bad' : 'warn'}>{statusLabel(status)}</Pill>
          <Pill tone={customer.agent_enabled ? 'good' : 'bad'}>{customer.agent_enabled ? 'Agent on' : 'Agent off'}</Pill>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/32">Revenue</div>
            <div className="mt-2 text-sm text-white">{eur(customer.revenue_cents)}</div>
          </div>
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/32">Margin</div>
            <div className={cx('mt-2 text-sm', customer.margin_cents < 0 ? 'text-[#ff9c9c]' : 'text-[#67e6a0]')}>
              {eur(customer.margin_cents)}
            </div>
          </div>
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/32">Sessions</div>
            <div className="mt-2 text-sm text-white">{fmtN(customer.sessions)} in range</div>
          </div>
          <div className="border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/32">Leads</div>
            <div className="mt-2 text-sm text-white">{fmtN(customer.leads)}</div>
          </div>
        </div>

        <section className="mb-6">
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/35">Quota burn</h3>
          <div className="space-y-3">
            {metrics.map(([key, used, limit]) => {
              const pct = limit ? used / limit : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-white/58">{metricLabel(key)}</span>
                    <span className={cx('rounded-full border px-1.5 py-0.5', usageTone(pct))}>
                      {fmtN(used)} / {fmtN(limit)}
                    </span>
                  </div>
                  <UsageBar value={pct} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-6">
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/35">Widget</h3>
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between gap-3">
              <span className="text-white/38">Site</span>
              <span className="max-w-[220px] truncate text-right text-white/70">{customer.site_url || '-'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-white/38">Seen</span>
              <span className="text-white/70">{customer.widget_seen_at ? fmtRelative(customer.widget_seen_at) : 'Never'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-white/38">Activity</span>
              <span className="text-white/70">{fmtRelative(customer.activity_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-white/38">KB</span>
              <span className="text-white/70">{customer.kb_status || '-'} · {fmtN(customer.kb_chunks)} chunks</span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/35">Range activity</h3>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="border border-white/10 bg-white/[0.03] p-3">
              <span className="text-white/38">Voice</span>
              <div className="mt-1 text-white">{fmtSeconds(customer.voice_seconds)}</div>
            </div>
            <div className="border border-white/10 bg-white/[0.03] p-3">
              <span className="text-white/38">Conversations</span>
              <div className="mt-1 text-white">{fmtN(customer.conversations)}</div>
            </div>
            <div className="border border-white/10 bg-white/[0.03] p-3">
              <span className="text-white/38">TTS</span>
              <div className="mt-1 text-white">{fmtN(customer.tts_chars)}</div>
            </div>
            <div className="border border-white/10 bg-white/[0.03] p-3">
              <span className="text-white/38">LLM</span>
              <div className="mt-1 text-white">{fmtN(customer.llm_tokens)}</div>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}

export default function AdminDashboard({ token, onSignOut }) {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [errors, setErrors] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ key: 'margin', dir: 'asc' });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const headers = useMemo(() => ({ 'x-admin-token': token }), [token]);

  const refresh = async () => {
    setLoading(true);
    setErr('');
    try {
      const [o, e, h] = await Promise.all([
        fetch(`${BACKEND}/api/admin/overview?days=${days}`, { headers }).then((r) => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${BACKEND}/api/admin/errors?days=${Math.min(days, 14)}`, { headers }).then((r) => r.ok ? r.json() : { summary: [], recent: [] }),
        fetch(`${BACKEND}/api/admin/health?hours=24`, { headers }).then((r) => r.ok ? r.json() : { samples: [] }),
      ]);
      setOverview(o);
      setErrors(e);
      setHealth(h);
    } catch (statusCode) {
      if (statusCode === 401) {
        clearAdminToken();
        onSignOut();
        return;
      }
      setErr(typeof statusCode === 'number' ? `Backend ${statusCode}` : (statusCode?.message || 'Failed to load admin data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [days]);
  useEffect(() => { setPage(1); }, [query, plan, status, pageSize, days]);

  const customers = overview?.customers ?? [];
  const totals = overview?.totals ?? {};
  const byProvider = overview?.byProvider ?? [];
  const inlineErrors = overview?.providerErrors ?? errors?.summary ?? [];
  const inlineHealth = overview?.health ?? health?.samples ?? [];

  const customerStats = useMemo(() => {
    const counts = { healthy: 0, attention: 0, quota: 0, offline: 0 };
    let negativeMargin = 0;
    let installed = 0;
    customers.forEach((c) => {
      const s = statusOf(c);
      counts[s] += 1;
      if (c.margin_cents < 0) negativeMargin += 1;
      if (c.widget_seen_at) installed += 1;
    });
    return { counts, negativeMargin, installed };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = customers.filter((c) => {
      const haystack = `${c.email ?? ''} ${c.name ?? ''} ${c.site_url ?? ''} ${c.id ?? ''}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (plan !== 'all' && c.plan !== plan) return false;
      if (status !== 'all' && statusOf(c) !== status) return false;
      return true;
    });

    rows.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (typeof av === 'string' || typeof bv === 'string') {
        return sort.dir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [customers, query, plan, status, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredCustomers.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = customers.find((c) => c.id === selectedId) ?? pageRows[0] ?? null;

  const providerCost = byProvider.reduce((sum, p) => sum + (Number(p.cost_cents) || 0), 0);
  const healthOk = inlineHealth.length
    ? inlineHealth.every((h) => (Number(h.ok_count) || 0) / Math.max(1, Number(h.total) || 1) >= 0.95)
    : null;

  const exportCsv = () => {
    const header = ['id', 'email', 'plan', 'status', 'site_url', 'sessions', 'voice_seconds_used', 'tts_chars_used', 'llm_tokens_used', 'kb_pages_used', 'revenue_cents', 'estimated_cost_cents', 'margin_cents'];
    const lines = [header.join(',')].concat(filteredCustomers.map((c) => header.map((key) => {
      const value = key === 'status' ? statusOf(c) : c[key];
      return `"${String(value ?? '').replaceAll('"', '""')}"`;
    }).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `navi-customers-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#07080b] text-white font-mono">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080b]/92 backdrop-blur">
        <div className="flex min-h-[72px] items-center justify-between gap-5 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-white/12 bg-white/[0.04]">
              <Database className="h-4 w-4 text-[#9ac4ff]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/38">Navi admin</div>
              <div className="text-sm font-semibold text-white">Operations database</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 md:flex">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDays(r.id)}
                  className={cx(
                    'h-7 rounded-full px-3 text-[12px]',
                    days === r.id ? 'bg-white text-black' : 'text-white/48 hover:text-white',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-9 items-center gap-2 border border-white/12 px-3 text-[12px] text-white/65 hover:border-white/28 hover:text-white"
            >
              <RefreshCcw className={cx('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => { clearAdminToken(); onSignOut(); }}
              className="h-9 border border-white/10 px-3 text-[12px] text-white/42 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {err && (
        <div className="mx-5 mt-4 border border-[#ff6b6b]/35 bg-[#ff6b6b]/10 px-4 py-3 text-sm text-[#ffb1b1]">
          {err}
        </div>
      )}

      {loading && !overview ? (
        <div className="flex h-[60vh] items-center justify-center text-sm text-white/38">Loading admin database...</div>
      ) : (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="min-w-0 p-5">
            <section className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-8">
              <SummaryTile icon={UserRound} label="Customers" value={fmtN(totals.users)} sub={`${customerStats.installed} installed`} />
              <SummaryTile icon={LineChart} label="MRR" value={eur(totals.monthly_recurring_cents)} sub="monthly plan value" tone="blue" />
              <SummaryTile icon={Gauge} label="Usage cost" value={eur(totals.usage_cost_cents)} sub={`${eur(providerCost)} providers`} />
              <SummaryTile icon={Activity} label="Voice" value={fmtSeconds(totals.voice_seconds)} sub={`${fmtN(totals.conversations)} conv.`} />
              <SummaryTile icon={CheckCircle2} label="Healthy" value={fmtN(customerStats.counts.healthy)} sub="no immediate action" tone="good" />
              <SummaryTile icon={AlertTriangle} label="Attention" value={fmtN(customerStats.counts.attention)} sub="review customers" tone="warn" />
              <SummaryTile icon={ShieldAlert} label="Quota" value={fmtN(customerStats.counts.quota)} sub="blocked / exhausted" tone="bad" />
              <SummaryTile icon={LineChart} label="Health" value={healthOk == null ? '-' : healthOk ? 'OK' : 'Check'} sub={`${inlineErrors.length} provider alerts`} tone={healthOk === false ? 'warn' : 'good'} />
            </section>

            <section className="border border-white/10 bg-[#0b0c10]">
              <div className="border-b border-white/10 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-white/34">Customer database</div>
                    <h1 className="mt-1 text-xl font-semibold text-white">
                      {fmtN(filteredCustomers.length)} records
                      <span className="ml-2 text-sm font-normal text-white/35">of {fmtN(customers.length)}</span>
                    </h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search email, site, id..."
                        className="h-10 w-[260px] border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#9ac4ff]/45"
                      />
                    </div>
                    <select
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      className="h-10 border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#9ac4ff]/45"
                      aria-label="Plan filter"
                    >
                      {PLANS.map((p) => <option key={p} value={p}>{p === 'all' ? 'All plans' : p}</option>)}
                    </select>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="h-10 border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#9ac4ff]/45"
                      aria-label="Status filter"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All status' : statusLabel(s)}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setQuery(''); setPlan('all'); setStatus('all'); setSort({ key: 'margin', dir: 'asc' }); }}
                      className="inline-flex h-10 items-center gap-2 border border-white/10 px-3 text-sm text-white/52 hover:text-white"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="inline-flex h-10 items-center gap-2 border border-[#9ac4ff]/24 bg-[#9ac4ff]/8 px-3 text-sm text-[#bcd6ff] hover:border-[#9ac4ff]/45"
                    >
                      <Download className="h-4 w-4" />
                      CSV
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-[calc(100vh-315px)] min-h-[420px] overflow-auto">
                <table className="w-full min-w-[1180px] border-collapse text-[12px]">
                  <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#111218]">
                    <tr>
                      <th className="w-[280px] px-3 py-2 text-left"><SortButton id="customer" label="Customer" sort={sort} setSort={setSort} /></th>
                      <th className="px-3 py-2 text-left"><SortButton id="plan" label="Plan" sort={sort} setSort={setSort} /></th>
                      <th className="px-3 py-2 text-left"><SortButton id="status" label="Status" sort={sort} setSort={setSort} /></th>
                      <th className="px-3 py-2 text-right"><SortButton id="sessions" label="Sessions" sort={sort} setSort={setSort} align="right" /></th>
                      <th className="px-3 py-2 text-right">Voice</th>
                      <th className="px-3 py-2 text-right">TTS</th>
                      <th className="px-3 py-2 text-right">LLM</th>
                      <th className="w-[150px] px-3 py-2 text-left"><SortButton id="usage" label="Burn" sort={sort} setSort={setSort} /></th>
                      <th className="px-3 py-2 text-right"><SortButton id="cost" label="Cost" sort={sort} setSort={setSort} align="right" /></th>
                      <th className="px-3 py-2 text-right"><SortButton id="margin" label="Margin" sort={sort} setSort={setSort} align="right" /></th>
                      <th className="px-3 py-2 text-right"><SortButton id="activity" label="Activity" sort={sort} setSort={setSort} align="right" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-16 text-center text-sm text-white/35">No customers match the current filters.</td>
                      </tr>
                    )}
                    {pageRows.map((c) => {
                      const rowStatus = statusOf(c);
                      const selectedRow = selected?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className={cx(
                            'cursor-pointer border-b border-white/6 hover:bg-white/[0.04]',
                            selectedRow ? 'bg-[#9ac4ff]/8 outline outline-1 outline-[#9ac4ff]/20' : '',
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <div className="truncate text-sm text-white">{c.email || '-'}</div>
                            <div className="mt-0.5 truncate text-[11px] text-white/34">{c.site_url || c.name || `id #${c.id}`}</div>
                          </td>
                          <td className="px-3 py-2.5"><Pill tone={c.plan === 'free' ? 'default' : 'blue'}>{c.plan}</Pill></td>
                          <td className="px-3 py-2.5">
                            <Pill tone={rowStatus === 'healthy' ? 'good' : rowStatus === 'quota' ? 'bad' : 'warn'}>{statusLabel(rowStatus)}</Pill>
                          </td>
                          <td className="px-3 py-2.5 text-right text-white/70">{fmtN(c.session_count)} / {fmtN(c.session_limit)}</td>
                          <td className="px-3 py-2.5 text-right text-white/58">{fmtSeconds(c.voice_seconds_used)}</td>
                          <td className="px-3 py-2.5 text-right text-white/58">{fmtN(c.tts_chars_used)}</td>
                          <td className="px-3 py-2.5 text-right text-white/58">{fmtN(c.llm_tokens_used)}</td>
                          <td className="px-3 py-2.5">
                            <div className="mb-1 flex items-center justify-between">
                              <span className={cx('rounded-full border px-1.5 py-0.5', usageTone(c.max_usage_pct))}>{fmtPct(c.max_usage_pct)}</span>
                            </div>
                            <UsageBar value={c.max_usage_pct} />
                          </td>
                          <td className="px-3 py-2.5 text-right text-white/58">{eur(c.estimated_cost_cents)}</td>
                          <td className={cx('px-3 py-2.5 text-right', c.margin_cents < 0 ? 'text-[#ff9c9c]' : c.margin_cents < c.revenue_cents * 0.3 ? 'text-[#ffd58a]' : 'text-[#67e6a0]')}>
                            {eur(c.margin_cents)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-white/38">{fmtRelative(c.activity_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 text-[12px] text-white/45 md:flex-row md:items-center md:justify-between">
                <div>
                  Showing {filteredCustomers.length ? fmtN((safePage - 1) * pageSize + 1) : 0}
                  {' '}to {fmtN(Math.min(safePage * pageSize, filteredCustomers.length))}
                  {' '}of {fmtN(filteredCustomers.length)}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-8 border border-white/10 bg-black/30 px-2 text-white outline-none"
                    aria-label="Rows per page"
                  >
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} rows</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 border border-white/10 px-3 disabled:opacity-35"
                  >
                    Prev
                  </button>
                  <span className="min-w-[72px] text-center">Page {safePage}/{totalPages}</span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-8 border border-white/10 px-3 disabled:opacity-35"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="border border-white/10 bg-[#0b0c10] p-4">
                <h2 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/34">Provider spend by metric</h2>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-[12px]">
                    <thead className="text-[10px] uppercase tracking-[0.16em] text-white/32">
                      <tr><th className="py-1 text-left">Provider</th><th className="text-left">Metric</th><th className="text-right">Amount</th><th className="text-right">Cost</th></tr>
                    </thead>
                    <tbody>
                      {byProvider.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-white/32">No usage recorded</td></tr>}
                      {byProvider.map((p, i) => (
                        <tr key={`${p.provider}-${p.metric}-${i}`} className="border-t border-white/6">
                          <td className="py-2 text-white/72">{p.provider}</td>
                          <td className="text-white/45">{p.metric}</td>
                          <td className="text-right text-white/62">{fmtN(p.amount)}</td>
                          <td className="text-right text-white/62">{eur(p.cost_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-white/10 bg-[#0b0c10] p-4">
                <h2 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/34">Provider errors and health</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    {inlineErrors.length === 0 && <div className="text-[12px] text-white/32">No provider errors recorded.</div>}
                    {inlineErrors.slice(0, 6).map((e) => (
                      <div key={`${e.provider}-${e.last_at}`} className="flex items-center justify-between border border-white/8 bg-white/[0.025] px-3 py-2 text-[12px]">
                        <span className="text-white/72">{e.provider}</span>
                        <span className="text-[#ff9c9c]">{fmtN(e.count)}</span>
                        <span className="text-white/32">{fmtRelative(e.last_at)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {inlineHealth.length === 0 && <div className="text-[12px] text-white/32">No health samples yet.</div>}
                    {inlineHealth.slice(0, 6).map((h) => {
                      const rate = (Number(h.ok_count) || 0) / Math.max(1, Number(h.total) || 1);
                      return (
                        <div key={h.target} className="flex items-center justify-between border border-white/8 bg-white/[0.025] px-3 py-2 text-[12px]">
                          <span className="truncate text-white/72">{h.target}</span>
                          <span className={rate >= 0.95 ? 'text-[#67e6a0]' : 'text-[#ff9c9c]'}>{Math.round(rate * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </main>

          <CustomerDetail customer={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}
