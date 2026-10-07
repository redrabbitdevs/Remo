import { useEffect, useState } from 'react';
import { Icon } from './components/Icon';
import { Button, ConfirmHost } from './components/ui';
import { navigate, useRoute } from './lib/router';
import { control, getState, refreshAll, setState, updateSettings, useApp, visibleUnits } from './lib/store';
import { probeBridge } from './lib/platform';
import { Dashboard } from './pages/Dashboard';
import { UnitControl } from './pages/UnitControl';
import { Schedule, ScheduleList } from './pages/Schedule';
import { Energy } from './pages/Energy';
import { Timer } from './pages/Timer';
import { PowerSaving, PowerSavingList } from './pages/PowerSaving';
import { Holiday } from './pages/Holiday';
import { UnitSettings } from './pages/UnitSettings';
import { AddUnit } from './pages/AddUnit';
import { WifiSetup } from './pages/WifiSetup';
import { ManageUnits, Scenes } from './pages/ManageUnits';
import { OutOfHome } from './pages/OutOfHome';
import { Notifications } from './pages/Notifications';
import { Settings } from './pages/Settings';
import { Diagnostics } from './pages/Diagnostics';
import { Help } from './pages/Help';

const NAV = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/energy', label: 'Energy', icon: 'chart' },
  { path: '/schedule', label: 'Schedules', icon: 'calendar' },
  { path: '/more', label: 'More', icon: 'grid', mobileOnly: true },
  { path: '/settings', label: 'Settings', icon: 'settings' },
] as const;

const MORE = [
  { path: '/scenes', label: 'Scenes', icon: 'star' },
  { path: '/holiday', label: 'Holiday mode', icon: 'plane' },
  { path: '/power-saving', label: 'Power saving', icon: 'gauge' },
  { path: '/units', label: 'Units & groups', icon: 'edit' },
  { path: '/away', label: 'Out-of-Home', icon: 'cloud' },
  { path: '/notifications', label: 'Notifications', icon: 'bell' },
  { path: '/add', label: 'Add unit', icon: 'plus' },
] as const;

function Router() {
  const { parts } = useRoute();
  const [a, b, c] = parts;
  if (!a) return <Dashboard />;
  if (a === 'unit' && b) {
    if (c === 'schedule') return <Schedule id={b} />;
    if (c === 'energy') return <Energy id={b} />;
    if (c === 'timer') return <Timer id={b} />;
    if (c === 'settings') return <UnitSettings id={b} />;
    if (c === 'power-saving') return <PowerSaving id={b} />;
    return <UnitControl id={b} />;
  }
  switch (a) {
    case 'energy':
      return <Energy />;
    case 'schedule':
      return <ScheduleList />;
    case 'power-saving':
      return <PowerSavingList />;
    case 'holiday':
      return <Holiday />;
    case 'add':
      return <AddUnit />;
    case 'wifi':
      return <WifiSetup />;
    case 'units':
      return <ManageUnits />;
    case 'scenes':
      return <Scenes />;
    case 'away':
      return <OutOfHome />;
    case 'notifications':
      return <Notifications />;
    case 'settings':
      return <Settings />;
    case 'diagnostics':
      return <Diagnostics />;
    case 'help':
      return <Help />;
    case 'more':
      return <More />;
    default:
      return <Dashboard />;
  }
}

