import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LeadsList } from './pages/LeadsList';
import { LeadDetail } from './pages/LeadDetail';
import { CompaniesList } from './pages/CompaniesList';
import { CompanyDetail } from './pages/CompanyDetail';
import { DealsList } from './pages/DealsList';
import { DealDetail } from './pages/DealDetail';
import { PipelineBoard } from './pages/PipelineBoard';
import { CustomerSuccessBoard } from './pages/CustomerSuccessBoard';
import { SupportTicketsList } from './pages/SupportTicketsList';
import { SupportTicketDetail } from './pages/SupportTicketDetail';
import { TasksPage } from './pages/TasksPage';
import { TaskDetail } from './pages/TaskDetail';
import { NotificationBell } from './components/NotificationBell';
import type { ReactNode } from 'react';

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>iProfit CRM</h1>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/leads">Leads</NavLink>
          <NavLink to="/companies">Companies</NavLink>
          <NavLink to="/deals">Deals</NavLink>
          <NavLink to="/pipeline">Pipeline</NavLink>
          <NavLink to="/customer-success">Customer Success</NavLink>
          <NavLink to="/support-tickets">Support Tickets</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn secondary"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <NotificationBell />
            <span style={{ fontSize: 14 }}>{user?.fullName} ({user?.role})</span>
            <button className="btn secondary" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  return user ? <Shell>{children}</Shell> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/leads" element={<Protected><LeadsList /></Protected>} />
      <Route path="/leads/:id" element={<Protected><LeadDetail /></Protected>} />
      <Route path="/companies" element={<Protected><CompaniesList /></Protected>} />
      <Route path="/companies/:id" element={<Protected><CompanyDetail /></Protected>} />
      <Route path="/deals" element={<Protected><DealsList /></Protected>} />
      <Route path="/deals/:id" element={<Protected><DealDetail /></Protected>} />
      <Route path="/pipeline" element={<Protected><PipelineBoard /></Protected>} />
      <Route path="/customer-success" element={<Protected><CustomerSuccessBoard /></Protected>} />
      <Route path="/support-tickets" element={<Protected><SupportTicketsList /></Protected>} />
      <Route path="/support-tickets/:id" element={<Protected><SupportTicketDetail /></Protected>} />
      <Route path="/tasks" element={<Protected><TasksPage /></Protected>} />
      <Route path="/tasks/:id" element={<Protected><TaskDetail /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
