import { useEffect, useState } from 'react';
import { LegacyClient, decodeDaikinString, detectProtocol, normalizeHost, type DiscoveredAdapter, type UnitConfig } from '@remo/core';
import { Badge, Button, Card, Field, Page, Row, Spinner } from '../components/ui';
import { navigate } from '../lib/router';
import { addUnit, errorText, getState, getTransport, toast, updateSettings, useApp } from '../lib/store';

export function AddUnit() {
  const platform = useApp((s) => s.platform);
  const known = useApp((s) => s.units);
  const [found, setFound] = useState<DiscoveredAdapter[]>();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string>();
  const [host, setHost] = useState('');
  const [key, setKey] = useState('');
  const [needsKey, setNeedsKey] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string>();

  const scan = async () => {
    setScanning(true);
    setScanError(undefined);
    try {
      const t = getTransport();
      const list = (await t.discover?.(3500)) ?? [];
      setFound(list.filter((d) => !d.ip.startsWith('demo')));
    } catch (e) {
      setScanError(errorText(e));
      setFound([]);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void scan();
  }, []);

  const add = async (rawIp: string, adapterKey?: string) => {
    const ip = normalizeHost(rawIp);
    setBusy(true);
    setAddError(undefined);
    try {
      const t = getTransport();
      const uuid = getState().uuid;
      let det = await detectProtocol(t, ip, uuid);
      if (det.needsKey) {
        if (!adapterKey) {
          setNeedsKey(ip);
          setHost(ip);
          return;
        }
        await new LegacyClient(t, { host: ip, https: true, uuid }).registerTerminal(adapterKey);
        det = await detectProtocol(t, ip, uuid);
        if (det.needsKey) throw new Error('The adapter did not accept the key.');
      }
      const b = det.basic ?? {};
      const mac = b.mac || undefined;
      if (mac && known.some((u) => u.mac === mac)) {
        toast('This unit is already added', 'info');
        return;
      }
      const cfg: UnitConfig = {
        id: mac ?? ip,
        name: decodeDaikinString(b.name) || `Daikin ${ip}`,
        host: ip,
        protocol: det.protocol,
        kind: det.kind,
        key: adapterKey,
        mac,
        group: b.en_grp === '1' ? decodeDaikinString(b.grp_name) || undefined : undefined,
      };
      addUnit(cfg);
      toast(`${cfg.name} added`, 'success');
      navigate(`/unit/${cfg.id}`);
    } catch (e) {
      setAddError(errorText(e));
      toast(`Couldn't add ${ip}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Add unit" backTo="/">
      <Card
        title="Units on this network"
        action={
          <Button small icon="refresh" busy={scanning} onClick={scan}>
            Scan
          </Button>
        }
      >
        {platform === 'web' && <p className="muted small">In a browser, discovery works through the Remo bridge. The Windows and Android apps scan directly.</p>}
        {scanning && !found ? (
          <Spinner />
        ) : found && found.length ? (
          found.map((d) => {
            const already = known.some((u) => (d.info.mac && u.mac === d.info.mac) || u.host === d.ip);
            return (
              <Row key={d.ip} icon="wifi" title={decodeDaikinString(d.info.name) || d.ip} detail={`${d.ip} · ${d.info.mac ?? ''} · fw ${d.info.ver?.replace(/_/g, '.') ?? '?'}`}>
                {already ? (
                  <Badge tone="good">Added</Badge>
                ) : (
                  <Button small kind="primary" busy={busy} onClick={() => add(d.ip)}>
                    Add
                  </Button>
                )}
              </Row>
            );
          })
        ) : (
          <p className="muted">{scanError ?? 'No adapters answered. Make sure you are on the same Wi-Fi, or add one by IP address below.'}</p>
        )}
        {found && !found.length && !scanning && platform === 'desktop' && (
          <p className="muted small">
            On Windows, discovery needs Remo to be allowed through Windows Defender Firewall on private networks (Windows asks the first time you scan). If you
            dismissed that prompt, allow “Remo” under Windows Security → Firewall &amp; network protection → Allow an app through firewall.
          </p>
        )}
      </Card>

      <Card title="Add by IP address">
        <Field label="IP address or host name" placeholder="192.168.1.50" value={host} onChange={setHost} inputMode="url" hint="Find it in your router's list of connected devices." />
        {needsKey === host && (
          <Field
            label="Adapter key"
            value={key}
            onChange={(v) => setKey(v.replace(/\D/g, '').slice(0, 13))}
            inputMode="numeric"
            autoFocus
            hint="This adapter (BRP072C) needs the 13-digit key printed on its sticker."
          />
        )}
        {addError && (
          <div className="banner banner-bad" role="alert">
            {addError}
          </div>
        )}
        <Button kind="primary" icon="plus" disabled={!host || (needsKey === host && key.length !== 13)} busy={busy} onClick={() => add(host.trim(), needsKey === host ? key : undefined)}>
          Connect
        </Button>
      </Card>

      <Card title="Other options">
        <Row icon="wifi" title="Set up a new adapter" detail="Connect an adapter to your Wi-Fi for the first time" onClick={() => navigate('/wifi')} />
        <Row icon="cloud" title="Import from Out-of-Home account" detail="Units registered in the Daikin cloud" onClick={() => navigate('/away')} />
        <Row icon="play" title="Add demo units" detail="Try Remo without hardware" onClick={() => (updateSettings({ demo: true }), navigate('/'))} />
      </Card>
    </Page>
  );
}
