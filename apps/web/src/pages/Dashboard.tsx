import { useEffect, useMemo, useState } from 'react';
import { MODE_LABELS, type UnitConfig } from '@remo/core';
import { Icon, MODE_ICONS } from '../components/Icon';
import { Badge, Button, Empty, Page, Spinner, Toggle, confirm } from '../components/ui';
import { navigate, useRoute } from '../lib/router';
import { allOff, control, refreshAll, runScene, updateSettings, useApp, visibleUnits, type UnitRuntime } from '../lib/store';
import { ago, temp } from '../lib/format';

export function Dashboard() {
  const units = useApp((s) => visibleUnits(s));
  const runtime = useApp((s) => s.runtime);
  const scenes = useApp((s) => s.scenes);
  const settings = useApp((s) => s.settings);
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('remo.view') as 'grid' | 'list') || 'grid');
  const route = useRoute();

  useEffect(() => {
    if (route.query.get('action') === 'all-off') void allOff();
  }, [route.query]);

  const groups = useMemo(() => {
    const m = new Map<string, UnitConfig[]>();
    for (const u of units) {
      const g = u.group || 'Ungrouped';
      m.set(g, [...(m.get(g) ?? []), u]);
    }
    return [...m.entries()];
  }, [units]);

  const onCount = units.filter((u) => runtime[u.id]?.snap?.state.power).length;

  if (!units.length) {
    return (
      <Page title="Home">
        <Empty icon="home" title="No units yet">
          <p className="muted">Add a Daikin Wi-Fi adapter on your network, set up a new one, or explore Remo with demo units.</p>
          <div className="btn-row center">
            <Button kind="primary" icon="plus" onClick={() => navigate('/add')}>
              Add unit
            </Button>
            <Button icon="wifi" onClick={() => navigate('/wifi')}>
              Set up new adapter
            </Button>
            <Button icon="play" onClick={() => updateSettings({ demo: true })}>
              Try demo
            </Button>
          </div>
        </Empty>
      </Page>
    );
  }

  return (
    <Page
      title="Home"
      subtitle={`${onCount} of ${units.length} running · ${settings.location === 'home' ? 'In-Home' : 'Out-of-Home'}`}
      actions={
        <>
          <button className="icon-btn" aria-label="Refresh all" title="Refresh all (R)" onClick={() => refreshAll()}>
            <Icon name="refresh" />
          </button>
          <button
            className="icon-btn"
            aria-label={view === 'grid' ? 'List view' : 'Grid view'}
            onClick={() => {
              const v = view === 'grid' ? 'list' : 'grid';
              setView(v);
              localStorage.setItem('remo.view', v);
            }}
          >
            <Icon name={view === 'grid' ? 'list' : 'grid'} />
          </button>
          <Button
            kind="danger"
            icon="power"
            small
            onClick={async () => {
              if (!settings.confirmAllOff || (await confirm('Switch everything off?', `This turns off all ${units.length} units.`, { danger: true, ok: 'All off' }))) {
                await allOff();
              }
            }}
          >
            All off
          </Button>
        </>
      }
    >
      {scenes.length > 0 && (
        <div className="chips" aria-label="Scenes">
          {scenes.map((s) => (
            <button key={s.id} className="chip" onClick={() => runScene(s)}>
              <Icon name={s.icon} size={16} /> {s.name}
            </button>
          ))}
          <button className="chip chip-ghost" onClick={() => navigate('/scenes')}>
            <Icon name="edit" size={16} /> Edit
          </button>
        </div>
      )}
      {settings.demo && (
        <div className="banner">
          <Icon name="info" size={18} /> Demo mode – the demo units are simulated.{' '}
          <button className="link" onClick={() => updateSettings({ demo: false })}>
            Turn off
          </button>
        </div>
      )}
      {groups.map(([g, list]) => (
        <section key={g} className="group">
          <div className="group-head">
            <h2>{g}</h2>
            <span className="muted">{list.filter((u) => runtime[u.id]?.snap?.state.power).length} on</span>
            <button className="link" onClick={() => list.forEach((u) => control(u.id, { power: true }))}>
              All on
            </button>
            <button className="link" onClick={() => allOff(list.map((u) => u.id))}>
              All off
            </button>
          </div>
          <div className={view === 'grid' ? 'unit-grid' : 'unit-list'}>
            {list.map((u) => (
              <UnitCard key={u.id} unit={u} rt={runtime[u.id]} />
            ))}
          </div>
        </section>
      ))}
    </Page>
  );
}

function UnitCard({ unit, rt }: { unit: UnitConfig; rt?: UnitRuntime }) {
  const s = rt?.snap?.state;
  const on = Boolean(s?.power);
  const offline = Boolean(rt?.error) && !s;
  const stale = Boolean(rt?.error) && Boolean(s);
  const cleaner = unit.kind === 'cleaner';
  return (
    <article className={`unit-card${on ? ` on tone-${s?.mode}` : ''}${offline ? ' offline' : ''}`}>
      <button className="unit-main" onClick={() => navigate(`/unit/${unit.id}`)} aria-label={`Open ${unit.name}`}>
        <span className="unit-icon">
          <Icon name={unit.icon ?? (cleaner ? 'leaf' : 'home')} />
        </span>
        <span className="unit-name">{unit.name}</span>
        <span className="unit-status muted">
          {rt?.loading && !s ? (
            <Spinner />
          ) : offline ? (
            'Unreachable'
          ) : s ? (
            cleaner ? (
              on ? 'Purifying' : 'Off'
            ) : on ? (
              <>
                <Icon name={MODE_ICONS[s.mode] ?? 'auto'} size={14} /> {MODE_LABELS[s.mode]}
                {s.targetTemp !== undefined && ` · ${temp(s.targetTemp)}`}
              </>
            ) : (
              'Off'
            )
          ) : (
            '…'
          )}
        </span>
        <span className="unit-reading">
          {s?.indoorTemp !== undefined && (
            <span title="Room temperature">
              <Icon name="thermo" size={14} /> {temp(s.indoorTemp)}
            </span>
          )}
          {s?.indoorHumidity !== undefined && (
            <span title="Room humidity">
              <Icon name="droplet" size={14} /> {s.indoorHumidity}%
            </span>
          )}
          {s?.errorCode && <Badge tone="bad">Error {s.errorCode}</Badge>}
          {s?.holiday && <Badge tone="info">Holiday</Badge>}
          {stale && <Badge tone="warn">Offline · {ago(rt?.seen)}</Badge>}
        </span>
      </button>
      <div className="unit-power">
        <Toggle checked={on} disabled={!s} label={`${unit.name} power`} onChange={(v) => control(unit.id, { power: v })} />
      </div>
    </article>
  );
}
