import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, Field, Page, Row, Segmented } from '../components/ui';
import { addUnit, errorText, getCloud, resetCloud, setState, toast, updateSettings, useApp } from '../lib/store';
import { openExternal } from '../lib/platform';

/**
 * In-Home / Out-of-Home switch and Daikin cloud sign-in (like the official app).
 */
export function OutOfHome() {
  const settings = useApp((s) => s.settings);
  const signedIn = useApp((s) => s.cloudSignedIn);
  const [user, setUser] = useState(settings.cloudUser);
  const [pw, setPw] = useState('');
  const [gen, setGen] = useState<'gpf' | 'online'>('gpf');
  const [edges, setEdges] = useState<{ edgeId: string; name?: string }[]>();
  const [showCreds, setShowCreds] = useState(!settings.cloudClientId);

  const login = async () => {
    resetCloud();
    try {
      const c = getCloud();
      if (gen === 'gpf') await c.login(user, pw);
      else await c.loginOnlineController(user, pw);
      updateSettings({ cloudUser: user, location: 'away' });
      setState({ cloudSignedIn: true });
      setPw('');
      toast('Signed in', 'success');
      if (gen === 'gpf') setEdges(await c.listEdges().catch(() => []));
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <Page title="In-Home / Out-of-Home" subtitle="Control your units directly on your home Wi-Fi, or through the Daikin cloud when you're away.">
      <Card>
        <Segmented
          label="Location"
          value={settings.location}
          options={[
            { value: 'home', label: 'In-Home', icon: 'home' },
            { value: 'away', label: 'Out-of-Home', icon: 'cloud' },
          ]}
          onChange={(v) => updateSettings({ location: v })}
        />
        <p className="muted small">
          {settings.location === 'home'
            ? 'Remo talks to the adapters directly. Fast, private, works without internet.'
            : 'Units added from your cloud account are controlled through the Daikin cloud.'}
        </p>
      </Card>

      <Card title="Daikin cloud account" action={signedIn ? <Badge tone="good">Signed in</Badge> : <Badge>Signed out</Badge>}>
        {signedIn ? (
          <>
            <Row icon="cloud" title={settings.cloudUser} detail="Out-of-Home account" />
            <div className="btn-row">
              <Button
                icon="refresh"
                onClick={async () => {
                  try {
                    setEdges(await getCloud().listEdges());
                  } catch (e) {
                    toast(errorText(e), 'error');
                  }
                }}
              >
                Load units
              </Button>
              <Button
                kind="danger"
                onClick={async () => {
                  await getCloud().logout().catch(() => undefined);
                  setState({ cloudSignedIn: false });
                  updateSettings({ location: 'home' });
                  toast('Signed out');
                }}
              >
                Sign out
              </Button>
            </div>
            {edges && (
              <div>
                {edges.length === 0 && <p className="muted">No units in this account.</p>}
                {edges.map((e) => (
                  <Row key={e.edgeId} icon="cloud" title={e.name ?? e.edgeId}>
                    <Button
                      small
                      kind="primary"
                      onClick={() => {
                        addUnit({ id: `cloud-${e.edgeId}`, name: e.name ?? 'Cloud unit', host: 'cloud', protocol: 'dsiot', kind: 'aircon', edgeId: e.edgeId });
                        toast('Unit added', 'success');
                      }}
                    >
                      Add
                    </Button>
                  </Row>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <Segmented
              label="Account type"
              value={gen}
              options={[
                { value: 'gpf', label: 'Daikin cloud (current)' },
                { value: 'online', label: 'Online Controller (older)' },
              ]}
              onChange={setGen}
            />
            <Field label="Login ID / e-mail" value={user} onChange={setUser} />
            <Field label="Password" type="password" value={pw} onChange={setPw} />
            <Button kind="primary" icon="cloud" disabled={!user || !pw} onClick={login}>
              Sign in
            </Button>
          </>
        )}
      </Card>

      <Card
        title="Cloud API credentials"
        action={
          <button className="link" onClick={() => setShowCreds((s) => !s)}>
            {showCreds ? 'Hide' : 'Show'}
          </button>
        }
      >
        {showCreds && (
          <>
            <p className="muted small">
              <Icon name="info" size={14} /> The Daikin cloud requires an OAuth client id and secret. These belong to Daikin and are not distributed with Remo – enter credentials you are entitled to use.
            </p>
            <Field label="Client ID" value={settings.cloudClientId} onChange={(v) => (updateSettings({ cloudClientId: v.trim() }), resetCloud())} />
            <Field label="Client secret" type="password" value={settings.cloudClientSecret} onChange={(v) => (updateSettings({ cloudClientSecret: v.trim() }), resetCloud())} />
          </>
        )}
      </Card>

      <Card title="Voice assistants & IFTTT">
        <p className="muted small">Google Home, Alexa and IFTTT link to your Daikin cloud account. Linking is done in those apps.</p>
        <Row icon="globe" title="IFTTT with Daikin Online Controller" onClick={() => openExternal('http://www.daikineurope.com/daikinonlinecontroller/#IFTTT')} />
      </Card>
    </Page>
  );
}
