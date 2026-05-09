import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import checkoutRouter from './routes/checkout.js';
import webhookRouter from './routes/webhook.js';
import apiRouter from './routes/api.js';
import livekitRouter from './routes/livekit.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 4000;

// Stripe webhook needs raw body — mount BEFORE json middleware
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  next();
}, webhookRouter);

const ALLOWED_ORIGINS = [
  process.env.APP_URL ?? 'http://localhost:4000',
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000',
];
app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error('CORS'))),
  credentials: true,
}));
app.use(express.json());

// Serve the embeddable widget.js from public/
app.use('/widget.js', express.static(join(__dir, '..', 'public', 'widget.js')));

// Serve dashboard frontend static files (production build)
app.use(express.static(join(__dir, '..', 'dist')));

app.use('/api/checkout', checkoutRouter);
app.use('/api', livekitRouter);
app.use('/api', apiRouter);

// SPA fallback for /dashboard, etc.
app.get('*', (req, res) => {
  res.sendFile(join(__dir, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Navi] server running on http://localhost:${PORT}`);
});
