import { Button, Card, Empty, Page, Row, Toggle } from '../components/ui';
import { Icon } from '../components/Icon';
import { errorText, getUnit, refreshUnit, toast, useApp, visibleUnits } from '../lib/store';

/** Holiday mode: pauses schedule timers and switches units off while you are away. */
export function Holiday() {
  const units = useApp((s) => visibleUnits(s));
  const runtime = useApp((s) => s.runtime);
  const set = async (ids: string[], on: boolean) => {
    await Promise.all(
      ids.map(async (id) => {
        const l = getUnit(id)?.legacy;
        if (!l) return;
        try {
          await l.setHoliday(on);
          await refreshUnit(id, true);
        } catch (e) {
          toast(`${errorText(e)}`, 'error');
        }
      }),
    );
  };
  const holidayOf = (id: string) => runtime[id]?.snap?.info.holiday ?? runtime[id]?.snap?.state.holiday ?? false;
  const anyOn = units.some((u) => holidayOf(u.id));
  return (
    <Page title="Holiday mode" subtitle="Turns units off and pauses their schedules until you return.">
      {!units.length ? (
        <Empty icon="plane" title="No units" />
      ) : (
        <>
          <div className={`banner${anyOn ? ' banner-info' : ''}`}>
            <Icon name="plane" size={18} /> {anyOn ? 'Holiday mode is active on some units.' : 'Holiday mode is off.'}
          </div>
          <div className="btn-row">
            <Button kind="primary" icon="plane" onClick={() => set(units.map((u) => u.id), true)}>
              Start holiday for all
            </Button>
            <Button icon="home" onClick={() => set(units.map((u) => u.id), false)}>
              I'm back – end for all
            </Button>
          </div>
          <Card>
            {units.map((u) => (
              <Row key={u.id} icon={u.icon ?? 'home'} title={u.name} detail={getUnit(u.id)?.legacy ? undefined : 'Not supported by this adapter'}>
                <Toggle checked={holidayOf(u.id)} disabled={!getUnit(u.id)?.legacy} label={`Holiday ${u.name}`} onChange={(v) => set([u.id], v)} />
              </Row>
            ))}
          </Card>
        </>
      )}
    </Page>
  );
}
