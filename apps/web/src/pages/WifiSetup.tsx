import { useState } from 'react';
import { LegacyClient, sleep } from '@remo/core';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, Field, Page, Row, Segmented, Spinner, Toggle } from '../components/ui';
import { navigate, useRoute } from '../lib/router';
import { errorText, getState, getTransport, toast } from '../lib/store';

type Step = 'method' | 'ap' | 'network' | 'sending' | 'done' | 'wps';

/** Adapter address while it runs its own access point (all Daikin Wi-Fi adapters). */
const AP_HOST = '192.168.127.1';

export function WifiSetup() {
  const route = useRoute();
  const existing = route.query.get('host');
  const [step, setStep] = useState<Step>(existing ? 'network' : 'method');
  const [host, setHost] = useState(existing ?? AP_HOST);
  const [https, setHttps] = useState(false);
  const [testing, setTesting] = useState(false);
  const [nets, setNets] = useState<{ ssid: string; security: string; signal?: number }[]>();
  const [scanning, setScanning] = useState(false);
  const [ssid, setSsid] = useState('');
  const [security, setSecurity] = useState('mixed');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [adv, setAdv] = useState(false);
  const [ip, setIp] = useState({ ipaddr: '', netmask: '255.255.255.0', gateway: '', dns1: '', dns2: '' });
  const [proxy, setProxy] = useState({ use: false, host: '', port: '' });
  const [error, setError] = useState<string>();

  const client = () => new LegacyClient(getTransport(), { host, https, uuid: getState().uuid });

  const test = async () => {
    setTesting(true);
    setError(undefined);
    try {
      await client().basicInfo();
      setStep('network');
      void scan();
    } catch (e) {
      if (!https) {
        try {
          await new LegacyClient(getTransport(), { host, https: true, uuid: getState().uuid }).basicInfo();
          setHttps(true);
          setStep('network');
          void scan();
          return;
        } catch {
          /* report original error */
        }
      }
      setError(`${errorText(e)}. Make sure this device is connected to the adapter's Wi-Fi.`);
    } finally {
      setTesting(false);
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const c = client();
      await c.startWifiScan().catch(() => undefined);
      await sleep(3000);
      setNets(await c.wifiScanResult());
    } catch (e) {
      toast(`Scan failed: ${errorText(e)}`, 'error');
      setNets([]);
    } finally {
      setScanning(false);
    }
  };

  const send = async () => {
    setStep('sending');
    setError(undefined);
    try {
      const c = client();
      await c.setNetworkSetting({
        ssid,
        key: pw,
        security,
        autoIp: !adv || !ip.ipaddr,
        ipaddr: ip.ipaddr,
        netmask: ip.netmask,
        gateway: ip.gateway,
        autoDns: !adv || !ip.dns1,
        dns1: ip.dns1,
        dns2: ip.dns2,
        useProxy: adv && proxy.use,
        proxy: proxy.host,
        proxyPort: proxy.port,
      });
      await c.reboot().catch(() => undefined);
      setStep('done');
    } catch (e) {
      setError(errorText(e));
      setStep('network');
    }
  };

  return (
    <Page title="Wi-Fi setup" subtitle="Connect a Daikin adapter to your home network" backTo="/add">
      <ol className="steps" aria-label="Progress">
        {['Method', 'Connect', 'Network', 'Done'].map((l, i) => {
          const idx = { method: 0, wps: 1, ap: 1, network: 2, sending: 2, done: 3 }[step];
          return (
            <li key={l} className={i < idx ? 'done' : i === idx ? 'current' : ''} aria-current={i === idx ? 'step' : undefined}>
              {l}
            </li>
          );
        })}
      </ol>

      {step === 'method' && (
        <Card title="How do you want to connect?">
          <Row icon="wifi" title="Access point (recommended)" detail="Connect to the adapter's own Wi-Fi and send your network details" onClick={() => setStep('ap')} />
          <Row icon="zap" title="WPS button" detail="Press WPS on your router and on the adapter" onClick={() => setStep('wps')} />
          <Row icon="search" title="Already connected?" detail="Find the adapter on your network" onClick={() => navigate('/add')} />
        </Card>
      )}

      {step === 'wps' && (
        <Card title="WPS">
          <ol className="howto">
            <li>Make sure the indoor unit is powered.</li>
            <li>Press the <b>WPS</b> button on your router.</li>
            <li>Within 2 minutes, press the <b>MODE</b> (or WPS) button on the adapter until the <b>RUN</b> lamp blinks quickly.</li>
            <li>When the RUN lamp stays lit, the adapter is on your network.</li>
          </ol>
          <Button kind="primary" icon="search" onClick={() => navigate('/add')}>
            Find the adapter
          </Button>
        </Card>
      )}

      {step === 'ap' && (
        <Card title="Connect to the adapter">
          <ol className="howto">
            <li>
              Put the adapter in access-point mode: press the <b>MODE</b> button until the <b>AP</b> lamp lights (about 2 s).
            </li>
            <li>
              On this device, join the Wi-Fi network named like <code>DaikinAP12345</code>. The password is the <b>KEY</b> printed on the adapter sticker.
            </li>
            <li>Come back here and tap Continue.</li>
          </ol>
          <Field label="Adapter address" value={host} onChange={setHost} hint={`Default in AP mode: ${AP_HOST}`} />
          {error && <p className="text-bad">{error}</p>}
          <Button kind="primary" busy={testing} onClick={test}>
            Continue
          </Button>
        </Card>
      )}

      {step === 'network' && (
        <Card
          title="Choose your home network"
          action={
            <Button small icon="refresh" busy={scanning} onClick={scan}>
              Scan
            </Button>
          }
        >
          {scanning && !nets ? (
            <Spinner />
          ) : (
            <div className="net-list">
              {nets?.map((n) => (
                <button key={n.ssid} className={`row row-link${ssid === n.ssid ? ' selected' : ''}`} onClick={() => (setSsid(n.ssid), setSecurity(n.security))}>
                  <span className="row-icon">
                    <Icon name="wifi" size={20} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">{n.ssid}</span>
                    <span className="row-detail muted">{n.security === 'none' ? 'Open' : n.security.toUpperCase()}</span>
                  </span>
                  <span className="row-end">{n.signal !== undefined && <Badge tone={n.signal > -60 ? 'good' : n.signal > -75 ? 'warn' : 'bad'}>{n.signal} dBm</Badge>}</span>
                </button>
              ))}
            </div>
          )}
          <Field label="Network name (SSID)" value={ssid} onChange={setSsid} hint="2.4 GHz networks only – most adapters can't use 5 GHz." />
          <Segmented
            label="Security"
            value={security}
            options={[
              { value: 'mixed', label: 'WPA/WPA2' },
              { value: 'wpa2', label: 'WPA2' },
              { value: 'wep', label: 'WEP' },
              { value: 'none', label: 'Open' },
            ]}
            onChange={setSecurity}
          />
          {security !== 'none' && (
            <>
              <Field label="Wi-Fi password" type={showPw ? 'text' : 'password'} value={pw} onChange={setPw} />
              <Row title="Show password">
                <Toggle checked={showPw} label="Show password" onChange={setShowPw} />
              </Row>
            </>
          )}
          <Row title="Advanced (static IP, proxy)">
            <Toggle checked={adv} label="Advanced settings" onChange={setAdv} />
          </Row>
          {adv && (
            <div className="settings-grid">
              <Field label="IP address (blank = DHCP)" value={ip.ipaddr} onChange={(v) => setIp({ ...ip, ipaddr: v })} />
              <Field label="Netmask" value={ip.netmask} onChange={(v) => setIp({ ...ip, netmask: v })} />
              <Field label="Gateway" value={ip.gateway} onChange={(v) => setIp({ ...ip, gateway: v })} />
              <Field label="DNS 1 (blank = auto)" value={ip.dns1} onChange={(v) => setIp({ ...ip, dns1: v })} />
              <Field label="DNS 2" value={ip.dns2} onChange={(v) => setIp({ ...ip, dns2: v })} />
              <Row title="Use proxy">
                <Toggle checked={proxy.use} label="Use proxy" onChange={(v) => setProxy({ ...proxy, use: v })} />
              </Row>
              {proxy.use && (
                <>
                  <Field label="Proxy host" value={proxy.host} onChange={(v) => setProxy({ ...proxy, host: v })} />
                  <Field label="Proxy port" value={proxy.port} inputMode="numeric" onChange={(v) => setProxy({ ...proxy, port: v.replace(/\D/g, '') })} />
                </>
              )}
            </div>
          )}
          {error && <p className="text-bad">{error}</p>}
          <Button kind="primary" icon="check" disabled={!ssid || (security !== 'none' && pw.length < 5)} onClick={send}>
            Send to adapter
          </Button>
        </Card>
      )}

      {step === 'sending' && (
        <Card>
          <div className="center pad">
            <Spinner size={32} />
            <p>Sending network settings…</p>
          </div>
        </Card>
      )}

      {step === 'done' && (
        <Card title="Settings sent">
          <p>
            The adapter is now joining <b>{ssid}</b>. Its <b>RUN</b> lamp lights when connected (up to 2 minutes).
          </p>
          <p className="muted">Reconnect this device to your home Wi-Fi, then find the adapter.</p>
          <Button kind="primary" icon="search" onClick={() => navigate('/add')}>
            Find the adapter
          </Button>
        </Card>
      )}
    </Page>
  );
}
