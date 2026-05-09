import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey && !apiKey.startsWith('re_placeholder') ? new Resend(apiKey) : null;

const PLANS = {
  free:    { label: 'Free',    minutes: '100 total'   },
  starter: { label: 'Starter', minutes: '800/mo'      },
  growth:  { label: 'Growth',  minutes: '5,000/mo'    },
};

export async function sendWelcomeEmail({ email, name, plan, apiKey, dashboardToken }) {
  if (!resend) { console.warn('[email] Resend not configured, skipping welcome email'); return; }
  const p = PLANS[plan] ?? PLANS.free;
  const dashboardUrl = `${process.env.APP_URL}/dashboard?token=${dashboardToken}`;
  const embedCode = `<script src="${process.env.APP_URL}/widget.js" data-key="${apiKey}" defer></script>`;

  await resend.emails.send({
    from: 'Navi <noreply@navi.ai>',
    to: email,
    subject: 'Your Navi widget is ready — install in 30 seconds',
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    body { margin: 0; padding: 0; background: #06060a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 40px; }
    .logo-dot { width: 28px; height: 28px; border-radius: 50%; background: #a6b1b6; }
    .logo-name { color: white; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
    h1 { color: white; font-size: 28px; font-weight: 600; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.02em; }
    .sub { color: rgba(255,255,255,0.45); font-size: 15px; margin: 0 0 40px; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 24px; margin-bottom: 16px; }
    .card-label { color: rgba(255,255,255,0.3); font-size: 10px; font-family: monospace; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 8px; }
    .code-block { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 16px; font-family: monospace; font-size: 12px; color: rgba(255,255,255,0.7); word-break: break-all; line-height: 1.6; }
    .api-key { color: rgba(255,255,255,0.5); font-family: monospace; font-size: 13px; }
    .btn { display: inline-block; background: white; color: #06060a; text-decoration: none; padding: 12px 28px; border-radius: 100px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .plan-badge { display: inline-block; background: rgba(74,127,255,0.15); border: 1px solid rgba(74,127,255,0.3); color: rgba(130,180,255,0.9); font-family: monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; padding: 4px 10px; border-radius: 100px; }
    .step { color: rgba(255,255,255,0.5); font-size: 14px; margin: 0 0 6px; }
    .step strong { color: rgba(255,255,255,0.85); }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 32px 0; }
    .footer { color: rgba(255,255,255,0.2); font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">
      <div class="logo-dot"></div>
      <span class="logo-name">Navi</span>
    </div>

    <h1>Welcome${name ? `, ${name}` : ''}.</h1>
    <p class="sub">Your voice agent is live. Install takes under a minute.</p>

    <div class="card">
      <div class="card-label">Your plan</div>
      <span class="plan-badge">${p.label} — ${p.minutes} minutes</span>
    </div>

    <div class="card">
      <div class="card-label">Step 1 — Paste before &lt;/body&gt; on your site</div>
      <div class="code-block">${embedCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>

    <div class="card">
      <div class="card-label">Step 2 — Open your dashboard</div>
      <p class="step" style="margin-bottom:16px;">Control your agent, change vinyl color, view analytics.</p>
      <a href="${dashboardUrl}" class="btn">Open Dashboard →</a>
    </div>

    <div class="card">
      <div class="card-label">Terminal access</div>
      <div class="code-block">npx navi-cli open ${dashboardToken}</div>
      <p class="step" style="margin-top:10px;margin-bottom:0;font-size:12px;">Paste this in your terminal to open the dashboard from anywhere.</p>
    </div>

    <div class="card">
      <div class="card-label">Your API key — keep this secret</div>
      <div class="code-block">${apiKey}</div>
    </div>

    <hr class="divider">
    <p class="footer">
      Questions? Reply to this email.<br>
      Navi · <a href="${process.env.APP_URL}" style="color:rgba(255,255,255,0.3);">${process.env.APP_URL}</a>
    </p>
  </div>
</body>
</html>`,
  });
}

export async function sendLeadAlert({ ownerEmail, visitorName, visitorEmail, pageUrl, message }) {
  if (!resend) return;
  await resend.emails.send({
    from: 'Navi <noreply@navi.ai>',
    to: ownerEmail,
    subject: `New lead captured by Navi${visitorName ? ` — ${visitorName}` : ''}`,
    html: `<div style="font-family:monospace;background:#06060a;color:rgba(255,255,255,0.7);padding:32px;max-width:500px;margin:0 auto;border-radius:12px;">
      <p style="color:#3dc45a;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 16px;">● Lead captured</p>
      ${visitorName ? `<p style="margin:4px 0;"><strong style="color:white;">Name:</strong> ${visitorName}</p>` : ''}
      ${visitorEmail ? `<p style="margin:4px 0;"><strong style="color:white;">Email:</strong> ${visitorEmail}</p>` : ''}
      <p style="margin:4px 0;"><strong style="color:white;">Page:</strong> ${pageUrl}</p>
      <p style="margin:16px 0 4px;font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.15em;">Their message</p>
      <p style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 14px;margin:0;">"${message}"</p>
    </div>`,
  });
}

export async function sendUnknownAlert({ ownerEmail, question, pageUrl }) {
  if (!resend) return;
  await resend.emails.send({
    from: 'Navi <noreply@navi.ai>',
    to: ownerEmail,
    subject: 'Navi could not answer a question',
    html: `<div style="font-family:monospace;background:#06060a;color:rgba(255,255,255,0.7);padding:32px;max-width:500px;margin:0 auto;border-radius:12px;">
      <p style="color:#febc2e;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 16px;">⚠ Unanswered question</p>
      <p style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 14px;margin:0 0 12px;">"${question}"</p>
      <p style="margin:4px 0;font-size:12px;"><strong style="color:white;">Page:</strong> ${pageUrl}</p>
      <p style="margin:16px 0 0;font-size:11px;color:rgba(255,255,255,0.3);">Consider adding this to your site content or FAQ so Navi can answer it next time.</p>
    </div>`,
  });
}
