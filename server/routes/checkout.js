import { Router } from 'express';
import Stripe from 'stripe';
import { getUserByEmail, getUserByToken } from '../db.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

const PRICE_IDS = {
  free:     null,
  starter:  process.env.STRIPE_PRICE_STARTER,
  business: process.env.STRIPE_PRICE_BUSINESS,
  agency:   process.env.STRIPE_PRICE_AGENCY,
};

// One-time session-pack price per plan tier (100 sessions each).
const PACK_PRICE_IDS = {
  free:     process.env.STRIPE_PACK_STARTER,   // free users pay the Starter rate
  starter:  process.env.STRIPE_PACK_STARTER,
  business: process.env.STRIPE_PACK_BUSINESS,
  agency:   process.env.STRIPE_PACK_AGENCY,
};

const PLANS_VALID = ['free', 'starter', 'business', 'agency'];

// Stripe Tax + invoicing toggle — enabled when STRIPE_TAX_ENABLED=1.
const TAX_ENABLED = process.env.STRIPE_TAX_ENABLED === '1';

// POST /api/checkout  { email, name, plan }  — subscription checkout
router.post('/', async (req, res) => {
  const { email, name, plan } = req.body;

  if (!email || !plan) return res.status(400).json({ error: 'email and plan required' });
  if (!PLANS_VALID.includes(plan)) return res.status(400).json({ error: 'invalid plan' });

  try {
    // Free plan: skip Stripe, create user directly
    if (plan === 'free') {
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.json({ redirect: `${process.env.APP_URL}/dashboard?token=${existing.dashboard_token}` });
      }
      return res.json({ redirect: `${process.env.APP_URL}/api/provision?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name ?? '')}&plan=free` });
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) return res.status(400).json({ error: 'price not configured' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/#pricing`,
      metadata: { name: name ?? '', plan },
      // Italian fiscal compliance: Stripe Tax applies IVA 22% automatically,
      // Stripe Invoicing generates the PDF invoice. Needs a billing address.
      ...(TAX_ENABLED ? {
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
        invoice_creation: undefined, // subscriptions invoice automatically
      } : {}),
    });

    res.json({ redirect: session.url });
  } catch (err) {
    console.error('[checkout]', err.message);
    res.status(500).json({ error: 'checkout failed' });
  }
});

// POST /api/checkout/pack  { token, packs }  — one-time session-pack purchase
router.post('/pack', async (req, res) => {
  const token = req.body.token || req.headers['x-dashboard-token'];
  const packs = Math.max(1, Math.min(20, parseInt(req.body.packs ?? '1', 10) || 1));
  if (!token) return res.status(401).json({ error: 'missing token' });

  const user = await getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'invalid token' });

  const priceId = PACK_PRICE_IDS[user.plan] ?? PACK_PRICE_IDS.starter;
  if (!priceId) return res.status(400).json({ error: 'pack price not configured' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: packs }],
      success_url: `${process.env.APP_URL}/dashboard?token=${user.dashboard_token}&pack=ok`,
      cancel_url: `${process.env.APP_URL}/dashboard?token=${user.dashboard_token}`,
      // Metadata travels to the PaymentIntent so the webhook can credit
      // bonus_sessions (see webhook.js onPaymentIntentSucceeded).
      payment_intent_data: {
        metadata: { navi_user_id: String(user.id), navi_packs: String(packs) },
      },
      metadata: { navi_user_id: String(user.id), navi_packs: String(packs) },
      ...(TAX_ENABLED ? {
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        invoice_creation: { enabled: true },   // PDF invoice for one-time payments
      } : {}),
    });

    res.json({ redirect: session.url });
  } catch (err) {
    console.error('[checkout/pack]', err.message);
    res.status(500).json({ error: 'pack checkout failed' });
  }
});

export default router;
