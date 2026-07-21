import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LeadsList } from './pages/LeadsList';
import { LeadDetail } from './pages/LeadDetail';
import { CompaniesList } from './pages/CompaniesList';
import { CompanyDetail } from './pages/CompanyDetail';
import { ContactsList } from './pages/ContactsList';
import { ContactDetail } from './pages/ContactDetail';
import { DealsList } from './pages/DealsList';
import { DealDetail } from './pages/DealDetail';
import { ProductsList } from './pages/ProductsList';
import { Reports } from './pages/Reports';
import { RepPerformance } from './pages/RepPerformance';
import { ClientHealth } from './pages/ClientHealth';
import { SettingsAutomation } from './pages/SettingsAutomation';
import { SettingsLeadSources } from './pages/SettingsLeadSources';
import { PipelineBoard } from './pages/PipelineBoard';
import { CustomerSuccessBoard } from './pages/CustomerSuccessBoard';
import { SupportTicketsList } from './pages/SupportTicketsList';
import { SupportTicketDetail } from './pages/SupportTicketDetail';
import { TasksPage } from './pages/TasksPage';
import { TaskDetail } from './pages/TaskDetail';
import { NotificationBell } from './components/NotificationBell';
import { GlobalSearch } from './components/GlobalSearch';
import { RecentlyViewedMenu } from './components/RecentlyViewedMenu';
import { RemindersMenu } from './components/RemindersMenu';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import type { ReactNode } from 'react';

const NAV_LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/leads', label: 'Leads', icon: 'person' },
  { to: '/companies', label: 'Companies', icon: 'building' },
  { to: '/contacts', label: 'Contacts', icon: 'person' },
  { to: '/deals', label: 'Deals', icon: 'dollar' },
  { to: '/products', label: 'Products', icon: 'inbox' },
  { to: '/pipeline', label: 'Pipeline', icon: 'columns' },
  { to: '/reports', label: 'Reports', icon: 'filter' },
  { to: '/rep-performance', label: 'Rep Performance', icon: 'clock' },
  { to: '/client-health', label: 'Client Health', icon: 'headset' },
  { to: '/customer-success', label: 'Customer Success', icon: 'headset' },
  { to: '/support-tickets', label: 'Support Tickets', icon: 'ticket' },
  { to: '/tasks', label: 'Tasks', icon: 'checklist' },
  { to: '/settings/automation', label: 'Automation', icon: 'sparkle' },
  { to: '/settings/lead-sources', label: 'Lead Sources', icon: 'filter' },
];

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>iProfit CRM</h1>
        <nav>
          {NAV_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              <Icon name={l.icon} size={18} />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <GlobalSearch />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RemindersMenu />
            <RecentlyViewedMenu />
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
      <Route path="/contacts" element={<Protected><ContactsList /></Protected>} />
      <Route path="/contacts/:id" element={<Protected><ContactDetail /></Protected>} />
      <Route path="/deals" element={<Protected><DealsList /></Protected>} />
      <Route path="/deals/:id" element={<Protected><DealDetail /></Protected>} />
      <Route path="/products" element={<Protected><ProductsList /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="/rep-performance" element={<Protected><RepPerformance /></Protected>} />
      <Route path="/client-health" element={<Protected><ClientHealth /></Protected>} />
      <Route path="/settings/automation" element={<Protected><SettingsAutomation /></Protected>} />
      <Route path="/settings/lead-sources" element={<Protected><SettingsLeadSources /></Protected>} />
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
