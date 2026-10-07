import { useEffect, useState } from 'react';
import type { Protocol } from '@remo/core';
import { Icon, UNIT_ICONS } from '../components/Icon';
import { KVEditor } from '../components/KVEditor';
import { Badge, Button, Card, Field, Page, Row, Select, Sheet, Toggle, confirm } from '../components/ui';
import { navigate } from '../lib/router';
import { errorText, getUnit, refreshUnit, removeUnit, toast, unitById, updateUnit, useApp } from '../lib/store';

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: 'legacy', label: 'HTTP (BRP069 / BRP072A)' },
  { value: 'legacy-https', label: 'HTTPS + key (BRP072C)' },
  { value: 'dsiot', label: 'JSON (BRP084 / firmware ≥ 2.8)' },
];

export function UnitSettings({ id }: { id: string }) {
  const cfg = useApp(() => unitById(id));
  const rt = useApp((s) => s.runtime[id]);
  const groups = useApp((s) => [...new Set(s.units.map((u) => u.group).filter(Boolean) as string[])]);
  const [name, setName] = useState(cfg?.name ?? '');
  const [group, setGroup] = useState(cfg?.group ?? '');
  const [host, setHost] = useState(cfg?.host ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');
  const [lockOpen, setLockOpen] = useState(false);
  const [clock, setClock] = useState<Record<string, string>>();
  const [ooh, setOoh] = useState(false);
  const legacy = getUnit(id)?.legacy;
  const info = rt?.snap?.info;

  useEffect(() => {
    legacy?.getDatetime().then(setClock).catch(() => undefined);
  }, [legacy]);

  if (!cfg) return null;
  const isDemo = cfg.host.startsWith('demo');

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(label, 'success');
      await refreshUnit(id, true);
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <Page title="Unit settings" subtitle={cfg.name} backTo={`/unit/${id}`}>
      <div className="settings-grid">
        <Card title="Identity">
          <Field label="Name" value={name} onChange={setName} hint="Saved in Remo and on the adapter, so other apps show it too." />
          <Field label="Group / room" value={group} onChange={setGroup} placeholder="e.g. Upstairs" hint={groups.length ? `Existing: ${groups.join(', ')}` : undefined} />
          <div className="icon-pick" role="radiogroup" aria-label="Icon">
            {UNIT_ICONS.map((ic, i) => (
              <button
                key={ic}
                role="radio"
                aria-checked={cfg.icon === ic}
                className={cfg.icon === ic ? 'active' : ''}
                onClick={() => {
                  updateUnit(id, { icon: ic });
                  void legacy?.setIcon(i).catch(() => undefined);
                }}
                aria-label={ic}
              >
                <Icon name={ic} />
              </button>
            ))}
          </div>
          <Button
            kind="primary"
            disabled={name === cfg.name && group === (cfg.group ?? '')}
            onClick={() =>
              run('Saved', async () => {
                updateUnit(id, { name: name.trim() || cfg.name, group: group.trim() || undefined });
                if (legacy && name !== cfg.name) await legacy.setName(name.trim());
                if (legacy && group !== (cfg.group ?? '')) await legacy.setGroup(group.trim() || undefined).catch(() => undefined);
              })
            }
          >
            Save
          </Button>
        </Card>

        <Card title="Adapter">
          <Row title="Model" detail={info?.model ?? '—'} />
          <Row title="Firmware" detail={info?.firmware ?? '—'} />
          <Row title="MAC address" detail={info?.mac ?? '—'} />
          <Row title="Wi-Fi" detail={info?.ssid ? `${info.ssid}${info.signal !== undefined ? ` · ${info.signal} dBm` : ''}` : '—'}>
            {info?.signal !== undefined && <Badge tone={info.signal > -60 ? 'good' : info.signal > -75 ? 'warn' : 'bad'}>{info.signal > -60 ? 'Strong' : info.signal > -75 ? 'Fair' : 'Weak'}</Badge>}
          </Row>
          {info?.led !== undefined && legacy && (
            <Row icon="sparkle" title="Adapter LED">
              <Toggle checked={info.led} label="Adapter LED" onChange={(v) => run(v ? 'LED on' : 'LED off', () => legacy.setLed(v))} />
            </Row>
          )}
        </Card>

        <Card title="Connection">
          <Field label="IP address / host" value={host} onChange={setHost} />
          <Select<Protocol> label="Protocol" value={cfg.protocol} options={PROTOCOLS} onChange={(p) => updateUnit(id, { protocol: p })} />
          {cfg.protocol === 'legacy-https' && (
            <>
              <Field label="Adapter key (13 digits on the sticker)" value={key} onChange={(v) => setKey(v.replace(/\D/g, '').slice(0, 13))} inputMode="numeric" />
              <Button
                icon="key"
                disabled={key.length !== 13}
                onClick={() =>
                  run('This device is now registered with the adapter', async () => {
                    updateUnit(id, { key });
                    await getUnit(id)!.legacy!.registerTerminal(key);
                  })
                }
              >
                Register this device
              </Button>
            </>
          )}
          <Button disabled={host === cfg.host || !host} onClick={() => run('Address updated', async () => updateUnit(id, { host: host.trim() }))}>
            Update address
          </Button>
        </Card>

        {legacy && (
          <>
            <Card title="Clock">
              <Row icon="clock" title="Adapter time" detail={clock?.cur ?? (clock?.sta === '0' ? 'Not set – energy data needs the clock' : '—')} />
              <Button icon="refresh" onClick={() => run('Clock synchronised', () => legacy.syncClock().then(() => legacy.getDatetime().then(setClock)))}>
                Sync with this device
              </Button>
              <Button
                onClick={() =>
                  run('Time zone saved', () => {
                    const offset = -new Date().getTimezoneOffset();
                    const jan = new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
                    const jul = new Date(new Date().getFullYear(), 6, 1).getTimezoneOffset();
                    return legacy.setTimezone(String(Math.round(offset / 60)), jan !== jul);
                  })
                }
              >
                Use this device's time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
              </Button>
            </Card>

            <Card title="Child lock">
              <p className="muted small">A lock code stops other people from operating the unit. If you forget it, the adapter must be reset. Only works In-Home.</p>
              <Row icon="lock" title="Lock code" detail={cfg.lpw ? 'Set – Remo remembers it on this device' : 'Not set'} />
              <div className="btn-row">
                <Button icon="lock" onClick={() => setLockOpen(true)}>
                  {cfg.lpw ? 'Change code' : 'Set code'}
                </Button>
                {cfg.lpw && (
                  <Button
                    kind="danger"
                    onClick={async () => {
                      if (!(await confirm('Turn off child lock?', 'The lock code will be removed from the unit.'))) return;
                      await run('Child lock removed', async () => {
                        await legacy.setLockCode('');
                        updateUnit(id, { lpw: undefined });
                      });
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </Card>

            <Card title="Out-of-Home access">
              <Row icon="cloud" title="Remote access" detail={info?.remoteMethod === 'polling' ? 'Enabled (cloud polling)' : 'In-Home only'}>
                <Toggle
                  checked={info?.remoteMethod === 'polling'}
                  label="Out-of-Home"
                  onChange={(v) => run(v ? 'Out-of-Home enabled' : 'Out-of-Home disabled', () => legacy.setRemoteMethod(v ? 'polling' : 'home only'))}
                />
              </Row>
              <Button icon="key" onClick={() => setOoh(true)}>
                Out-of-Home account…
              </Button>
              <Button kind="ghost" onClick={() => navigate('/away')}>
                Sign in to Out-of-Home
              </Button>
            </Card>

            <Card title="Network">
              <KVEditor
                load={() => legacy.getNetworkSetting()}
                labels={{ auto_ip: 'DHCP (1/0)', ipaddr: 'IP address', netmask: 'Netmask', gateway: 'Gateway', auto_dns: 'Automatic DNS (1/0)', dns1: 'DNS 1', dns2: 'DNS 2' }}
              />
              <Button icon="wifi" onClick={() => navigate(`/wifi?host=${encodeURIComponent(cfg.host)}`)}>
                Change Wi-Fi network…
              </Button>
            </Card>

            <Card title="Notifications">
              <KVEditor load={() => legacy.getPushNotice()} save={(v) => legacy.setPushNotice(v)} emptyText="No push settings on this adapter." />
            </Card>

            <Card title="Firmware">
              <KVEditor load={() => legacy.checkFirmware()} labels={{ state: 'Update state', ver: 'Available version' }} />
              <p className="muted small">Firmware updates are installed by the adapter itself. Keep the unit powered during an update.</p>
            </Card>
          </>
        )}

        <Card title="Maintenance" className="danger-zone">
          {legacy && (
            <>
              <Button
                icon="refresh"
                onClick={async () => (await confirm('Restart adapter?', 'The adapter will be unreachable for about a minute.')) && run('Adapter restarting', () => legacy.reboot())}
              >
                Restart adapter
              </Button>
              {cfg.protocol === 'legacy-https' && (
                <Button onClick={async () => (await confirm('Unregister this device?', 'This device will need the adapter key to connect again.')) && run('Unregistered', () => legacy.unregisterTerminal())}>
                  Unregister this device
                </Button>
              )}
              <Button
                kind="danger"
                icon="trash"
                onClick={async () =>
                  (await confirm('Factory reset adapter?', 'Erases the Wi-Fi settings, name, schedules and accounts on the adapter. You will need to set it up again.', { danger: true, ok: 'Reset' })) &&
                  run('Adapter reset', () => legacy.eraseDevice())
                }
              >
                Factory reset adapter
              </Button>
            </>
          )}
          <Button
            kind="danger"
            icon="trash"
            onClick={async () => {
              if (!(await confirm(`Remove ${cfg.name}?`, isDemo ? 'Hides this demo unit.' : 'Removes the unit from Remo. The adapter keeps its settings.', { danger: true, ok: 'Remove' }))) return;
              removeUnit(id);
              navigate('/');
            }}
          >
            Remove from Remo
          </Button>
        </Card>
      </div>

      <LockSheet open={lockOpen} onClose={() => setLockOpen(false)} onSave={(code) => run('Child lock set', async () => {
        await legacy!.setLockCode(code);
        updateUnit(id, { lpw: code });
        setLockOpen(false);
      })} />
      <OutOfHomeAccountSheet open={ooh} onClose={() => setOoh(false)} id={id} />
    </Page>
  );
}

function LockSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (c: string) => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const valid = /^[0-9]{4}$/.test(a) && a === b;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Child lock code"
      footer={
        <Button kind="primary" disabled={!valid} onClick={() => onSave(a)}>
          Set code
        </Button>
      }
    >
      <Field label="New 4-digit code" type="password" inputMode="numeric" value={a} onChange={(v) => setA(v.replace(/\D/g, '').slice(0, 4))} />
      <Field label="Re-enter code" type="password" inputMode="numeric" value={b} onChange={(v) => setB(v.replace(/\D/g, '').slice(0, 4))} hint={b && a !== b ? "Codes don't match" : undefined} />
    </Sheet>
  );
}

function OutOfHomeAccountSheet({ open, onClose, id }: { open: boolean; onClose: () => void; id: string }) {
  const [loginId, setLoginId] = useState('');
  const [pw, setPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const legacy = getUnit(id)?.legacy;
  return (
    <Sheet open={open} onClose={onClose} title="Out-of-Home account">
      <p className="muted small">Registers a login on the adapter for remote access through the Daikin cloud (same as the official app).</p>
      <Field label="Login ID" value={loginId} onChange={setLoginId} />
      <Field label="Password" type="password" value={pw} onChange={setPw} />
      <div className="btn-row">
        <Button
          kind="primary"
          disabled={!loginId || pw.length < 4 || !legacy}
          onClick={async () => {
            try {
              await legacy!.addOutOfHomeAccount(loginId, pw);
              toast('Account added to adapter', 'success');
            } catch (e) {
              toast(errorText(e), 'error');
            }
          }}
        >
          Create
        </Button>
      </div>
      <Field label="New password" type="password" value={newPw} onChange={setNewPw} />
      <Button
        disabled={!loginId || !pw || newPw.length < 4 || !legacy}
        onClick={async () => {
          try {
            await legacy!.changeOutOfHomePassword(loginId, pw, newPw);
            toast('Password changed', 'success');
            onClose();
          } catch (e) {
            toast(errorText(e), 'error');
          }
        }}
      >
        Change password
      </Button>
    </Sheet>
  );
}
