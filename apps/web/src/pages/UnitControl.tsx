import { useEffect } from 'react';
import { FAN_LABELS, MODE_LABELS, SPECIAL_LABELS, SWING_LABELS, type Mode, type UnitState } from '@remo/core';
import { Dial } from '../components/Dial';
import { Icon, MODE_ICONS } from '../components/Icon';
import { Badge, Button, Card, Empty, Page, Row, Segmented, Spinner, Stepper, Toggle } from '../components/ui';
import { navigate } from '../lib/router';
import { control, refreshUnit, special, unitById, useApp } from '../lib/store';
import { ERROR_HINTS, ago, dialFormat, temp } from '../lib/format';
import { PurifierControl } from './PurifierControl';

const SWING_ICON = { off: 'close', vertical: 'swing', horizontal: 'swingH', '3d': 'swing3d' } as const;

export function UnitControl({ id }: { id: string }) {
  const cfg = useApp(() => unitById(id));
  const rt = useApp((s) => s.runtime[id]);
  const unitF = useApp((s) => s.settings.tempUnit === 'F');

  useEffect(() => {
    void refreshUnit(id, Boolean(rt?.snap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!cfg) {
    return (
      <Page title="Unit" backTo="/">
        <Empty icon="info" title="Unit not found" />
      </Page>
    );
  }
  if (cfg.kind === 'cleaner') return <PurifierControl id={id} />;

  const snap = rt?.snap;
  const s = snap?.state;
  const caps = snap?.caps;

  const links = (
    <Card className="links-card">
      {caps?.schedule !== false && <Row icon="calendar" title="Schedule timer" detail="Weekly programs" onClick={() => navigate(`/unit/${id}/schedule`)} />}
      <Row icon="clock" title="Timer" detail="On / off timer" onClick={() => navigate(`/unit/${id}/timer`)} />
      <Row icon="chart" title="Energy" detail="Consumption & cost" onClick={() => navigate(`/unit/${id}/energy`)} />
      {caps?.demandControl && <Row icon="gauge" title="Power saving" detail="Demand control" onClick={() => navigate(`/unit/${id}/power-saving`)} />}
      <Row icon="settings" title="Unit settings" detail="Name, adapter, network, child lock" onClick={() => navigate(`/unit/${id}/settings`)} />
    </Card>
  );

  return (
    <Page
      title={cfg.name}
      backTo="/"
      subtitle={
        rt?.error ? (
          <span className="text-bad">{rt.error}</span>
        ) : snap ? (
          `Updated ${ago(rt?.seen)}${snap.info.model ? ` · ${snap.info.model}` : ''}`
        ) : (
          'Connecting…'
        )
      }
      actions={
        <>
          <button className="icon-btn" aria-label="Refresh" onClick={() => refreshUnit(id)}>
            {rt?.loading ? <Spinner /> : <Icon name="refresh" />}
          </button>
          <button className="icon-btn" aria-label="Unit settings" onClick={() => navigate(`/unit/${id}/settings`)}>
            <Icon name="settings" />
          </button>
        </>
      }
    >
      {!s ? (
        rt?.error ? (
          <Empty icon="wifi" title="Can't reach this unit">
            <p className="muted">{rt.error}</p>
            <p className="muted">Check that you're on the same network as the adapter{cfg.protocol === 'legacy-https' ? ' and that this device is registered with the adapter key' : ''}.</p>
            <div className="btn-row center">
              <Button kind="primary" icon="refresh" onClick={() => refreshUnit(id)}>
                Retry
              </Button>
              <Button icon="settings" onClick={() => navigate(`/unit/${id}/settings`)}>
                Connection settings
              </Button>
            </div>
          </Empty>
        ) : (
          <div className="center pad">
            <Spinner size={32} />
          </div>
        )
      ) : (
        <div className="control-layout">
          <div className="control-main">
            <Card className={`hero tone-${s.power ? s.mode : 'off'}`}>
              <div className="hero-top">
                <div>
                  <span className="muted">Power</span>
                  <strong>{s.power ? MODE_LABELS[s.mode] : 'Off'}</strong>
                </div>
                <Toggle checked={s.power} label="Power" onChange={(v) => control(id, { power: v })} />
              </div>
              <TempDial id={id} s={s} caps={caps!} />
              <div className="readings">
                <Reading icon="thermo" label="Indoor" value={temp(s.indoorTemp)} />
                {s.indoorHumidity !== undefined && <Reading icon="droplet" label="Humidity" value={`${s.indoorHumidity}%`} />}
                {caps?.outdoorTemp !== false && s.outdoorTemp !== undefined && <Reading icon="globe" label="Outdoor" value={temp(s.outdoorTemp)} />}
                {s.compressorFreq !== undefined && <Reading icon="gauge" label="Compressor" value={`${s.compressorFreq} Hz`} />}
              </div>
              {s.errorCode && (
                <div className="banner banner-bad">
                  <Icon name="info" size={18} /> Error {s.errorCode}
                  {ERROR_HINTS[s.errorCode] ? ` – ${ERROR_HINTS[s.errorCode]}` : ''}. Contact your installer if it persists.
                </div>
              )}
              {s.holiday && (
                <div className="banner">
                  <Icon name="plane" size={18} /> Holiday mode is on – schedules are paused.{' '}
                  <button className="link" onClick={() => navigate('/holiday')}>
                    Manage
                  </button>
                </div>
              )}
            </Card>

            <Card title="Mode">
              <Segmented<Mode>
                label="Operation mode"
                value={s.mode}
                options={(caps?.modes ?? []).map((m) => ({ value: m, label: MODE_LABELS[m], icon: MODE_ICONS[m] }))}
                onChange={(m) => control(id, { mode: m, power: true })}
              />
            </Card>

            {caps?.humidity && (s.mode === 'dry' || s.mode === 'heat' || s.mode === 'auto') && (
              <Card title="Humidity">
                <HumidityControl id={id} s={s} />
              </Card>
            )}
          </div>

          <div className="control-side">
            <Card title="Fan speed">
              <Segmented
                label="Fan speed"
                value={s.fanRate}
                options={(caps?.fanRates ?? []).map((f) => ({ value: f, label: f === 'auto' ? 'Auto' : f === 'silent' ? 'Quiet' : f }))}
                onChange={(f) => control(id, { fanRate: f })}
              />
              <p className="muted small">{FAN_LABELS[s.fanRate]}</p>
            </Card>
            {caps && caps.swing.length > 1 && (
              <Card title="Air flow direction">
                <Segmented
                  label="Swing"
                  value={s.swing}
                  options={caps.swing.map((w) => ({ value: w, label: SWING_LABELS[w], icon: SWING_ICON[w] }))}
                  onChange={(w) => control(id, { swing: w })}
                />
              </Card>
            )}
            {caps && caps.special.length > 0 && (
              <Card title="Special functions">
                {caps.special.map((k) => (
                  <Row key={k} icon={k === 'powerful' ? 'bolt' : k === 'econo' ? 'leaf' : k === 'streamer' ? 'sparkle' : k === 'comfort' ? 'fan' : 'moon'} title={SPECIAL_LABELS[k]} detail={SPECIAL_HINT[k]}>
                    <Toggle checked={Boolean(s.special[k])} label={SPECIAL_LABELS[k]} disabled={!s.power && k !== 'streamer'} onChange={(v) => special(id, k, v)} />
                  </Row>
                ))}
              </Card>
            )}
            {links}
          </div>
        </div>
      )}
      {unitF && <span className="sr-only">Temperatures shown in Fahrenheit</span>}
    </Page>
  );
}

const SPECIAL_HINT: Record<string, string> = {
  powerful: 'Maximum output for 20 minutes',
  econo: 'Limits power draw',
  streamer: 'Air purification',
  comfort: 'Avoids blowing directly on people',
  outdoorQuiet: 'Lowers outdoor unit noise',
};

function Reading({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="reading">
      <Icon name={icon} size={18} />
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TempDial({ id, s, caps }: { id: string; s: UnitState; caps: { tempRange: Record<'cool' | 'heat' | 'auto', [number, number]> } }) {
  const range = s.mode === 'cool' || s.mode === 'heat' || s.mode === 'auto' ? caps.tempRange[s.mode] : undefined;
  if (!range) {
    return (
      <div className="dial-placeholder">
        <Icon name={MODE_ICONS[s.mode] ?? 'fan'} size={56} />
        <p className="muted">{s.mode === 'dry' ? 'Dehumidifying – no temperature set point' : 'Fan only – no temperature set point'}</p>
      </div>
    );
  }
  return (
    <Dial
      value={s.targetTemp}
      min={range[0]}
      max={range[1]}
      step={0.5}
      tone={s.power ? s.mode : 'off'}
      caption="Set to"
      format={dialFormat}
      onCommit={(v) => control(id, { targetTemp: v })}
    />
  );
}

function HumidityControl({ id, s }: { id: string; s: UnitState }) {
  const mode = typeof s.targetHumidity === 'number' ? 'value' : (s.targetHumidity ?? 'auto');
  return (
    <>
      <Segmented
        label="Humidity mode"
        value={mode}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'value', label: 'Target' },
          { value: 'continuous', label: 'Continuous' },
        ]}
        onChange={(v) => control(id, { targetHumidity: v === 'value' ? 50 : (v as 'auto' | 'continuous') })}
      />
      {typeof s.targetHumidity === 'number' && (
        <Stepper label="Target humidity" value={s.targetHumidity} min={30} max={70} step={5} format={(v) => `${v}%`} onChange={(v) => control(id, { targetHumidity: v })} />
      )}
      <p className="muted small">
        <Badge>Tip</Badge> Humidity control is available on humidifying / dehumidifying models (e.g. Ururu Sarara).
      </p>
    </>
  );
}
