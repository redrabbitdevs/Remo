import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Field, Page, Row, Segmented, Select, Toggle, confirm } from '../components/ui';
import { navigate } from '../lib/router';
import { downloadText, errorText, exportBackup, importBackup, setState, toast, updateSettings, useApp } from '../lib/store';
import { probeBridge } from '../lib/platform';

export function Settings() {
  const s = useApp((x) => x.settings);
  const platform = useApp((x) => x.platform);
  const uuid = useApp((x) => x.uuid);
  const bridgeOk = useApp((x) => x.bridgeOk);
  const file = useRef<HTMLInputElement>(null);
  const [autoLaunch, setAutoLaunch] = useState<boolean>();

  useEffect(() => {
    if (platform === 'web') void probeBridge(s).then((ok) => setState({ bridgeOk: ok }));
  }, [platform, s.bridgeUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page title="Settings">
      <div className="settings-grid">
        <Card title="Appearance">
          <Segmented
            label="Theme"
            value={s.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => updateSettings({ theme: v })}
          />
          <Segmented label="Temperature unit" value={s.tempUnit} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} onChange={(v) => updateSettings({ tempUnit: v })} />
          <Row title="24-hour clock">
            <Toggle checked={s.clock24} label="24-hour clock" onChange={(v) => updateSettings({ clock24: v })} />
          </Row>
          <Row title="Week starts on Monday">
            <Toggle checked={s.weekStartsMonday} label="Week starts on Monday" onChange={(v) => updateSettings({ weekStartsMonday: v })} />
          </Row>
        </Card>

        <Card title="Behaviour">
          <Select
            label="Auto-refresh"
            value={String(s.pollSeconds)}
            options={[
              { value: '0', label: 'Off' },
              { value: '10', label: 'Every 10 s' },
              { value: '15', label: 'Every 15 s' },
              { value: '30', label: 'Every 30 s' },
              { value: '60', label: 'Every minute' },
            ]}
            onChange={(v) => updateSettings({ pollSeconds: Number(v) })}
          />
          <Row title="Confirm “All off”">
            <Toggle checked={s.confirmAllOff} label="Confirm all off" onChange={(v) => updateSettings({ confirmAllOff: v })} />
          </Row>
          <Row title="Demo units" detail="Simulated units to explore every feature">
            <Toggle checked={s.demo} label="Demo units" onChange={(v) => updateSettings({ demo: v })} />
          </Row>
          <Select
            label="Region"
            value={s.region}
            options={[
              { value: 'eu', label: 'Europe' },
              { value: 'us', label: 'Americas' },
              { value: 'asia', label: 'Asia / Oceania' },
              { value: 'jp', label: 'Japan' },
              { value: 'cn', label: 'China' },
            ]}
            onChange={(v) => updateSettings({ region: v })}
          />
          {platform === 'desktop' && window.remoNative?.setAutoLaunch && (
            <Row title="Start with Windows" detail="Runs in the system tray">
              <Toggle
                checked={Boolean(autoLaunch)}
                label="Start with Windows"
                onChange={async (v) => setAutoLaunch(await window.remoNative!.setAutoLaunch!(v))}
              />
            </Row>
          )}
        </Card>

        {platform === 'web' && (
          <Card title="Bridge" action={bridgeOk === undefined ? null : bridgeOk ? <Badge tone="good">Connected</Badge> : <Badge tone="warn">Not found</Badge>}>
            <p className="muted small">Browsers can't reach Daikin adapters directly. Run the Remo bridge on a computer, Raspberry Pi or NAS in your home and open Remo from it, or enter its address here.</p>
            <Field label="Bridge URL" placeholder="http://192.168.1.10:8732 (blank = this site)" value={s.bridgeUrl} onChange={(v) => updateSettings({ bridgeUrl: v.trim() })} />
            <Field label="Bridge access token" type="password" value={s.bridgeToken} onChange={(v) => updateSettings({ bridgeToken: v.trim() })} hint="Only needed if the bridge was started with REMO_TOKEN." />
          </Card>
        )}

        <Card title="Your data">
          <div className="btn-row">
            <Button icon="download" onClick={() => downloadText(`remo-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(), 'application/json')}>
              Export backup
            </Button>
            <Button icon="upload" onClick={() => file.current?.click()}>
              Import backup
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importBackup(await f.text());
                  toast('Backup restored', 'success');
                } catch (err) {
                  toast(errorText(err), 'error');
                }
                e.target.value = '';
              }}
            />
          </div>
          <p className="muted small">Backups contain units, groups, scenes and settings – not passwords or secrets.</p>
          <Row title="Terminal ID" detail={<code>{uuid.replace(/-/g, '')}</code>} />
          <Button
            kind="danger"
            onClick={async () => {
              if (await confirm('Reset Remo?', 'Removes all units, scenes and settings from this device.', { danger: true, ok: 'Reset' })) {
                try {
                  localStorage.clear();
                } catch {
                  /* ignore */
                }
                location.reload();
              }
            }}
          >
            Reset app
          </Button>
        </Card>

        <Card title="More">
          <Row icon="terminal" title="Diagnostics" detail="Raw adapter API console" onClick={() => navigate('/diagnostics')} />
          <Row icon="help" title="Help & about" onClick={() => navigate('/help')} />
        </Card>
      </div>
    </Page>
  );
}
