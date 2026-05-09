import { Router } from 'express';
import Stripe from 'stripe';
import db, { createUser, getUserByEmail, updateUser } from '../db.js';
import { generateApiKey, generateToken } from '../keys.js';
import { sendWelcomeEmail } from '../email.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email;
    const name = session.metadata?.name ?? '';
    const plan = session.metadata?.plan ?? 'starter';
    const stripeCustomerId = session.customer;
    const stripeSubId = session.subscription;

    try {
      let user = getUserByEmail(email);

      if (user) {
        // Upgrade existing user
        updateUser(user.id, { plan, stripe_customer_id: stripeCustomerId, stripe_subscription_id: stripeSubId });
        user = getUserByEmail(email);
      } else {
        // New user
        const api_key = generateApiKey();
        const dashboard_token = generateToken();
        createUser.run({ email, name, plan, api_key, dashboard_token, stripe_customer_id: stripeCustomerId });
        user = getUserByEmail(email);
      }

      await sendWelcomeEmail({
        email: user.email,
        name: user.name,
        plan: user.plan,
        apiKey: user.api_key,
        dashboardToken: user.dashboard_token,
      });

      console.log(`[webhook] user provisioned: ${email} / ${plan}`);
    } catch (err) {
      console.error('[webhook] provision error:', err.message);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const stmt = db.prepare('UPDATE users SET plan = ? WHERE stripe_subscription_id = ?');
    stmt.run('free', sub.id);
    console.log(`[webhook] subscription cancelled: ${sub.id}`);
  }

  res.json({ received: true });
});

export default router;
