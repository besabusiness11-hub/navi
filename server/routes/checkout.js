import { Router } from 'express';
import Stripe from 'stripe';
import { getUserByEmail } from '../db.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

const PRICE_IDS = {
  free:    null,
  starter: process.env.STRIPE_PRICE_STARTER,
  growth:  process.env.STRIPE_PRICE_GROWTH,
};

// POST /api/checkout  { email, name, plan }
router.post('/', async (req, res) => {
  const { email, name, plan } = req.body;

  if (!email || !plan) return res.status(400).json({ error: 'email and plan required' });
  if (!PLANS_VALID.includes(plan)) return res.status(400).json({ error: 'invalid plan' });

  try {
    // Free plan: skip Stripe, create user directly
    if (plan === 'free') {
      const existing = getUserByEmail(email);
      if (existing) {
        return res.json({ redirect: `${process.env.APP_URL}/dashboard?token=${existing.dashboard_token}` });
      }
      // Will be created by the /api/provision endpoint
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
    });

    res.json({ redirect: session.url });
  } catch (err) {
    console.error('[checkout]', err.message);
    res.status(500).json({ error: 'checkout failed' });
  }
});

const PLANS_VALID = ['free', 'starter', 'growth'];

export default router;
