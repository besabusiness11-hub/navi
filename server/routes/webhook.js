import { Router } from 'express';
import Stripe from 'stripe';
import {
  createUser, getUserByEmail, getUserBySubscriptionId, getUserByCustomerId,
  updateUser, addBonusSessions, revertSubscriptionToFree,
} from '../db.js';
import { generateApiKey, generateToken } from '../keys.js';
import { sendWelcomeEmail } from '../email.js';
import { forwardInvoiceToSDI } from '../fattureincloud.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

// Stripe price ID → Navi plan. Built from env at boot.
const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_STARTER]:  'starter',
  [process.env.STRIPE_PRICE_BUSINESS]: 'business',
  [process.env.STRIPE_PRICE_AGENCY]:   'agency',
};
const planFromSubscription = (sub) => {
  const priceId = sub.items?.data?.[0]?.price?.id;
  return PRICE_TO_PLAN[priceId] ?? null;
};

// POST /api/webhook  — raw body required (configured in index.js)
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] sig verify failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await onPaymentIntentSucceeded(event.data.object);
        break;
      case 'invoice.paid':
        // Forward to Fatture in Cloud → SDI (Italian e-invoicing).
        await forwardInvoiceToSDI(event.data.object);
        break;
    }
  } catch (err) {
    console.error(`[webhook] handler error (${event.type}):`, err.message);
  }

  res.json({ received: true });
});

// ── checkout.session.completed — provision user, anchor billing cycle ─────────
async function onCheckoutCompleted(session) {
  // Session packs use mode=payment; handled by payment_intent.succeeded.
  if (session.mode === 'payment') return;

  const email = session.customer_email;
  const name = session.metadata?.name ?? '';
  const plan = session.metadata?.plan ?? 'starter';
  const stripeCustomerId = session.customer;
  const stripeSubId = session.subscription;

  let user = await getUserByEmail(email);

  if (user) {
    // Upgrade existing user — fresh billing cycle, reset usage.
    await updateUser(user.id, {
      plan,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubId,
      billing_cycle_start: Math.floor(Date.now() / 1000),
      session_count: 0,
    });
    user = await getUserByEmail(email);
  } else {
    // New user — createUser sets billing_cycle_start = now().
    const api_key = generateApiKey();
    const dashboard_token = generateToken();
    await createUser({ email, name, plan, api_key, dashboard_token, stripe_customer_id: stripeCustomerId });
    user = await getUserByEmail(email);
    if (stripeSubId) await updateUser(user.id, { stripe_subscription_id: stripeSubId });
  }

  await sendWelcomeEmail({
    email: user.email,
    name: user.name,
    plan: user.plan,
    apiKey: user.api_key,
    dashboardToken: user.dashboard_token,
  }).catch(e => console.error('[webhook] welcome email:', e.message));

  console.log(`[webhook] user provisioned: ${email} / ${plan}`);
}

// ── customer.subscription.updated — plan upgrade / downgrade ──────────────────
async function onSubscriptionUpdated(sub) {
  const user = await getUserBySubscriptionId(sub.id) || await getUserByCustomerId(sub.customer);
  if (!user) {
    console.warn(`[webhook] subscription.updated: no user for ${sub.id}`);
    return;
  }

  const newPlan = planFromSubscription(sub);
  if (!newPlan) {
    console.warn(`[webhook] subscription.updated: unknown price for ${sub.id}`);
    return;
  }

  // canceled-at-period-end leaves status 'active' until the period ends — no
  // change here; the actual revert happens on subscription.deleted.
  if (newPlan === user.plan) return;

  // Plan change: re-anchor the billing cycle and reset usage so the new
  // allowance starts clean.
  await updateUser(user.id, {
    plan: newPlan,
    billing_cycle_start: Math.floor(Date.now() / 1000),
    session_count: 0,
  });
  console.log(`[webhook] plan ${user.plan} → ${newPlan} for ${user.email}`);
}

// ── customer.subscription.deleted — revert to free ───────────────────────────
async function onSubscriptionDeleted(sub) {
  await revertSubscriptionToFree(sub.id);
  console.log(`[webhook] subscription cancelled: ${sub.id} → free`);
}

// ── payment_intent.succeeded — session pack purchase ─────────────────────────
async function onPaymentIntentSucceeded(pi) {
  // Packs are flagged via metadata set at checkout creation.
  const packs = Number(pi.metadata?.navi_packs ?? 0);
  const userId = Number(pi.metadata?.navi_user_id ?? 0);
  if (!packs || !userId) return;

  await addBonusSessions(userId, packs * 100);
  console.log(`[webhook] +${packs * 100} bonus sessions for user ${userId}`);
}

export default router;
