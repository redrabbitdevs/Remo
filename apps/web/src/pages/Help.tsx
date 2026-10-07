import { Card, Page, Row } from '../components/ui';
import { openExternal } from '../lib/platform';
import { useApp } from '../lib/store';

const LINKS: { title: string; url: string; region?: string }[] = [
  { title: 'Ductless Wi-Fi FAQ (Americas)', url: 'http://daikincomfort.com/DuctlessWireless/FAQ', region: 'us' },
  { title: 'D-Mobile FAQ (Thailand)', url: 'http://www.daikinthai.com/dmobile/faq.html', region: 'asia' },
  { title: 'Voice control guide (Thailand)', url: 'http://www.daikinthai.com/product/dmobile/voicecontrol', region: 'asia' },
  { title: 'App manual (Thai)', url: 'https://www.daikinthai.com/public/app_manual/ManualTH/#/', region: 'asia' },
  { title: 'App manual (Taiwan)', url: 'https://www.daikinthai.com/public/app_manual/ManualTW/#/', region: 'asia' },
  { title: 'Air purifier HEPA filter (Malaysia)', url: 'https://www.daikinmalaysia.com/MCB80Anti-bacterialHEPAFilterPurchase', region: 'asia' },
  { title: 'Daikin Online Controller & IFTTT (Europe)', url: 'http://www.daikineurope.com/daikinonlinecontroller/#IFTTT', region: 'eu' },
];

const SHORTCUTS = [
  ['g h', 'Home'],
  ['g e', 'Energy'],
  ['g s', 'Schedules'],
  ['g ,', 'Settings'],
  ['r', 'Refresh all units'],
  ['?', 'Show this help'],
];

export function Help() {
  const region = useApp((s) => s.settings.region);
  const platform = useApp((s) => s.platform);
  const sorted = [...LINKS].sort((a, b) => Number(b.region === region) - Number(a.region === region));
  return (
    <Page title="Help & about" backTo="/settings">
      <Card title="Getting started">
        <ol className="howto">
          <li>Connect your Daikin adapter to Wi-Fi (Add unit → Set up a new adapter), or use the official app once.</li>
          <li>Add the unit: Remo scans your network, or enter its IP address. BRP072C adapters ask for the 13-digit key on the sticker.</li>
          <li>Control it from the dashboard. Schedules, timers and holiday mode are stored on the adapter and keep running when Remo is closed.</li>
          <li>For remote control, enable Out-of-Home on the unit and sign in, or use a VPN to your home network with the bridge.</li>
        </ol>
      </Card>
      {platform !== 'android' && (
        <Card title="Keyboard shortcuts">
          <table className="data-table">
            <tbody>
              {SHORTCUTS.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">
                    <kbd>{k}</kbd>
                  </th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card title="Daikin support">
        {sorted.map((l) => (
          <Row key={l.url} icon="globe" title={l.title} onClick={() => openExternal(l.url)} />
        ))}
      </Card>
      <Card title="About Remo">
        <p>
          Remo {__APP_VERSION__} – an independent, open-source controller for Daikin Wi-Fi adapters (BRP069, BRP072, BRP084 and compatible), rebuilt from the
          feature set of the DAIKIN Mobile Controller app.
        </p>
        <p className="muted small">
          Not affiliated with or endorsed by Daikin Industries, Ltd. “Daikin” is a trademark of its owner. Use at your own risk; Remo talks only to your own
          adapters and, if you sign in, to the Daikin cloud. No analytics or tracking.
        </p>
      </Card>
    </Page>
  );
}
