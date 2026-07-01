import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LeadsList } from './pages/LeadsList';
import { LeadDetail } from './pages/LeadDetail';
import type { ReactNode } from 'react';

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>iProfit CRM</h1>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/leads">Leads</NavLink>
          <NavLink to="/pipeline">Pipeline</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <div />
          <div>
            <span style={{ marginRight: 12, fontSize: 14 }}>{user?.fullName} ({user?.role})</span>
            <button className="btn secondary" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <Shell>{children}</Shell> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/leads" element={<Protected><LeadsList /></Protected>} />
      <Route path="/leads/:id" element={<Protected><LeadDetail /></Protected>} />
      <Route path="/pipeline" element={<Protected><div><h2>Pipeline</h2><p>Kanban board — build per spec (Day 17–19).</p></div></Protected>} />
      <Route path="/tasks" element={<Protected><div><h2>Tasks</h2><p>Task list — build per spec (Day 13–14).</p></div></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