function More() {
  return (
    <section className="page">
      <header className="page-head">
        <div className="page-title">
          <h1>More</h1>
        </div>
      </header>
      <div className="more-grid">
        {MORE.map((m) => (
          <button key={m.path} className="more-tile" onClick={() => navigate(m.path)}>
            <Icon name={m.icon} size={26} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Welcome() {
  return (
    <div className="welcome">
      <img src="./icon.svg" alt="" width={84} height={84} />
      <h1>Welcome to Remo</h1>
      <p className="muted">Control your Daikin air conditioners and air purifiers – on the web, Windows and Android.</p>
      <div className="welcome-actions">
        <Button kind="primary" icon="search" onClick={() => (updateSettings({ onboarded: true }), navigate('/add'))}>
          Find my units
        </Button>
        <Button icon="wifi" onClick={() => (updateSettings({ onboarded: true }), navigate('/wifi'))}>
          Set up a new adapter
        </Button>
        <Button icon="play" onClick={() => (updateSettings({ onboarded: true, demo: true }), navigate('/'))}>
          Explore the demo
        </Button>
      </div>
      <p className="muted small">Remo works locally on your network. No account needed.</p>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const theme = useApp((s) => s.settings.theme);
  const poll = useApp((s) => s.settings.pollSeconds);
  const onboarded = useApp((s) => s.settings.onboarded || s.units.length > 0 || s.settings.demo);
  const toasts = useApp((s) => s.toasts);
  const platform = useApp((s) => s.platform);
  const bridgeOk = useApp((s) => s.bridgeOk);
  const unitCount = useApp((s) => visibleUnits(s).length);
  const [online, setOnline] = useState(navigator.onLine);

  // Theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  // Initial load + polling (paused while hidden to save battery)
  useEffect(() => {
    void refreshAll(true);
    if (!poll) return;
    const t = window.setInterval(() => {
      if (!document.hidden) void refreshAll(true);
    }, poll * 1000);
    const vis = () => !document.hidden && refreshAll(true);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [poll, unitCount]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    if (platform === 'web') void probeBridge(getState().settings).then((ok) => setState({ bridgeOk: ok }));
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [platform]);

  // Keyboard shortcuts (desktop / web)
  useEffect(() => {
    let prefix = false;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="slider"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (prefix) {
        prefix = false;
        const map: Record<string, string> = { h: '/', e: '/energy', s: '/schedule', ',': '/settings', u: '/units' };
        if (map[e.key]) navigate(map[e.key]!);
        return;
      }
      if (e.key === 'g') prefix = true;
      else if (e.key === 'r') void refreshAll();
      else if (e.key === '?') navigate('/help');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Windows tray integration
  useEffect(() => {
    const n = window.remoNative;
    if (!n?.onTrayAction) return;
    n.onTrayAction((action, id) => {
      if (action === 'all-off') visibleUnits().forEach((u) => control(u.id, { power: false }));
      if (action === 'toggle' && id) {
        const on = getState().runtime[id]?.snap?.state.power;
        void control(id, { power: !on });
      }
      if (action === 'open' && id) navigate(`/unit/${id}`);
    });
  }, []);
  const runtime = useApp((s) => s.runtime);
  useEffect(() => {
    window.remoNative?.setTray?.({ units: visibleUnits().map((u) => ({ id: u.id, name: u.name, on: Boolean(runtime[u.id]?.snap?.state.power) })) });
  }, [runtime]);

  if (!onboarded) return <Welcome />;
  const active = (p: string) => (p === '/' ? route.path === '/' || route.parts[0] === 'unit' : route.path.startsWith(p));

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="./icon.svg" alt="" width={32} height={32} />
          <span>Remo</span>
        </div>
        {NAV.filter((n) => !('mobileOnly' in n)).map((n) => (
          <a key={n.path} href={`#${n.path}`} className={active(n.path) ? 'active' : ''} aria-current={active(n.path) ? 'page' : undefined}>
            <Icon name={n.icon} /> {n.label}
          </a>
        ))}
        <hr />
        {MORE.map((n) => (
          <a key={n.path} href={`#${n.path}`} className={active(n.path) ? 'active' : ''}>
            <Icon name={n.icon} /> {n.label}
          </a>
        ))}
      </nav>
      <main id="main" tabIndex={-1}>
        {!online && <div className="banner banner-warn">You're offline. Local control still works if this device is on the home network.</div>}
        {platform === 'web' && bridgeOk === false && unitCount > 0 && !visibleUnits().every((u) => u.host.startsWith('demo')) && (
          <div className="banner banner-warn">
            No Remo bridge found – real units can't be reached from this browser.{' '}
            <a href="#/settings">Configure bridge</a>
          </div>
        )}
        <Router />
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className={active(n.path) || (n.path === '/more' && MORE.some((m) => active(m.path))) ? 'active' : ''}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
            {t.action && (
              <button className="link" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <ConfirmHost />
    </div>
  );
}
