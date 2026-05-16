/**
 * Stripe setup — idempotent.
 * Creates the Navi subscription products + monthly EUR prices, and the
 * one-time session-pack prices. Re-runnable: looks up by metadata.navi_plan
 * and reuses existing objects instead of duplicating them.
 *
 *   node scripts/setup-stripe.js
 *
 * Prints the env vars to paste into .env when done.
 */
import 'dotenv/config';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

// Plan → recurring monthly price (EUR). Source: prezzi navi.docx §6.
const PLANS = [
  { key: 'starter',  name: 'Navi Starter',  amount: 4900,  sessions: 200  },
  { key: 'business', name: 'Navi Business', amount: 9900,  sessions: 600  },
  { key: 'agency',   name: 'Navi Agency',   amount: 19900, sessions: 1500 },
];

// One-time session packs (100 sessions each). Source: prezzi navi.docx §6.1.
const PACKS = [
  { key: 'pack_starter',  name: 'Navi Session Pack — Starter',  amount: 900 },
  { key: 'pack_business', name: 'Navi Session Pack — Business', amount: 800 },
  { key: 'pack_agency',   name: 'Navi Session Pack — Agency',   amount: 700 },
];

async function findProduct(naviKey) {
  const res = await stripe.products.search({ query: `metadata['navi_plan']:'${naviKey}'` });
  return res.data[0] ?? null;
}

async function ensureProduct(naviKey, name, extraMeta = {}) {
  let product = await findProduct(naviKey);
  if (product) {
    console.log(`  product exists: ${name} (${product.id})`);
    return product;
  }
  product = await stripe.products.create({
    name,
    metadata: { navi_plan: naviKey, ...extraMeta },
  });
  console.log(`  product created: ${name} (${product.id})`);
  return product;
}

async function ensurePrice(product, { amount, recurring }) {
  // Reuse an active price with the same amount + interval if one exists.
  const existing = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const match = existing.data.find(p =>
    p.unit_amount === amount &&
    p.currency === 'eur' &&
    (recurring ? p.recurring?.interval === 'month' : !p.recurring)
  );
  if (match) {
    console.log(`  price exists: ${match.id} (€${(amount / 100).toFixed(2)})`);
    return match;
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: amount,
    ...(recurring ? { recurring: { interval: 'month' } } : {}),
  });
  console.log(`  price created: ${price.id} (€${(amount / 100).toFixed(2)})`);
  return price;
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY missing in .env');
    process.exit(1);
  }

  const env = {};

  console.log('\nSubscription plans:');
  for (const plan of PLANS) {
    const product = await ensureProduct(plan.key, plan.name, { sessions: String(plan.sessions) });
    const price = await ensurePrice(product, { amount: plan.amount, recurring: true });
    env[`STRIPE_PRICE_${plan.key.toUpperCase()}`] = price.id;
  }

  console.log('\nSession packs (one-time, 100 sessions):');
  for (const pack of PACKS) {
    const product = await ensureProduct(pack.key, pack.name, { sessions: '100' });
    const price = await ensurePrice(product, { amount: pack.amount, recurring: false });
    env[`STRIPE_${pack.key.toUpperCase()}`] = price.id;
  }

  console.log('\n─────────────────────────────────────────────');
  console.log('Paste into .env:\n');
  for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);
  console.log('─────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('[setup-stripe]', err.message);
  process.exit(1);
});
