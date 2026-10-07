import { useEffect, useState } from 'react';
import { slashList } from '@remo/core';
import { BarChart } from '../components/BarChart';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, Page, Row, Segmented, Spinner, Toggle } from '../components/ui';
import { navigate } from '../lib/router';
import { errorText, getUnit, refreshUnit, toast, unitById, useApp } from '../lib/store';
import { ago } from '../lib/format';

/** Purifier "courses" and air volume as labelled in the official app (values = adapter codes). */
const COURSES = [
  { value: '0', label: 'Smart' },
  { value: '1', label: 'Econo' },
  { value: '2', label: 'Pollen' },
  { value: '3', label: 'Moist' },
  { value: '4', label: 'Circulator' },
  { value: '5', label: 'Pet' },
];
const AIRVOL = [
  { value: '0', label: 'Auto' },
  { value: '1', label: 'Quiet' },
  { value: '2', label: 'Low' },
  { value: '3', label: 'Standard' },
  { value: '5', label: 'High' },
];
const HUMID = [
  { value: '0', label: 'Off' },
  { value: '1', label: 'Low' },
  { value: '2', label: 'Standard' },
  { value: '3', label: 'High' },
  { value: '4', label: 'Auto' },
];

function level(v: number | undefined, thresholds: [number, number]) {
  if (v === undefined) return { label: '--', tone: 'neutral' as const };
  if (v <= thresholds[0]) return { label: 'Clean', tone: 'good' as const };
  if (v <= thresholds[1]) return { label: 'Moderate', tone: 'warn' as const };
  return { label: 'Poor', tone: 'bad' as const };
}

