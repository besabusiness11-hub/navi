#!/usr/bin/env node
import open from 'open';

const BASE = process.env.NAVI_URL || 'https://navi.ai';
const [, , cmd, arg] = process.argv;

const help = () => {
  console.log(`
  navi-cli — Navi dashboard from your terminal

  Commands:
    open <token>      Open your dashboard in the browser
    token             Print the stored token (if set)
    set-token <token> Save token for future use

  Examples:
    npx navi-cli open abc123...
    npx navi-cli set-token abc123...
    npx navi-cli open
  `);
};

const TOKEN_FILE = new URL('.navi-token', import.meta.url);

const readToken = () => {
  try {
    const { readFileSync } = await import('fs');
    return readFileSync(TOKEN_FILE.pathname, 'utf8').trim();
  } catch { return null; }
};

async function main() {
  if (!cmd || cmd === 'help') { help(); return; }

  if (cmd === 'set-token') {
    if (!arg) { console.error('Usage: navi-cli set-token <token>'); process.exit(1); }
    const { writeFileSync } = await import('fs');
    writeFileSync(new URL('.navi-token', import.meta.url).pathname, arg);
    console.log('✓ Token saved. Run: navi-cli open');
    return;
  }

  if (cmd === 'token') {
    const { readFileSync } = await import('fs');
    try {
      const t = readFileSync(new URL('.navi-token', import.meta.url).pathname, 'utf8').trim();
      console.log(t);
    } catch { console.log('No token stored. Run: navi-cli set-token <token>'); }
    return;
  }

  if (cmd === 'open') {
    let token = arg;

    if (!token) {
      // Try reading stored token
      const { readFileSync } = await import('fs');
      try {
        token = readFileSync(new URL('.navi-token', import.meta.url).pathname, 'utf8').trim();
      } catch {}
    }

    if (!token) {
      console.error('Token required. Usage:\n  navi-cli open <token>\n  navi-cli set-token <token>  # save once');
      process.exit(1);
    }

    const url = `${BASE}/dashboard?token=${token}`;
    console.log(`\n  Opening Navi dashboard...\n  ${url}\n`);
    await open(url);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  help();
  process.exit(1);
}

main().catch(err => { console.error(err.message); process.exit(1); });
