import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  Filter,
  Gauge,
  LayoutDashboard,
  LineChart,
  Moon,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Search,
  Server,
  ShieldAlert,
  Sun,
  UserRound,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { clearAdminToken } from './AdminLogin.jsx';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

const THEME_KEY = 'navi_admin_theme_v2';
const FONT_STACK = '"Aptos", "Manrope", "Satoshi", "Segoe UI", sans-serif';

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
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
];

const PLANS = ['all', 'free', 'starter', 'business', 'agency'];
const STATUSES = ['all', 'healthy', 'attention', 'quota', 'offline'];
const PAGE_SIZES = [25, 50, 100];

const THEME = {
  dark: {
    '--page': '#07080c',
    '--page-soft': '#0e1018',
    '--surface': 'rgba(255,255,255,0.045)',
    '--surface-strong': 'rgba(255,255,255,0.075)',
    '--surface-hover': 'rgba(255,255,255,0.095)',
    '--text': '#f6f7fb',
    '--muted': 'rgba(246,247,251,0.58)',
    '--faint': 'rgba(246,247,251,0.34)',
    '--border': 'rgba(255,255,255,0.12)',
    '--border-strong': 'rgba(255,255,255,0.2)',
    '--grid': 'rgba(255,255,255,0.035)',
    '--accent': '#74a6ff',
    '--accent-2': '#e94b95',
    '--good': '#58d68d',
    '--warn': '#f7be4b',
    '--bad': '#ff6b6b',
    '--blue': '#7ab6ff',
    '--shadow': '0 22px 80px rgba(0,0,0,0.35)',
  },
  light: {
    '--page': '#f4f5f8',
    '--page-soft': '#ffffff',
    '--surface': 'rgba(255,255,255,0.86)',
    '--surface-strong': 'rgba(255,255,255,0.96)',
    '--surface-hover': 'rgba(21,27,41,0.045)',
    '--text': '#151b29',
    '--muted': 'rgba(21,27,41,0.62)',
    '--faint': 'rgba(21,27,41,0.42)',
    '--border': 'rgba(21,27,41,0.12)',
    '--border-strong': 'rgba(21,27,41,0.2)',
    '--grid': 'rgba(21,27,41,0.045)',
    '--accent': '#245fff',
    '--accent-2': '#d93b85',
    '--good': '#138a50',
    '--warn': '#b87505',
    '--bad': '#d83a3a',
    '--blue': '#245fff',
    '--shadow': '0 22px 80px rgba(22,30,46,0.12)',
  },
};

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
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

function toneStyle(tone = 'default') {
  const colors = {
    default: ['var(--faint)', 'transparent', 'var(--border)'],
    good: ['var(--good)', 'color-mix(in srgb, var(--good) 13%, transparent)', 'color-mix(in srgb, var(--good) 35%, transparent)'],
    warn: ['var(--warn)', 'color-mix(in srgb, var(--warn) 14%, transparent)', 'color-mix(in srgb, var(--warn) 38%, transparent)'],
    bad: ['var(--bad)', 'color-mix(in srgb, var(--bad) 14%, transparent)', 'color-mix(in srgb, var(--bad) 38%, transparent)'],
    blue: ['var(--blue)', 'color-mix(in srgb, var(--blue) 13%, transparent)', 'color-mix(in srgb, var(--blue) 35%, transparent)'],
  }[tone];
  return { color: colors[0], background: colors[1], borderColor: colors[2] };
}

function usageTone(value) {
  if (value >= 1) return 'bad';
  if (value >= 0.8) return 'warn';
  if (value >= 0.5) return 'blue';
  return 'default';
}

function Pill({ children, tone = 'default' }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={toneStyle(tone)}>
      {children}
    </span>
  );
}

