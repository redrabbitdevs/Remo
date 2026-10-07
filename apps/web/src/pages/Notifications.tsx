import { useEffect, useState } from 'react';
import { decodeDaikinString } from '@remo/core';
import { Badge, Button, Card, Empty, Page, Row, Spinner, Toggle } from '../components/ui';
import { errorText, getCloud, getUnit, toast, updateSettings, useApp, visibleUnits } from '../lib/store';

interface Msg {
  unit: string;
  unitId: string;
  index: number;
  text: string;
  read: boolean;
}

/** Messages stored on the adapters ("news") plus cloud notification history and app alerts. */
export function Notifications() {
  const units = useApp((s) => visibleUnits(s));
  const alerts = useApp((s) => s.settings.alerts);
  const signedIn = useApp((s) => s.cloudSignedIn);
  const [msgs, setMsgs] = useState<Msg[]>();
  const [cloud, setCloud] = useState<string>();
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');

  useEffect(() => {
    void Promise.all(
      units.map(async (u) => {
        const l = getUnit(u.id)?.legacy;
        if (!l) return [] as Msg[];
        try {
          const r = await l.getMessages();
          const n = Number(r.cnt ?? 0);
          return Array.from({ length: n }, (_, i) => ({
            unit: u.name,
            unitId: u.id,
            index: i + 1,
            text: decodeDaikinString(r[`msg${i + 1}`]),
            read: r[`read${i + 1}`] === '1',
          })).filter((m) => m.text);
        } catch {
          return [] as Msg[];
        }
      }),
    ).then((all) => setMsgs(all.flat()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.length]);

  return (
    <Page title="Notifications">
      <Card title="Alerts">
        <Row icon="bell" title="Error & offline alerts" detail="Show a notification when a unit reports an error code">
          <Toggle checked={alerts} label="Alerts" onChange={(v) => updateSettings({ alerts: v })} />
        </Row>
        {perm !== 'granted' && typeof Notification !== 'undefined' && (
          <Button small onClick={async () => setPerm(await Notification.requestPermission())}>
            Allow system notifications
          </Button>
        )}
      </Card>
      <Card title="Messages from your units">
        {!msgs ? (
          <Spinner />
        ) : !msgs.length ? (
          <Empty icon="bell" title="No messages" />
        ) : (
          msgs.map((m) => (
            <Row key={`${m.unitId}-${m.index}`} icon="bell" title={m.text} detail={m.unit}>
              {m.read ? (
                <Badge>Read</Badge>
              ) : (
                <Button
                  small
                  onClick={async () => {
                    try {
                      await getUnit(m.unitId)!.legacy!.setMessageRead({ idx: String(m.index) });
                      setMsgs((list) => list?.map((x) => (x === m ? { ...x, read: true } : x)));
                    } catch (e) {
                      toast(errorText(e), 'error');
                    }
                  }}
                >
                  Mark read
                </Button>
              )}
            </Row>
          ))
        )}
      </Card>
      {signedIn && (
        <Card title="Cloud notification history">
          <Button
            small
            onClick={async () => {
              try {
                setCloud(JSON.stringify(await getCloud().notificationHistory(), null, 2));
              } catch (e) {
                toast(errorText(e), 'error');
              }
            }}
          >
            Load history
          </Button>
          {cloud && <pre className="code">{cloud}</pre>}
        </Card>
      )}
    </Page>
  );
}
