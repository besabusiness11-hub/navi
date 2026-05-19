import { useState } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
const TOKEN_KEY = 'navi_admin_token_v1';

export function readStoredAdminToken() {
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
export function storeAdminToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore quota */ }
}
export function clearAdminToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

// Single-field token entry. Validates against /api/admin/overview before
// persisting so a wrong token never lands in localStorage.
export default function AdminLogin({ onAuth }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError('');
    try {
      const resp = await fetch(`${BACKEND}/api/admin/overview?days=1`, {
        headers: { 'x-admin-token': token },
      });
      if (resp.status === 401 || resp.status === 503) {
        setError(resp.status === 503 ? 'Admin is not configured on the server (ADMIN_TOKEN missing).' : 'Invalid token.');
      } else if (!resp.ok) {
        setError(`Backend returned ${resp.status}`);
      } else {
        storeAdminToken(token);
        onAuth(token);
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#06060a] text-white font-mono">
      <form onSubmit={submit} className="w-[420px] max-w-[90vw] border border-white/10 rounded-2xl p-8 bg-white/[0.03]">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-7 h-7 rounded-full bg-[#a6b1b6]" />
          <span className="text-sm tracking-[0.2em] uppercase text-white/50">Navi · Admin</span>
        </div>
        <h1 className="text-2xl font-semibold mb-1">Restricted area</h1>
        <p className="text-sm text-white/40 mb-6">Enter the ADMIN_TOKEN configured on the API.</p>
        <input
          type="password"
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_TOKEN"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm tracking-wide focus:outline-none focus:border-white/30"
        />
        {error && <p className="mt-3 text-[12px] text-[#ff7676]">{error}</p>}
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="mt-5 w-full bg-white text-[#06060a] py-2 rounded-full text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Verifying…' : 'Enter'}
        </button>
        <p className="mt-6 text-[11px] text-white/30 leading-relaxed">
          Token is only stored in this browser's localStorage. Clear it by signing out.
        </p>
      </form>
    </div>
  );
}