function ControlButton({ children, icon: Icon, active, danger, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
      style={{
        borderColor: active ? 'var(--accent)' : danger ? 'color-mix(in srgb, var(--bad) 34%, transparent)' : 'var(--border)',
        background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : danger ? 'color-mix(in srgb, var(--bad) 10%, transparent)' : 'var(--surface)',
        color: active ? 'var(--accent)' : danger ? 'var(--bad)' : 'var(--muted)',
      }}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

function SummaryTile({ icon: Icon, label, value, sub, tone = 'default' }) {
  return (
    <div className="rounded-[22px] border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-2xl border" style={{ ...toneStyle(tone), borderColor: toneStyle(tone).borderColor }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-5 text-3xl font-semibold tracking-[-0.03em]" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="mt-2 truncate text-[12px]" style={{ color: 'var(--faint)' }}>{sub}</div>}
    </div>
  );
}

function SortButton({ id, label, sort, setSort, align = 'left' }) {
  const active = sort.key === id;
  const Icon = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => {
        setSort((s) => s.key === id ? { key: id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: id, dir: 'desc' });
      }}
      className={cx('inline-flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]', align === 'right' ? 'justify-end' : 'justify-start')}
      style={{ color: active ? 'var(--text)' : 'var(--faint)' }}
    >
      {label}
      {active && <Icon className="h-3 w-3" />}
    </button>
  );
}

function UsageBar({ value }) {
  const pct = Math.max(0, Math.min(1.2, Number(value) || 0));
  const tone = usageTone(pct);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--text) 9%, transparent)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct * 100)}%`, background: toneStyle(tone).color }}
      />
    </div>
  );
}

function CustomerDetail({ customer, onClose, onToggleAgent, actionLoading }) {
  if (!customer) {
    return (
      <aside className="hidden border-l xl:block xl:w-[390px]" style={{ borderColor: 'var(--border)', background: 'var(--page-soft)' }}>
        <div className="sticky top-[76px] p-6 text-sm" style={{ color: 'var(--faint)' }}>
          Select a customer to inspect usage, quota, widget health and controls.
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
    <aside className="border-l xl:w-[390px]" style={{ borderColor: 'var(--border)', background: 'var(--page-soft)' }}>
      <div className="sticky top-[76px] max-h-[calc(100vh-76px)] overflow-y-auto p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--faint)' }}>Customer record</div>
            <h2 className="mt-2 break-words text-xl font-semibold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>
              {customer.email || `User #${customer.id}`}
            </h2>
            <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{customer.name || 'No name'} - id #{customer.id}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border p-1.5 xl:hidden"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            aria-label="Close customer detail"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <Pill tone={customer.plan === 'free' ? 'default' : 'blue'}>{customer.plan}</Pill>
          <Pill tone={status === 'healthy' ? 'good' : status === 'quota' ? 'bad' : 'warn'}>{statusLabel(status)}</Pill>
          <Pill tone={customer.agent_enabled ? 'good' : 'bad'}>{customer.agent_enabled ? 'Agent live' : 'Agent paused'}</Pill>
        </div>

        <div className="mb-6 rounded-[22px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }}>Agent control</div>
              <div className="text-[12px]" style={{ color: 'var(--faint)' }}>Immediate customer runtime switch</div>
            </div>
            <ControlButton
              icon={customer.agent_enabled ? PauseCircle : PlayCircle}
              danger={customer.agent_enabled}
              active={!customer.agent_enabled}
              disabled={actionLoading === customer.id}
              onClick={() => onToggleAgent(customer, !customer.agent_enabled)}
            >
              {actionLoading === customer.id ? 'Saving' : customer.agent_enabled ? 'Pause' : 'Resume'}
            </ControlButton>
          </div>
          <div className="text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>
            Pausing blocks widget chat, voice tokens and sessions for this customer without changing billing or keys.
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          {[
            ['Revenue', eur(customer.revenue_cents), 'blue'],
            ['Margin', eur(customer.margin_cents), customer.margin_cents < 0 ? 'bad' : 'good'],
            ['Sessions', `${fmtN(customer.sessions)} range`, 'default'],
            ['Leads', fmtN(customer.leads), 'default'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--faint)' }}>{label}</div>
              <div className="mt-2 text-sm font-semibold" style={{ color: toneStyle(tone).color }}>{value}</div>
            </div>
          ))}
        </div>

        <section className="mb-6">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--faint)' }}>Quota burn</h3>
          <div className="space-y-4">
            {metrics.map(([key, used, limit]) => {
              const pct = limit ? used / limit : 0;
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span style={{ color: 'var(--muted)' }}>{metricLabel(key)}</span>
                    <span className="rounded-full border px-2 py-0.5 font-semibold" style={toneStyle(usageTone(pct))}>
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
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--faint)' }}>Widget</h3>
          <div className="space-y-3 text-[13px]">
            {[
              ['Site', customer.site_url || '-'],
              ['Seen', customer.widget_seen_at ? fmtRelative(customer.widget_seen_at) : 'Never'],
              ['Activity', fmtRelative(customer.activity_at)],
              ['Knowledge base', `${customer.kb_status || '-'} - ${fmtN(customer.kb_chunks)} chunks`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <span style={{ color: 'var(--faint)' }}>{label}</span>
                <span className="max-w-[230px] truncate text-right" style={{ color: 'var(--muted)' }}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--faint)' }}>Range activity</h3>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            {[
              ['Voice', fmtSeconds(customer.voice_seconds)],
              ['Conversations', fmtN(customer.conversations)],
              ['TTS', fmtN(customer.tts_chars)],
              ['LLM', fmtN(customer.llm_tokens)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <span style={{ color: 'var(--faint)' }}>{label}</span>
                <div className="mt-1 font-semibold" style={{ color: 'var(--text)' }}>{value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

export default function AdminDashboard({ token, onSignOut }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
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
  const [actionLoading, setActionLoading] = useState(null);

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
  useEffect(() => { localStorage.setItem(THEME_KEY, theme); }, [theme]);

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

  const toggleAgent = async (customer, enabled) => {
    setActionLoading(customer.id);
    setErr('');
    try {
      const res = await fetch(`${BACKEND}/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_enabled: enabled }),
      });
      if (!res.ok) throw new Error(`Backend ${res.status}`);
      await refresh();
      setSelectedId(customer.id);
    } catch (e) {
      setErr(e.message || 'Failed to update customer');
    } finally {
      setActionLoading(null);
    }
  };

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

  const shellStyle = {
    ...THEME[theme],
    fontFamily: FONT_STACK,
    backgroundImage: 'linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)',
    backgroundSize: '28px 28px',
  };

  return (
    <div className="min-h-screen text-[var(--text)]" style={shellStyle}>
      <div className="fixed inset-0 -z-10" style={{ background: 'linear-gradient(135deg, var(--page) 0%, var(--page-soft) 58%, color-mix(in srgb, var(--accent) 8%, var(--page)) 100%)' }} />

      <header className="sticky top-0 z-30 border-b backdrop-blur-xl" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--page) 88%, transparent)' }}>
        <div className="flex min-h-[76px] items-center justify-between gap-5 px-5">
          <div className="flex items-center gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <Database className="h-5 w-5" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--faint)' }}>Navi command center</div>
              <div className="text-lg font-semibold tracking-[-0.03em]">Admin database</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-full border p-1 md:flex" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDays(r.id)}
                  className="h-8 rounded-full px-3 text-[12px] font-semibold transition"
                  style={{
                    background: days === r.id ? 'var(--text)' : 'transparent',
                    color: days === r.id ? 'var(--page)' : 'var(--muted)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <ControlButton icon={theme === 'dark' ? Sun : Moon} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </ControlButton>
            <ControlButton icon={RefreshCcw} onClick={refresh} disabled={loading}>
              Refresh
            </ControlButton>
            <ControlButton onClick={() => { clearAdminToken(); onSignOut(); }}>
              Sign out
            </ControlButton>
          </div>
        </div>
      </header>

      {err && (
        <div className="mx-5 mt-4 rounded-2xl border px-4 py-3 text-sm" style={toneStyle('bad')}>
          {err}
        </div>
      )}

      {loading && !overview ? (
        <div className="flex h-[60vh] items-center justify-center text-sm" style={{ color: 'var(--faint)' }}>Loading admin database...</div>
      ) : (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_390px]">
          <main className="min-w-0 p-5">
            <div className="mb-5 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
              <nav className="rounded-[26px] border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                {[
                  [LayoutDashboard, 'Overview', true],
                  [Users, 'Customers', true],
                  [Server, 'Providers', false],
                  [BarChart3, 'Revenue', false],
                  [ShieldAlert, 'Risk', false],
                ].map(([Icon, label, active]) => (
                  <button
                    key={label}
                    type="button"
                    className="mb-1 flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold"
                    style={{
                      color: active ? 'var(--text)' : 'var(--muted)',
                      background: active ? 'var(--surface-strong)' : 'transparent',
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
                <div className="mt-4 rounded-3xl border p-4" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--accent) 9%, transparent)' }}>
                  <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Ops focus</div>
                  <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                    Watch margin, quota burn and provider errors before customers feel them.
                  </p>
                </div>
              </nav>

              <section className="rounded-[30px] border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--faint)' }}>Live operations</div>
                    <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-[-0.055em] md:text-5xl">
                      Customer control room
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      A searchable admin database for installed widgets, usage burn, margins, provider health and runtime controls.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 rounded-[24px] border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
                    <div>
                      <div className="text-[11px]" style={{ color: 'var(--faint)' }}>Installed</div>
                      <div className="mt-1 text-2xl font-semibold">{fmtN(customerStats.installed)}</div>
                    </div>
                    <div>
                      <div className="text-[11px]" style={{ color: 'var(--faint)' }}>At risk</div>
                      <div className="mt-1 text-2xl font-semibold" style={{ color: 'var(--warn)' }}>{fmtN(customerStats.counts.attention + customerStats.counts.quota)}</div>
                    </div>
                    <div>
                      <div className="text-[11px]" style={{ color: 'var(--faint)' }}>Neg. margin</div>
                      <div className="mt-1 text-2xl font-semibold" style={{ color: customerStats.negativeMargin ? 'var(--bad)' : 'var(--good)' }}>{fmtN(customerStats.negativeMargin)}</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
              <SummaryTile icon={UserRound} label="Customers" value={fmtN(totals.users)} sub={`${customerStats.installed} installed`} tone="blue" />
              <SummaryTile icon={Wallet} label="MRR" value={eur(totals.monthly_recurring_cents)} sub="monthly plan value" tone="good" />
              <SummaryTile icon={Gauge} label="Usage cost" value={eur(totals.usage_cost_cents)} sub={`${eur(providerCost)} providers`} tone="default" />
              <SummaryTile icon={Activity} label="Voice" value={fmtSeconds(totals.voice_seconds)} sub={`${fmtN(totals.conversations)} conv.`} tone="blue" />
              <SummaryTile icon={CheckCircle2} label="Healthy" value={fmtN(customerStats.counts.healthy)} sub="no action" tone="good" />
              <SummaryTile icon={AlertTriangle} label="Attention" value={fmtN(customerStats.counts.attention)} sub="review" tone="warn" />
              <SummaryTile icon={ShieldAlert} label="Quota" value={fmtN(customerStats.counts.quota)} sub="blocked" tone="bad" />
              <SummaryTile icon={LineChart} label="Health" value={healthOk == null ? '-' : healthOk ? 'OK' : 'Check'} sub={`${inlineErrors.length} alerts`} tone={healthOk === false ? 'warn' : 'good'} />
            </section>

            <section className="rounded-[28px] border" style={{ borderColor: 'var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
              <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--faint)' }}>Customer database</div>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
                      {fmtN(filteredCustomers.length)} records
                      <span className="ml-2 text-sm font-normal" style={{ color: 'var(--faint)' }}>of {fmtN(customers.length)}</span>
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--faint)' }} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search email, site, id..."
                        className="h-11 w-[280px] rounded-full border bg-transparent pl-9 pr-3 text-sm outline-none"
                        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                      />
                    </div>
                    <select value={plan} onChange={(e) => setPlan(e.target.value)} className="h-11 rounded-full border bg-transparent px-3 text-sm outline-none" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                      {PLANS.map((p) => <option key={p} value={p}>{p === 'all' ? 'All plans' : p}</option>)}
                    </select>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-full border bg-transparent px-3 text-sm outline-none" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All status' : statusLabel(s)}</option>)}
                    </select>
                    <ControlButton icon={Filter} onClick={() => { setQuery(''); setPlan('all'); setStatus('all'); setSort({ key: 'margin', dir: 'asc' }); }}>
                      Reset
                    </ControlButton>
                    <ControlButton icon={Download} active onClick={exportCsv}>
                      CSV
                    </ControlButton>
                  </div>
                </div>
              </div>

              <div className="max-h-[calc(100vh-390px)] min-h-[430px] overflow-auto">
                <table className="w-full min-w-[1220px] border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'var(--page-soft)' }}>
                    <tr>
                      <th className="w-[300px] px-4 py-3 text-left"><SortButton id="customer" label="Customer" sort={sort} setSort={setSort} /></th>
                      <th className="px-4 py-3 text-left"><SortButton id="plan" label="Plan" sort={sort} setSort={setSort} /></th>
                      <th className="px-4 py-3 text-left"><SortButton id="status" label="Status" sort={sort} setSort={setSort} /></th>
                      <th className="px-4 py-3 text-right"><SortButton id="sessions" label="Sessions" sort={sort} setSort={setSort} align="right" /></th>
                      <th className="px-4 py-3 text-right">Voice</th>
                      <th className="px-4 py-3 text-right">TTS</th>
                      <th className="px-4 py-3 text-right">LLM</th>
                      <th className="w-[150px] px-4 py-3 text-left"><SortButton id="usage" label="Burn" sort={sort} setSort={setSort} /></th>
                      <th className="px-4 py-3 text-right"><SortButton id="cost" label="Cost" sort={sort} setSort={setSort} align="right" /></th>
                      <th className="px-4 py-3 text-right"><SortButton id="margin" label="Margin" sort={sort} setSort={setSort} align="right" /></th>
                      <th className="px-4 py-3 text-right"><SortButton id="activity" label="Activity" sort={sort} setSort={setSort} align="right" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-16 text-center text-sm" style={{ color: 'var(--faint)' }}>No customers match the current filters.</td>
                      </tr>
                    )}
                    {pageRows.map((c) => {
                      const rowStatus = statusOf(c);
                      const selectedRow = selected?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className="cursor-pointer border-b transition"
                          style={{
                            borderColor: 'var(--border)',
                            background: selectedRow ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                          }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
                                <Users className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-semibold" style={{ color: 'var(--text)' }}>{c.email || '-'}</div>
                                <div className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--faint)' }}>{c.site_url || c.name || `id #${c.id}`}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><Pill tone={c.plan === 'free' ? 'default' : 'blue'}>{c.plan}</Pill></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <Pill tone={rowStatus === 'healthy' ? 'good' : rowStatus === 'quota' ? 'bad' : 'warn'}>{statusLabel(rowStatus)}</Pill>
                              {!c.agent_enabled && <Pill tone="bad">Paused</Pill>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>{fmtN(c.session_count)} / {fmtN(c.session_limit)}</td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>{fmtSeconds(c.voice_seconds_used)}</td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>{fmtN(c.tts_chars_used)}</td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>{fmtN(c.llm_tokens_used)}</td>
                          <td className="px-4 py-3">
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={toneStyle(usageTone(c.max_usage_pct))}>{fmtPct(c.max_usage_pct)}</span>
                            </div>
                            <UsageBar value={c.max_usage_pct} />
                          </td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>{eur(c.estimated_cost_cents)}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color: c.margin_cents < 0 ? 'var(--bad)' : c.margin_cents < c.revenue_cents * 0.3 ? 'var(--warn)' : 'var(--good)' }}>
                            {eur(c.margin_cents)}
                          </td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--faint)' }}>{fmtRelative(c.activity_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t px-4 py-3 text-[13px] md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                <div>
                  Showing {filteredCustomers.length ? fmtN((safePage - 1) * pageSize + 1) : 0}
                  {' '}to {fmtN(Math.min(safePage * pageSize, filteredCustomers.length))}
                  {' '}of {fmtN(filteredCustomers.length)}
                </div>
                <div className="flex items-center gap-2">
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-9 rounded-full border bg-transparent px-2 outline-none" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} rows</option>)}
                  </select>
                  <ControlButton icon={ChevronLeft} disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</ControlButton>
                  <span className="min-w-[74px] text-center">Page {safePage}/{totalPages}</span>
                  <ControlButton icon={ChevronRight} disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</ControlButton>
                </div>
              </div>
            </section>

            <section className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4" /> Provider spend by metric</h2>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-[13px]">
                    <thead className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--faint)' }}>
                      <tr><th className="py-2 text-left">Provider</th><th className="text-left">Metric</th><th className="text-right">Amount</th><th className="text-right">Cost</th></tr>
                    </thead>
                    <tbody>
                      {byProvider.length === 0 && <tr><td colSpan={4} className="py-6 text-center" style={{ color: 'var(--faint)' }}>No usage recorded</td></tr>}
                      {byProvider.map((p, i) => (
                        <tr key={`${p.provider}-${p.metric}-${i}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-2 font-semibold">{p.provider}</td>
                          <td style={{ color: 'var(--muted)' }}>{p.metric}</td>
                          <td className="text-right" style={{ color: 'var(--muted)' }}>{fmtN(p.amount)}</td>
                          <td className="text-right" style={{ color: 'var(--muted)' }}>{eur(p.cost_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[28px] border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4" /> Provider errors and uptime</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    {inlineErrors.length === 0 && <div className="text-[13px]" style={{ color: 'var(--faint)' }}>No provider errors recorded.</div>}
                    {inlineErrors.slice(0, 6).map((e) => (
                      <div key={`${e.provider}-${e.last_at}`} className="flex items-center justify-between rounded-2xl border px-3 py-2 text-[13px]" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
                        <span className="font-semibold">{e.provider}</span>
                        <span style={{ color: 'var(--bad)' }}>{fmtN(e.count)}</span>
                        <span style={{ color: 'var(--faint)' }}>{fmtRelative(e.last_at)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {inlineHealth.length === 0 && <div className="text-[13px]" style={{ color: 'var(--faint)' }}>No health samples yet.</div>}
                    {inlineHealth.slice(0, 6).map((h) => {
                      const rate = (Number(h.ok_count) || 0) / Math.max(1, Number(h.total) || 1);
                      return (
                        <div key={h.target} className="flex items-center justify-between rounded-2xl border px-3 py-2 text-[13px]" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
                          <span className="truncate font-semibold">{h.target}</span>
                          <span style={{ color: rate >= 0.95 ? 'var(--good)' : 'var(--bad)' }}>{Math.round(rate * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </main>

          <CustomerDetail customer={selected} onClose={() => setSelectedId(null)} onToggleAgent={toggleAgent} actionLoading={actionLoading} />
        </div>
      )}
    </div>
  );
}
