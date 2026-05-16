/**
 * Lightweight same-origin site crawler — no external deps.
 * BFS from a root URL, fetch HTML, extract readable text, classify and chunk it.
 * Output feeds the knowledge-base builder (kb.js).
 */

const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, m => HTML_ENTITIES[m.toLowerCase()] ?? m);
}

// Strip scripts/styles/markup → plain readable text.
export function extractText(html) {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  h = decodeEntities(h);
  return h.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

// Same-origin links only, normalized, fragment/query stripped.
function extractLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = new Set();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.origin !== base.origin) continue;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|css|js|webp|ico)$/i.test(u.pathname)) continue;
      u.hash = '';
      u.search = '';
      links.add(u.href);
    } catch (_) { /* malformed href */ }
  }
  return [...links];
}

// Heuristic classification of a text block.
function classify(url, text) {
  const hay = (url + ' ' + text).toLowerCase();
  if (/\b(pric|plan|€|\$|\/mo|per month|subscription|tier)\b/.test(hay)) return 'pricing';
  if (/\b(faq|frequently asked|q:|question)\b/.test(hay)) return 'faq';
  if (/\b(feature|how it works|capabilit|benefit)\b/.test(hay)) return 'feature';
  return 'content';
}

// Split long text into ~600-char chunks on sentence boundaries.
function chunkText(text, max = 600) {
  const out = [];
  const paras = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 20);
  let buf = '';
  for (const p of paras) {
    if ((buf + ' ' + p).length > max) {
      if (buf) out.push(buf.trim());
      buf = p.length > max ? p.slice(0, max) : p;
    } else {
      buf = buf ? `${buf} ${p}` : p;
    }
  }
  if (buf) out.push(buf.trim());
  return out;
}

async function fetchPage(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'NaviBot/1.0 (+https://getnavi.dev/bot)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    return await res.text();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Crawl a site BFS, same-origin, up to maxPages.
 * Returns { pages: [{url,title}], chunks: [{url,title,kind,content}] }.
 */
export async function crawlSite(rootUrl, { maxPages = 20, timeoutMs = 8000 } = {}) {
  let root;
  try { root = new URL(rootUrl); }
  catch { throw new Error('invalid site URL'); }

  const queue = [root.href];
  const visited = new Set();
  const pages = [];
  const chunks = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const html = await fetchPage(url, timeoutMs);
    if (!html) continue;

    const title = extractTitle(html) || url;
    const text = extractText(html);
    if (text.length < 80) continue;        // skip near-empty pages

    pages.push({ url, title });
    for (const content of chunkText(text)) {
      chunks.push({ url, title, kind: classify(url, content), content });
    }

    // Enqueue new same-origin links.
    if (pages.length < maxPages) {
      for (const link of extractLinks(html, url)) {
        if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }
    }
  }

  return { pages, chunks };
}
