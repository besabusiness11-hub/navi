/**
 * Quota / budget watch.
 *
 * Runs hourly. For each customer, checks per-metric usage; emits a 80% (warn)
 * and 100% (critical) email — once per 24h per (kind, user) via admin_alerts.
 * Also sums per-provider spend in the last 24h and pings ADMIN_EMAIL when it
 * crosses PROVIDER_BUDGET_DAILY_CENTS_<provider> (cents).
 *
 * The point is to catch a runaway customer or provider price spike before it
 * eats a month's revenue.
 */

import {
  getAdminOverview,
  getProviderCostWindow,
  recordAdminAlert, alertEmittedRecently,
  getUserById,
} from './db.js';
import { sendAdminAlert, sendUsageAlert } from './email.js';

const PROVIDERS = ['elevenlabs', 'openai', 'groq', 'deepgram'];

// Default budgets — overridable by env (`PROVIDER_BUDGET_DAILY_CENTS_<name>`).
const DEFAULT_DAILY_BUDGET_CENTS = {
  elevenlabs: 2000, // €20/day
  openai:     1500,
  groq:        500,
  deepgram:    500,
};

const providerBudget = (provider) => {
  const env = process.env[`PROVIDER_BUDGET_DAILY_CENTS_${provider.toUpperCase()}`];
  return env ? Number(env) : (DEFAULT_DAILY_BUDGET_CENTS[provider] ?? 0);
};

async function checkProviderBudgets() {
  for (const provider of PROVIDERS) {
    const budget = providerBudget(provider);
    if (!budget) continue;
    const { cents } = await getProviderCostWindow({ provider, hours: 24 });
    const spend = Number(cents) || 0;
    if (spend < budget) continue;

    const kind = `provider_budget_${provider}`;
    if (await alertEmittedRecently({ kind, hours: 12 })) continue;

    await sendAdminAlert({
      subject: `${provider} daily spend €${(spend / 100).toFixed(2)} ≥ budget €${(budget / 100).toFixed(2)}`,
      body: `Provider ${provider} has spent ${spend} cents in the last 24h, exceeding the configured daily budget of ${budget} cents.\n\nReview /admin and consider:\n- a temporary rate-limit tightening\n- a single customer running away (check the at-risk list)\n- a provider-side price/usage anomaly`,
      kind: 'critical',
    });
    await recordAdminAlert({ kind, payload: { provider, spend, budget } });
  }
}

async function checkUserLimits() {
  // Pull the 30-day overview (includes usage_pct + at_risk). The per-customer
  // row already has plan_limits + per-metric pct; we only need to read it.
  const overview = await getAdminOverview({ days: 30 });
  for (const c of overview.customers) {
    // Skip free + zero-revenue accounts for margin alerts; still warn on usage.
    for (const [metric, pct] of Object.entries(c.usage_pct)) {
      const level = pct >= 1 ? 'critical' : pct >= 0.8 ? 'warning' : null;
      if (!level) continue;
      const kind = `usage_${metric}_${level}`;
      if (await alertEmittedRecently({ kind, user_id: c.id, hours: 24 })) continue;

      // Owner email — best effort (we have it on the row).
      if (c.email) {
        await sendUsageAlert({ ownerEmail: c.email, metric, pct, plan: c.plan }).catch(() => {});
      }
      await recordAdminAlert({ kind, user_id: c.id, payload: { metric, pct, plan: c.plan } });
    }

    // Margin alert — separate cadence, only for paid plans, only when truly at risk.
    if (c.at_risk && c.plan !== 'free') {
      const kind = 'margin_at_risk';
      if (await alertEmittedRecently({ kind, user_id: c.id, hours: 48 })) continue;
      await sendAdminAlert({
        subject: `Customer ${c.email || c.id} is at margin risk on ${c.plan}`,
        body: `revenue: €${(c.revenue_cents / 100).toFixed(2)} | est. cost: €${(c.estimated_cost_cents / 100).toFixed(2)} | margin: €${(c.margin_cents / 100).toFixed(2)}\nplan: ${c.plan}\nsessions: ${c.sessions} | voice_seconds: ${c.voice_seconds_used} | tts_chars: ${c.tts_chars_used} | llm_tokens: ${c.llm_tokens_used}`,
        kind: 'warning',
      });
      await recordAdminAlert({ kind, user_id: c.id, payload: {
        revenue_cents: c.revenue_cents, cost_cents: c.estimated_cost_cents, margin_cents: c.margin_cents,
      } });
    }
  }
}

export async function runQuotaWatch() {
  if (!process.env.ADMIN_EMAIL) return; // nothing to send
  await checkProviderBudgets();
  await checkUserLimits();
}
