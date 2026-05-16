/**
 * Knowledge base — embeds crawled chunks into a local vector store (SQLite)
 * and retrieves the most relevant chunks for an agent query.
 *
 * Vector store: kb_chunks.embedding holds a JSON float array. Retrieval is a
 * brute-force cosine scan — fine up to a few thousand chunks per user.
 * Falls back to keyword overlap when no OPENAI_API_KEY is set.
 */
import {
  clearKB, insertKBChunk, getKBChunks, countKBChunks, updateUser,
} from './db.js';
import { crawlSite } from './crawler.js';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_BATCH = 96;

const hasEmbeddings = () => !!process.env.OPENAI_API_KEY;

// ── Embeddings ────────────────────────────────────────────────────────────────
async function embedBatch(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}`);
  const data = await res.json();
  return data.data.map(d => d.embedding);
}

async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...await embedBatch(texts.slice(i, i + EMBED_BATCH)));
  }
  return out;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Keyword-overlap score — fallback ranking when embeddings are unavailable.
function keywordScore(query, content) {
  const terms = new Set(query.toLowerCase().match(/\w{3,}/g) || []);
  if (!terms.size) return 0;
  const text = content.toLowerCase();
  let hits = 0;
  for (const t of terms) if (text.includes(t)) hits++;
  return hits / terms.size;
}

// ── Build ─────────────────────────────────────────────────────────────────────
/**
 * Crawl the user's site, embed the chunks, replace the stored KB.
 * Runs async (fire-and-forget from the route); updates users.kb_status.
 */
export async function buildKB(user, { maxPages = 20 } = {}) {
  const siteUrl = user.site_url;
  if (!siteUrl) {
    await updateUser(user.id, { kb_status: 'error' });
    throw new Error('no site_url set for user');
  }

  await updateUser(user.id, { kb_status: 'crawling' });
  try {
    const { pages, chunks } = await crawlSite(siteUrl, { maxPages });
    if (!chunks.length) {
      await updateUser(user.id, { kb_status: 'error', kb_pages: 0 });
      return { pages: 0, chunks: 0 };
    }

    let embeddings = [];
    if (hasEmbeddings()) {
      try {
        embeddings = await embedAll(chunks.map(c => c.content));
      } catch (err) {
        console.warn('[kb] embedding failed, storing keyword-only:', err.message);
        embeddings = [];
      }
    }

    await clearKB(user.id);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await insertKBChunk({
        user_id: user.id,
        url: c.url,
        title: c.title,
        kind: c.kind,
        content: c.content,
        embedding: embeddings[i] ? JSON.stringify(embeddings[i]) : null,
      });
    }

    await updateUser(user.id, {
      kb_status: 'ready',
      kb_built_at: Math.floor(Date.now() / 1000),
      kb_pages: pages.length,
    });
    console.log(`[kb] built for user ${user.id}: ${pages.length} pages, ${chunks.length} chunks`);
    return { pages: pages.length, chunks: chunks.length };
  } catch (err) {
    await updateUser(user.id, { kb_status: 'error' });
    console.error('[kb] build failed:', err.message);
    throw err;
  }
}

// ── Retrieve ──────────────────────────────────────────────────────────────────
/**
 * Return the topK most relevant KB chunks for a query.
 * [{ content, url, title, kind, score }]
 */
export async function retrieveKB(userId, query, topK = 4) {
  const rows = await getKBChunks(userId);
  if (!rows.length || !query) return [];

  let scored;
  const embedded = rows.filter(r => r.embedding);

  if (hasEmbeddings() && embedded.length) {
    try {
      const [qVec] = await embedAll([query]);
      scored = embedded.map(r => ({
        ...r,
        score: cosine(qVec, JSON.parse(r.embedding)),
      }));
    } catch (err) {
      console.warn('[kb] query embed failed, keyword fallback:', err.message);
      scored = rows.map(r => ({ ...r, score: keywordScore(query, r.content) }));
    }
  } else {
    scored = rows.map(r => ({ ...r, score: keywordScore(query, r.content) }));
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0.05);
}

// Format retrieved chunks for injection into an agent system prompt.
export function formatKBForPrompt(chunks) {
  if (!chunks.length) return '';
  const body = chunks
    .map(c => `[${c.kind}] ${c.title}\n${c.content}`)
    .join('\n\n');
  return `\n\nKNOWLEDGE BASE — verified facts from the client's website. Answer ONLY from this; never invent details:\n${body}`;
}

export { countKBChunks };
