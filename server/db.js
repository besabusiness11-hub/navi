import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dir, 'navi.db'));

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    email                 TEXT    UNIQUE NOT NULL,
    name                  TEXT    NOT NULL DEFAULT '',
    plan                  TEXT    NOT NULL DEFAULT 'free',
    api_key               TEXT    UNIQUE NOT NULL,
    dashboard_token       TEXT    UNIQUE NOT NULL,
    stripe_customer_id    TEXT,
    stripe_subscription_id TEXT,
    site_url              TEXT    DEFAULT '',
    vinyl_color           TEXT    DEFAULT 'midnight',
    agent_enabled         INTEGER DEFAULT 1,
    minute_used           INTEGER DEFAULT 0,
    created_at            INTEGER DEFAULT (unixepoch()),
    last_seen             INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    page_url   TEXT,
    visitor_id TEXT,
    message    TEXT NOT NULL,
    reply      TEXT NOT NULL,
    is_lead    INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    visitor_id TEXT,
    name       TEXT,
    email      TEXT,
    page_url   TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

export default db;

// Helpers
export const getUserByKey = (api_key) =>
  db.prepare('SELECT * FROM users WHERE api_key = ?').get(api_key);

export const getUserByToken = (token) =>
  db.prepare('SELECT * FROM users WHERE dashboard_token = ?').get(token);

export const getUserByEmail = (email) =>
  db.prepare('SELECT * FROM users WHERE email = ?').get(email);

export const getUserById = (id) =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id);

export const createUser = db.prepare(`
  INSERT INTO users (email, name, plan, api_key, dashboard_token, stripe_customer_id)
  VALUES (:email, :name, :plan, :api_key, :dashboard_token, :stripe_customer_id)
`);

export const updateUser = (id, patch) => {
  const cols = Object.keys(patch).map(k => `${k} = :${k}`).join(', ');
  db.prepare(`UPDATE users SET ${cols} WHERE id = :id`).run({ ...patch, id });
};

export const logConversation = db.prepare(`
  INSERT INTO conversations (user_id, page_url, visitor_id, message, reply, is_lead)
  VALUES (:user_id, :page_url, :visitor_id, :message, :reply, :is_lead)
`);

export const getRecentConversations = (user_id, limit = 20) =>
  db.prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(user_id, limit);

export const getLeads = (user_id) =>
  db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC').all(user_id);

export const getAnalytics = (user_id) => {
  const today = db.prepare(`
    SELECT COUNT(*) as count FROM conversations
    WHERE user_id = ? AND created_at >= unixepoch('now', 'start of day')
  `).get(user_id);

  const week = db.prepare(`
    SELECT DATE(created_at, 'unixepoch') as day, COUNT(*) as count
    FROM conversations WHERE user_id = ? AND created_at >= unixepoch('now', '-6 days')
    GROUP BY day ORDER BY day
  `).all(user_id);

  const topPages = db.prepare(`
    SELECT page_url, COUNT(*) as questions
    FROM conversations WHERE user_id = ?
    GROUP BY page_url ORDER BY questions DESC LIMIT 10
  `).all(user_id);

  const topQuestions = db.prepare(`
    SELECT message, COUNT(*) as count
    FROM conversations WHERE user_id = ?
    GROUP BY message ORDER BY count DESC LIMIT 10
  `).all(user_id);

  const leadsCount = db.prepare('SELECT COUNT(*) as count FROM leads WHERE user_id = ?').get(user_id);

  return { today: today.count, week, topPages, topQuestions, leads: leadsCount.count };
};
