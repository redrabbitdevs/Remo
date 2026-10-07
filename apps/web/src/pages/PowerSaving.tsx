import { useEffect, useState } from 'react';
import { Badge, Button, Card, Empty, Page, Row, Segmented, Spinner, Stepper, Toggle } from '../components/ui';
import { navigate } from '../lib/router';
import { errorText, getUnit, toast, unitById, useApp, visibleUnits } from '../lib/store';
import { KVEditor } from '../components/KVEditor';

export function PowerSavingList() {
  const units = useApp((s) => visibleUnits(s).filter((u) => u.kind === 'aircon'));
  const runtime = useApp((s) => s.runtime);
  return (
    <Page title="Power saving" subtitle="Limit the maximum power draw of each unit (demand control).">
      {units.length === 0 ? (
        <Empty icon="gauge" title="No air conditioners" />
      ) : (
        <Card>
          {units.map((u) => (
            <Row
              key={u.id}
              icon="gauge"
              title={u.name}
              detail={runtime[u.id]?.snap?.caps.demandControl === false ? 'Not supported by this model' : 'Demand control'}
              onClick={() => navigate(`/unit/${u.id}/power-saving`)}
            />
          ))}
        </Card>
      )}
    </Page>
  );
}

export function PowerSaving({ id }: { id: string }) {
  const cfg = unitById(id);
  const legacy = getUnit(id)?.legacy;
  const [d, setD] = useState<Record<string, string>>();
  const [err, setErr] = useState<string>();

  useEffect(() => {
    legacy
      ?.getDemandControl()
      .then(setD)
      .catch((e) => setErr(errorText(e)));
  }, [legacy]);

  if (!cfg) return null;
  const save = async (patch: Record<string, string | number>) => {
    if (!legacy || !d) return;
    const next = { ...d, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) };
    setD(next);
    try {
      await legacy.setDemandControl({ en_demand: next.en_demand === '1' ? 1 : 0, mode: Number(next.mode ?? 0) as 0 | 1 | 2, max_pow: Number(next.max_pow ?? 100) });
      toast('Power saving updated', 'success');
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  return (
    <Page title="Power saving" subtitle={cfg.name} backTo={`/unit/${id}`}>
      {err || !legacy ? (
        <Empty icon="gauge" title="Not available">
          <p className="muted">{err ?? 'This adapter does not support demand control.'}</p>
        </Empty>
      ) : !d ? (
        <Spinner />
      ) : (
        <>
          <Card>
            <Row icon="gauge" title="Demand control" detail="Caps the power consumption of the outdoor unit">
              <Toggle checked={d.en_demand === '1'} label="Demand control" onChange={(v) => save({ en_demand: v ? 1 : 0 })} />
            </Row>
            {d.en_demand === '1' && (
              <>
                <Segmented
                  label="Demand mode"
                  value={d.mode ?? '0'}
                  options={[
                    { value: '0', label: 'Manual' },
                    { value: '1', label: 'Scheduled' },
                    { value: '2', label: 'Auto' },
                  ]}
                  onChange={(v) => save({ mode: v })}
                />
                {d.mode === '0' && (
                  <div className="center">
                    <p className="muted">Maximum power</p>
                    <Stepper label="Maximum power" value={Number(d.max_pow ?? 100)} min={40} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => save({ max_pow: v })} />
                  </div>
                )}
                {d.mode === '2' && <p className="muted small">The unit manages the limit automatically.</p>}
              </>
            )}
            <p className="muted small">
              <Badge tone="info">Note</Badge> A lower limit saves energy but may reduce comfort on very hot or cold days.
            </p>
          </Card>
          {d.mode === '1' && (
            <Card title="Demand schedule (raw)">
              <p className="muted small">Per-day limits as stored by the adapter (e.g. mo1_en, mo1_pow, mo1_tm).</p>
              <KVEditor load={() => legacy.getDemandControl()} save={(v) => legacy.setDemandControl(v)} readOnly={['type', 'demand_type']} />
            </Card>
          )}
          <Button icon="chart" onClick={() => navigate(`/unit/${id}/energy`)}>
            View energy use
          </Button>
        </>
      )}
    </Page>
  );
}
