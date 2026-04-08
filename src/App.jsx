import React, { useState } from 'react';
import Nav from './components/Nav';
import Toast from './components/Toast';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Shipments from './pages/Shipments';
import MapRouting from './pages/MapRouting';
import Alerts from './pages/Alerts';
import AIDecisions from './pages/AIDecisions';
import Fleet from './pages/Fleet';
import Warehouses from './pages/Warehouses';
import Simulator from './pages/Simulator';
import Analytics from './pages/Analytics';

const PAGE_MAP = {
  landing: Landing,
  dashboard: Dashboard,
  shipments: Shipments,
  map: MapRouting,
  alerts: Alerts,
  ai: AIDecisions,
  fleet: Fleet,
  warehouses: Warehouses,
  simulator: Simulator,
  analytics: Analytics,
};

export default function App() {
  const [page, setPage] = useState('landing');
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
  };

  const navigate = (p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const PageComponent = PAGE_MAP[page] || Landing;

  return (
    <>
      <Nav current={page} onNavigate={navigate} />
      <div style={{ paddingTop: 'var(--nav-h)' }}>
        <PageComponent
          onNavigate={navigate}
          showToast={showToast}
        />
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  );
}
