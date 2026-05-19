import { useEffect, useMemo, useState } from 'react';
import { clearAdminToken } from './AdminLogin.jsx';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

const eur = (cents) => `€${((Number(cents) || 0) / 100).toFixed(2)}`;
const fmtN = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const fmtPct = (p) => `${Math.round((Number(p) || 0) * 100)}%`;
const fmtSeconds = (s) => {
  const v = Number(s) || 0;
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const fmtRelative = (epoch) => {
  if (!epoch) return '—';
  const diff = Date.now() / 1000 - Number(epoch);
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
};

const RANGES = [
  { id: 7,  label: '7d'  },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
];

const Card = ({ label, value, sub, accent }) => (
  <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.03]">
    <div className="text-[10px] tracking-[0.22em] uppercase text-white/35 mb-2">{label}</div>
    <div className={`text-[26px] font-semibold leading-none ${accent ?? 'text-white'}`}>{value}</div>
    {sub && <div className="text-[11px] text-white/45 mt-2">{sub}</div>}
  </div>
);

// One row in the customers table. Margin column drives the row tint when red.
const CustomerRow = ({ c }) => {
  const maxPct = c.max_usage_pct ?? 0;
  const usageColor = c.at_risk
    ? 'text-[#ff7676]'
    : maxPct >= 0.8 ? 'text-[#febc2e]'
    : maxPct >= 0.5 ? 'text-[#58c4ec]'
    : 'text-white/60';
  const marginColor = c.margin_cents < 0
    ? 'text-[#ff7676]'
    : c.margin_cents < (c.revenue_cents * 0.3) ? 'text-[#febc2e]' : 'text-[#3dc45a]';
  return (
    <tr className="border-t border-white/5 hover:bg-white/[0.02]">
      <td className="px-3 py-2.5">
        <div className="text-white text-sm">{c.email || '—'}</div>
        <div className="text-[11px] text-white/40">{c.name || `id #${c.id}`}</div>
      </td>
      <td className="px-3 py-2.5 text-[12px]">
        <span className={`px-2 py-0.5 rounded-full ${c.plan === 'free' ? 'bg-white/5 text-white/50' : 'bg-[#4a7fff]/20 text-[#82b4ff]'}`}>
          {c.plan}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] text-white/70">
        {fmtN(c.session_count)} <span className="text-white/30">/ {fmtN(c.session_limit ?? 0)}</span>
      </td>
      <td className="px-3 py-2.5 text-[12px] text-white/70">{fmtSeconds(c.voice_seconds_used)}</td>
      <td className="px-3 py-2.5 text-[12px] text-white/70">{fmtN(c.tts_chars_used)}</td>
      <td className="px-3 py-2.5 text-[12px] text-white/70">{fmtN(c.llm_tokens_used)}</td>
      <td className={`px-3 py-2.5 text-[12px] ${usageColor}`}>{fmtPct(maxPct)}</td>
      <td className="px-3 py-2.5 text-[12px] text-white/70">{eur(c.revenue_cents)}</td>
      <td className="px-3 py-2.5 text-[12px] text-white/70">{eur(c.estimated_cost_cents)}</td>
      <td className={`px-3 py-2.5 text-[12px] ${marginColor}`}>{eur(c.margin_cents)}</td>
      <td className="px-3 py-2.5 text-[11px] text-white/40">{fmtRelative(c.activity_at)}</td>
    </tr>
  );
};

