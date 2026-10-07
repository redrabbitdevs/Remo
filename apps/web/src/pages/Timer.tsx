import { KVEditor } from '../components/KVEditor';
import { Card, Empty, Page, Row } from '../components/ui';
import { navigate } from '../lib/router';
import { getUnit, unitById } from '../lib/store';

export function Timer({ id }: { id: string }) {
  const cfg = unitById(id);
  const legacy = getUnit(id)?.legacy;
  if (!cfg) return null;
  return (
    <Page title="Timers" subtitle={cfg.name} backTo={`/unit/${id}`}>
      {!legacy ? (
        <Empty icon="clock" title="Timers are managed by the adapter's schedule">
          <p className="muted">This adapter (firmware ≥ 2.8) does not expose the classic timer API.</p>
        </Empty>
      ) : (
        <>
          <Card title="Weekly schedule">
            <Row icon="calendar" title="Schedule timer" detail="Up to 6 actions per day, 3 programs" onClick={() => navigate(`/unit/${id}/schedule`)} />
          </Card>
          <Card title="On / off timer">
            <p className="muted small">On/off timer values as stored by the adapter (times in minutes, “-” = not set).</p>
            <KVEditor
              load={() => legacy.getTimer()}
              save={(v) => legacy.setTimer(v)}
              labels={{ en_oldtimer: 'Classic timer supported', on_t: 'On timer', off_t: 'Off timer' }}
              readOnly={['en_oldtimer']}
            />
          </Card>
          <Card title="Auto-off notification">
            <KVEditor
              load={() => legacy.getNotify()}
              save={(v) => legacy.setNotify(v)}
              labels={{ auto_off_flg: 'Auto off enabled (1/0)', auto_off_tm: 'Auto off after (minutes)' }}
            />
          </Card>
          <Card title="Program (legacy)">
            <KVEditor load={() => legacy.getProgram()} save={(v) => legacy.setProgram(v)} emptyText="No legacy program stored." />
          </Card>
        </>
      )}
    </Page>
  );
}
