import { APP_NAME, TAGLINE, DEMO_DOMAIN } from './brand.js';
import { useEffect, useState } from 'react';
import { useDB, useSession, login, setSession } from './store.js';
import { Dashboard, EntityPage, DealsBoard, GraphPage, CopilotPage, ApprovalsPage, AuditPage, ConnectorsPage, SettingsPage, DeliverablesPage } from './pages.jsx';
import { AIWorkspace } from './workspace.jsx';
import { RecordDrawer } from './ui.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { id: 'copilot', label: 'AI Copilot', icon: 'M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z' },
  { id: 'deals', label: 'Deals', icon: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v7h-4z' },
  { id: 'companies', label: 'Companies', icon: 'M4 21V5l8-3 8 3v16H4zm4-12h2v2H8zm6 0h2v2h-2zm-6 4h2v2H8zm6 0h2v2h-2z' },
  { id: 'contacts', label: 'Contacts', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z' },
  { id: 'tasks', label: 'Tasks', icon: 'M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z' },
  { id: 'deliverables', label: 'AI Deliverables', icon: 'M6 2h8l6 6v14H6zM13 3.5V9h5.5M9 13h8v1.5H9zm0 3h8v1.5H9z' },
  { id: 'graph', label: 'Knowledge Graph', icon: 'M6 6a2 2 0 11.001 0zM18 8a2 2 0 11.001 0zM12 19a2 2 0 11.001 0zM6 6l12 2-6 11z' },
  { id: 'approvals', label: 'Approvals', icon: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z' },
  { id: 'audit', label: 'Audit Log', icon: 'M13 3a9 9 0 00-9 9H1l4 4 4-4H6a7 7 0 117 7v2a9 9 0 000-18zm-1 5v5l4 2 .8-1.3-3.3-2V8z' },
  { id: 'connectors', label: 'Connectors', icon: 'M7 7h4v2H7a3 3 0 000 6h4v2H7A5 5 0 017 7zm6 0h4a5 5 0 010 10h-4v-2h4a3 3 0 000-6h-4zM8 11h8v2H8z' },
  { id: 'settings', label: 'Settings', icon: 'M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7 7 0 00-1.7-1L15 3h-4l-.4 2.9a7 7 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 001.7 1L11 21h4l.4-2.9a7 7 0 001.7-1l2.5 1 2-3.5zM13 15a3 3 0 110-6 3 3 0 010 6z' },
];

function useRoute() {
  const get = () => (window.location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const f = () => setRoute(get());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
}

export function Icon({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Login() {
  const [email, setEmail] = useState(`admin@${DEMO_DOMAIN}`);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const u = await login(email, password);
    setBusy(false);
    if (!u) setErr('Wrong email or password.');
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big"><span className="logo" />{APP_NAME}</div>
        <p className="muted">{TAGLINE}</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        <p className="tiny muted">Each browser keeps its own copy of the CRM data. Use Settings &gt; Backup to move data between devices.</p>
      </form>
    </div>
  );
}

export default function App() {
  const db = useDB();
  const user = useSession();
  const route = useRoute();
  const [drawer, setDrawer] = useState(null); // {entity, id}
  const [navOpen, setNavOpen] = useState(false);
  const [aiWs, setAiWs] = useState(null); // {taskId, deliverableId, autoRun}

  useEffect(() => setNavOpen(false), [route]);

  if (!user) return <Login />;

  const pending = db.proposals.filter((p) => p.status === 'pending').length;
  const open = (entity, id) => setDrawer({ entity, id });
  const useAI = (taskId, deliverableId = null, autoRun = false) => { setDrawer(null); setAiWs({ taskId, deliverableId, autoRun }); };
  const ctx = { db, user, open, useAI };

  let page;
  switch (route) {
    case 'copilot': page = <CopilotPage {...ctx} />; break;
    case 'deals': page = <DealsBoard {...ctx} />; break;
    case 'companies':
    case 'contacts':
    case 'tasks': page = <EntityPage key={route} entity={route} {...ctx} />; break;
    case 'graph': page = <GraphPage {...ctx} />; break;
    case 'deliverables': page = <DeliverablesPage {...ctx} />; break;
    case 'approvals': page = <ApprovalsPage {...ctx} />; break;
    case 'audit': page = <AuditPage {...ctx} />; break;
    case 'connectors': page = <ConnectorsPage {...ctx} />; break;
    case 'settings': page = <SettingsPage {...ctx} />; break;
    default: page = <Dashboard {...ctx} />;
  }

  return (
    <div className={'shell' + (navOpen ? ' nav-open' : '')}>
      <aside className="sidebar">
        <div className="brand"><span className="logo" /><div>{APP_NAME}<div className="tiny muted ws-name">{db.settings.orgName}</div></div></div>
        <nav>
          {NAV.map((n) => (
            <a key={n.id} href={'#/' + n.id} className={route === n.id || (route === 'dashboard' && n.id === 'dashboard') ? 'active' : ''}>
              <Icon d={n.icon} />
              <span>{n.label}</span>
              {n.id === 'approvals' && pending > 0 && <span className="badge">{pending}</span>}
            </a>
          ))}
        </nav>
        <div className="me">
          <div className="avatar">{user.name.split(' ').map((s) => s[0]).join('').slice(0, 2)}</div>
          <div className="me-info">
            <div>{user.name}</div>
            <div className="tiny muted">{user.role}</div>
          </div>
          <button className="btn ghost sm" onClick={() => setSession(null)}>Sign out</button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main">
        <header className="topbar">
          <button className="btn ghost menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Icon d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
          </button>
          <div className="topbar-title">{NAV.find((n) => n.id === route)?.label || 'Dashboard'}</div>
        </header>
        <div className="content">{page}</div>
      </main>
      {aiWs && <AIWorkspace key={aiWs.taskId + (aiWs.deliverableId || '')} {...ctx} taskId={aiWs.taskId} initialDeliverableId={aiWs.deliverableId} autoRun={aiWs.autoRun} onClose={() => setAiWs(null)} />}
      {drawer && <RecordDrawer {...ctx} entity={drawer.entity} id={drawer.id} onClose={() => setDrawer(null)} />}
    </div>
  );
}