export function PurifierControl({ id }: { id: string }) {
  const cfg = unitById(id)!;
  const rt = useApp((s) => s.runtime[id]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ day?: Record<string, string>; week?: Record<string, string>; unit?: Record<string, string>; linkage?: Record<string, string> }>({});
  const [range, setRange] = useState<'day' | 'week'>('day');
  const control = (rt?.snap?.state.raw.control ?? {}) as Record<string, string>;
  const sensor = (rt?.snap?.state.raw.sensor ?? {}) as Record<string, string>;

  useEffect(() => {
    const u = getUnit(id);
    if (!u?.legacy) return;
    const l = u.legacy;
    void Promise.allSettled([l.cleanerDaySensorCount(), l.cleanerWeekSensorCount(), l.cleanerUnitInfo(), l.cleanerLinkage()]).then(([d, w, ui, lk]) =>
      setHistory({
        day: d.status === 'fulfilled' ? d.value : undefined,
        week: w.status === 'fulfilled' ? w.value : undefined,
        unit: ui.status === 'fulfilled' ? ui.value : undefined,
        linkage: lk.status === 'fulfilled' ? lk.value : undefined,
      }),
    );
  }, [id]);

  const set = async (patch: Record<string, string>) => {
    const u = getUnit(id);
    if (!u?.legacy) return;
    setBusy(true);
    try {
      const { ret: _ret, ...cur } = control;
      await u.legacy.setCleanerControl({ ...cur, ...patch });
      await refreshUnit(id, true);
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const pm = Number(sensor.pm25);
  const pmLevel = level(Number.isFinite(pm) ? pm : undefined, [12, 35]);
  const on = control.pow === '1';
  const hist = range === 'day' ? history.day : history.week;
  const labels = range === 'day' ? Array.from({ length: 24 }, (_, i) => `${i}h`) : ['-6d', '-5d', '-4d', '-3d', '-2d', 'Yest.', 'Today'];

  return (
    <Page
      title={cfg.name}
      backTo="/"
      subtitle={rt?.error ? <span className="text-bad">{rt.error}</span> : `Air purifier · updated ${ago(rt?.seen)}`}
      actions={
        <>
          <button className="icon-btn" aria-label="Refresh" onClick={() => refreshUnit(id)}>
            {rt?.loading || busy ? <Spinner /> : <Icon name="refresh" />}
          </button>
          <button className="icon-btn" aria-label="Unit settings" onClick={() => navigate(`/unit/${id}/settings`)}>
            <Icon name="settings" />
          </button>
        </>
      }
    >
      <div className="control-layout">
        <div className="control-main">
          <Card className={`hero tone-${on ? 'fan' : 'off'}`}>
            <div className="hero-top">
              <div>
                <span className="muted">Power</span>
                <strong>{on ? 'Purifying' : 'Off'}</strong>
              </div>
              <Toggle checked={on} label="Power" onChange={(v) => set({ pow: v ? '1' : '0' })} />
            </div>
            <div className="aq">
              <div className={`aq-ring tone-${pmLevel.tone}`}>
                <span className="muted">PM2.5</span>
                <strong>{Number.isFinite(pm) ? pm : '--'}</strong>
                <small>µg/m³</small>
              </div>
              <div className="readings">
                <div className="reading">
                  <Icon name="thermo" size={18} /> <span className="muted">Temperature</span>
                  <strong>{sensor.htemp ?? '--'}°</strong>
                </div>
                <div className="reading">
                  <Icon name="droplet" size={18} /> <span className="muted">Humidity</span>
                  <strong>{sensor.hhum ?? '--'}%</strong>
                </div>
                <div className="reading">
                  <Icon name="cloud" size={18} /> <span className="muted">Dust</span>
                  <strong>{sensor.dust ?? '--'}</strong>
                </div>
                <div className="reading">
                  <Icon name="sparkle" size={18} /> <span className="muted">Odour</span>
                  <strong>{sensor.odor ?? '--'}</strong>
                </div>
              </div>
            </div>
            <Badge tone={pmLevel.tone}>Air quality: {pmLevel.label}</Badge>
          </Card>
          <Card title="Course">
            <Segmented label="Course" value={control.mode} options={COURSES} onChange={(v) => set({ mode: v })} />
          </Card>
          <Card title="Air volume">
            <Segmented label="Air volume" value={control.airvol} options={AIRVOL} onChange={(v) => set({ airvol: v })} />
          </Card>
          {control.humd !== undefined && (
            <Card title="Humidify">
              <Segmented label="Humidify" value={control.humd} options={HUMID} onChange={(v) => set({ humd: v })} />
              {history.unit?.humd_tank === '0' && <p className="text-bad small">Water tank is empty.</p>}
            </Card>
          )}
        </div>
        <div className="control-side">
          <Card
            title="Air quality history"
            action={<Segmented label="Range" value={range} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} onChange={setRange} />}
          >
            <BarChart
              title="PM2.5 history"
              unit="count"
              labels={labels}
              series={[
                { name: 'PM2.5', values: slashList(hist?.pm25), className: 'bar-cool' },
                { name: 'Dust', values: slashList(hist?.dust), className: 'bar-heat' },
              ]}
            />
          </Card>
          <Card title="Functions">
            {control.uv_clean !== undefined && (
              <Row icon="sparkle" title="UV clean" detail="Sterilises the humidifier water">
                <Toggle checked={control.uv_clean === '1'} label="UV clean" onChange={(v) => set({ uv_clean: v ? '1' : '0' })} />
              </Row>
            )}
            {history.linkage && (
              <Row icon="fan" title="Air conditioner linkage" detail="Runs together with a linked air conditioner">
                <Toggle
                  checked={history.linkage.en_cjlink === '1'}
                  label="Linkage"
                  onChange={async (v) => {
                    const l = getUnit(id)?.legacy;
                    if (!l) return;
                    try {
                      await l.setCleanerLinkage({ en_cjlink: v ? '1' : '0' });
                      setHistory((h) => ({ ...h, linkage: { ...h.linkage, en_cjlink: v ? '1' : '0' } }));
                    } catch (e) {
                      toast(errorText(e), 'error');
                    }
                  }}
                />
              </Row>
            )}
            {history.unit?.filter !== undefined && (
              <Row icon="filter" title="Filter" detail={`${history.unit.filter}% remaining`}>
                {Number(history.unit.filter) < 15 ? <Badge tone="warn">Replace soon</Badge> : <Badge tone="good">OK</Badge>}
              </Row>
            )}
            <Row icon="calendar" title="Schedule timer" onClick={() => navigate(`/unit/${id}/schedule`)} />
            <Row icon="settings" title="Unit settings" onClick={() => navigate(`/unit/${id}/settings`)} />
          </Card>
          <Button icon="terminal" onClick={() => navigate(`/diagnostics?unit=${id}`)}>
            Raw values
          </Button>
        </div>
      </div>
    </Page>
  );
}