export default function AdminDashboard({ token, onSignOut }) {
  const [days, setDays]     = useState(30);
  const [overview, setOver] = useState(null);
  const [errors, setErrors] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const headers = useMemo(() => ({ 'x-admin-token': token }), [token]);

  const refresh = async () => {
    setLoading(true);
    setErr('');
    try {
      const [o, e, h] = await Promise.all([
        fetch(`${BACKEND}/api/admin/overview?days=${days}`, { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${BACKEND}/api/admin/errors?days=${Math.min(days, 14)}`, { headers }).then(r => r.ok ? r.json() : { summary: [], recent: [] }),
        fetch(`${BACKEND}/api/admin/health?hours=24`, { headers }).then(r => r.ok ? r.json() : { samples: [] }),
      ]);
      setOver(o);
      setErrors(e);
      setHealth(h);
    } catch (status) {
      if (status === 401) {
        clearAdminToken();
        onSignOut();
        return;
      }
      setErr(typeof status === 'number' ? `Backend ${status}` : (status?.message || 'Failed to load admin data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [days]);

  // Derive panels from overview.
  const customers     = overview?.customers ?? [];
  const totals        = overview?.totals    ?? {};
  const byProvider    = overview?.byProvider ?? [];
  const alerts        = useMemo(() => customers.filter(c => c.at_risk || c.max_usage_pct >= 0.8), [customers]);
  const widgetIssues  = useMemo(() => customers.filter(c => !c.widget_seen_at || (Date.now()/1000 - c.last_seen) > 7*86400), [customers]);
  // Sort customers worst-margin first by default.
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.margin_cents - b.margin_cents),
    [customers],
  );

  return (
    <div className="min-h-screen bg-[#06060a] text-white font-mono">
      <header className="border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#06060a]/85 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-[#a6b1b6]" />
          <span className="text-sm tracking-[0.2em] uppercase text-white/60">Navi · Admin</span>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setDays(r.id)}
              className={`px-3 py-1 rounded-full text-[12px] border ${days === r.id ? 'bg-white text-black border-white' : 'border-white/15 text-white/60 hover:border-white/30'}`}>
              {r.label}
            </button>
          ))}
          <button onClick={refresh} className="ml-2 px-3 py-1 rounded-full text-[12px] border border-white/15 text-white/60 hover:border-white/30">
            ⟳ Refresh
          </button>
          <button onClick={() => { clearAdminToken(); onSignOut(); }} className="ml-1 px-3 py-1 rounded-full text-[12px] border border-white/10 text-white/40 hover:text-white">
            Sign out
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1320px] mx-auto space-y-8">
        {err && <div className="border border-[#ff7676]/30 bg-[#ff7676]/10 text-[#ffb1b1] text-sm rounded-xl p-3">{err}</div>}
        {loading && !overview && <div className="text-white/40 text-sm">Loading…</div>}

        {/* ── Overview cards ───────────────────────────────────────────── */}
        {overview && (
          <section>
            <h2 className="text-[11px] tracking-[0.22em] uppercase text-white/40 mb-3">Overview · last {days}d</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card label="MRR (monthly)"     value={eur(totals.monthly_recurring_cents)} sub={`${fmtN(totals.users)} users`} />
              <Card label="Session cost"      value={eur(totals.session_cost_cents)} sub={`${fmtN(totals.sessions)} sessions`} />
              <Card label="Usage cost"        value={eur(totals.usage_cost_cents)} sub={`${fmtN(totals.tts_chars)} tts · ${fmtN(totals.llm_tokens)} tok`} />
              <Card label="Voice minutes"     value={fmtSeconds(totals.voice_seconds)} sub={`${fmtN(totals.conversations)} conversations`} />
              <Card label="Leads captured"    value={fmtN(totals.leads)} />
              <Card label="Active agents"     value={`${fmtN(totals.active_agents)} / ${fmtN(totals.users)}`} sub="agent_enabled = 1" />
              <Card label="Installed widgets" value={fmtN(totals.installed_widgets)} sub={`${widgetIssues.length} need attention`} accent={widgetIssues.length ? 'text-[#febc2e]' : ''} />
              <Card label="Alerts"            value={fmtN(alerts.length)} sub="at-risk / ≥80% usage" accent={alerts.length ? 'text-[#ff7676]' : ''} />
            </div>
          </section>
        )}

        {/* ── Alerts panel ─────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <section>
            <h2 className="text-[11px] tracking-[0.22em] uppercase text-[#ff7676] mb-3">Alerts</h2>
            <div className="border border-[#ff7676]/25 bg-[#ff7676]/[0.04] rounded-2xl divide-y divide-white/5">
              {alerts.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-white">{c.email}</div>
                    <div className="text-[11px] text-white/45">
                      {c.plan} · usage {fmtPct(c.max_usage_pct)} · margin {eur(c.margin_cents)}
                      {c.at_risk && <span className="ml-2 text-[#ff7676]">margin at risk</span>}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/40">{fmtRelative(c.activity_at)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Provider metrics + health + errors row ───────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02]">
            <h3 className="text-[11px] tracking-[0.22em] uppercase text-white/40 mb-3">Provider usage · {days}d</h3>
            <table className="w-full text-[12px]">
              <thead className="text-white/35 text-[10px] uppercase tracking-[0.18em]">
                <tr><th className="text-left py-1.5">Provider</th><th className="text-left">Metric</th><th className="text-right">Amount</th><th className="text-right">Cost</th></tr>
              </thead>
              <tbody>
                {byProvider.length === 0 && (
                  <tr><td colSpan={4} className="text-white/30 py-3 text-center">No usage recorded</td></tr>
                )}
                {byProvider.map((p, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-1.5 text-white">{p.provider}</td>
                    <td className="text-white/50">{p.metric}</td>
                    <td className="text-right text-white/70">{fmtN(p.amount)}</td>
                    <td className="text-right text-white/70">{eur(p.cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02]">
            <h3 className="text-[11px] tracking-[0.22em] uppercase text-white/40 mb-3">Uptime · 24h</h3>
            {!health?.samples?.length && <div className="text-white/30 text-[12px]">No samples yet — run scripts/uptime-check.js</div>}
            <div className="space-y-1.5">
              {(health?.samples ?? []).map(s => {
                const successRate = s.total > 0 ? s.ok_count / s.total : 0;
                const color = successRate < 0.95 ? 'text-[#ff7676]' : successRate < 0.99 ? 'text-[#febc2e]' : 'text-[#3dc45a]';
                return (
                  <div key={s.target} className="flex items-center justify-between text-[12px]">
                    <span className="text-white">{s.target}</span>
                    <span className="text-white/40">{s.avg_latency ?? '—'}ms</span>
                    <span className={color}>{Math.round(successRate * 100)}% ({s.ok_count}/{s.total})</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.02]">
            <h3 className="text-[11px] tracking-[0.22em] uppercase text-white/40 mb-3">Provider errors · {errors?.days ?? 7}d</h3>
            {!errors?.summary?.length && <div className="text-white/30 text-[12px]">No errors recorded</div>}
            <div className="space-y-1.5 mb-3">
              {(errors?.summary ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-[12px]">
                  <span className="text-white">{s.provider}</span>
                  <span className="text-[#ff7676]">{fmtN(s.count)}</span>
                  <span className="text-white/40">{fmtRelative(s.last_at)}</span>
                </div>
              ))}
            </div>
            {errors?.recent?.length > 0 && (
              <details>
                <summary className="text-[10px] uppercase tracking-[0.2em] text-white/40 cursor-pointer">Recent {errors.recent.length}</summary>
                <div className="mt-2 max-h-64 overflow-auto space-y-1">
                  {errors.recent.slice(0, 50).map(r => (
                    <div key={r.id} className="text-[10.5px] text-white/55 border-l border-white/10 pl-2 py-0.5">
                      <span className="text-white/80">{r.provider}</span> · {r.route} · {r.status ?? '—'} · <span className="text-white/40">{fmtRelative(r.created_at)}</span>
                      <div className="text-white/40 truncate">{r.error}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>

        {/* ── Widget health ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[11px] tracking-[0.22em] uppercase text-white/40 mb-3">
            Widget health · {widgetIssues.length} need attention
          </h2>
          {widgetIssues.length === 0 && <div className="text-white/30 text-[12px]">All widgets seen recently.</div>}
          {widgetIssues.length > 0 && (
            <div className="border border-white/10 rounded-2xl bg-white/[0.02] divide-y divide-white/5">
              {widgetIssues.slice(0, 20).map(c => (
                <div key={c.id} className="px-4 py-2.5 flex items-center justify-between text-[12px]">
                  <div>
                    <div className="text-white">{c.email}</div>
                    <div className="text-white/40 text-[11px]">{c.site_url || 'no site set'} · plan: {c.plan}</div>
                  </div>
                  <div className="text-right">
                    {c.widget_seen_at
                      ? <div className="text-[#febc2e]">last seen {fmtRelative(c.widget_seen_at)}</div>
                      : <div className="text-[#ff7676]">never installed</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Customers table ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-[11px] tracking-[0.22em] uppercase text-white/40 mb-3">
            Customers · {customers.length} · sorted worst-margin first
          </h2>
          <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-white/35 text-[10px] uppercase tracking-[0.18em] bg-white/[0.02]">
                  <tr>
                    <th className="text-left px-3 py-2">Customer</th>
                    <th className="text-left px-3 py-2">Plan</th>
                    <th className="text-left px-3 py-2">Sessions used</th>
                    <th className="text-left px-3 py-2">Voice</th>
                    <th className="text-left px-3 py-2">TTS chars</th>
                    <th className="text-left px-3 py-2">LLM tok</th>
                    <th className="text-left px-3 py-2">Max usage</th>
                    <th className="text-left px-3 py-2">Revenue</th>
                    <th className="text-left px-3 py-2">Cost</th>
                    <th className="text-left px-3 py-2">Margin</th>
                    <th className="text-left px-3 py-2">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCustomers.map(c => <CustomerRow key={c.id} c={c} />)}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
