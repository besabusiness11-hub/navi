import { useState } from 'react';
import AdminLogin, { readStoredAdminToken } from './AdminLogin.jsx';
import AdminDashboard from './AdminDashboard.jsx';

// Top-level admin shell — picks between login form and dashboard based on the
// presence of a stored token. Token validity is re-checked by every API call.
export default function Admin() {
  const [token, setToken] = useState(() => readStoredAdminToken());
  if (!token) return <AdminLogin onAuth={setToken} />;
  return <AdminDashboard token={token} onSignOut={() => setToken('')} />;
}
