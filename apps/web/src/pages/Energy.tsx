import { useEffect, useState } from 'react';
import { MONTHS, addSeries, combine, energyToCsv, summarize, type EnergyData } from '@remo/core';
import { BarChart } from '../components/BarChart';
import { Button, Card, Empty, Field, Page, Row, Segmented, Sheet, Spinner } from '../components/ui';
import { navigate } from '../lib/router';
import { downloadText, errorText, getUnit, toast, unitById, updateSettings, useApp, visibleUnits } from '../lib/store';
import { money } from '../lib/format';

type Range = 'day' | 'week' | 'year';

export function Energy({ id }: { id?: string }) {
  const all = useApp((s) => visibleUnits(s).filter((u) => u.kind === 'aircon'));
  const settings = useApp((s) => s.settings);
  const targets = id ? all.filter((u) => u.id === id) : all;
  const [data, setData] = useState<Record<string, EnergyData | string>>({});
  const [range, setRange] = useState<Range>('day');
  const [priceOpen, setPriceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const key = targets.map((t) => t.id).join(',');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all(
      targets.map(async (t) => {
        try {
          return [t.id, await getUnit(t.id)!.energy()] as const;
        } catch (e) {
          return [t.id, errorText(e)] as const;
        }
      }),
    ).then((entries) => {
      if (!alive) return;
      setData(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ok = Object.values(data).filter((d): d is EnergyData => typeof d !== 'string');
  const merged = combine(ok);
  const sum = summarize(merged);
  const price = (id && typeof data[id] !== 'string' ? (data[id] as EnergyData | undefined)?.price : undefined) || settings.price;
  const title = id ? `Energy · ${unitById(id)?.name ?? ''}` : 'Energy';

  let chart: { labels: string[]; cool: number[]; heat: number[]; compare?: { name: string; values: number[] } } | undefined;
  if (range === 'day' && merged.todayHourly) {
    chart = {
      labels: Array.from({ length: 24 }, (_, i) => String(i)),
      cool: merged.todayHourly.cool,
      heat: merged.todayHourly.heat,
      compare: merged.yesterdayHourly ? { name: 'Yesterday', values: addSeries(merged.yesterdayHourly.cool, merged.yesterdayHourly.heat) } : undefined,
    };
  } else if (range === 'week' && merged.week) {
    const today = new Date();
    chart = {
      labels: merged.week.total.map((_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (merged.week!.total.length - 1 - i));
        return d.toLocaleDateString(undefined, { weekday: 'short' });
      }),
      cool: merged.week.cool.some(Boolean) ? merged.week.cool : merged.week.total,
      heat: merged.week.cool.some(Boolean) ? merged.week.heat : merged.week.total.map(() => 0),
    };
  } else if (range === 'year' && merged.thisYear) {
    chart = {
      labels: MONTHS,
      cool: merged.thisYear.cool.some(Boolean) ? merged.thisYear.cool : merged.thisYear.total,
      heat: merged.thisYear.cool.some(Boolean) ? merged.thisYear.heat : merged.thisYear.total.map(() => 0),
      compare: merged.lastYear ? { name: 'Last year', values: merged.lastYear.total } : undefined,
    };
  }

  return (
    <Page
      title={title}
      backTo={id ? `/unit/${id}` : undefined}
      subtitle="Measured by the indoor unit; values are estimates."
      actions={
        <>
          <Button small icon="settings" onClick={() => setPriceOpen(true)}>
            Price
          </Button>
          <Button
            small
            icon="download"
            disabled={!ok.length}
            onClick={() => {
              const csv = targets
                .map((t) => (typeof data[t.id] === 'string' || !data[t.id] ? '' : energyToCsv(t.name, data[t.id] as EnergyData)))
                .filter(Boolean)
                .map((c, i) => (i === 0 ? c : c.split('\n').slice(1).join('\n')))
                .join('\n');
              downloadText(`remo-energy-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
            }}
          >
            CSV
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="center pad">
          <Spinner size={28} />
        </div>
      ) : !ok.length ? (
        <Empty icon="chart" title="No energy data">
          <p className="muted">{targets.length ? 'These units do not report energy consumption, or are unreachable.' : 'Add an air conditioner first.'}</p>
        </Empty>
      ) : (
        <>
          <div className="stats">
            <Stat label="Today" kwh={sum.today} price={price} />
            <Stat label="Yesterday" kwh={sum.yesterday} price={price} />
            <Stat label="Last 7 days" kwh={sum.week} price={price} />
            <Stat label="This year" kwh={sum.thisYear} price={price} delta={sum.lastYear ? sum.thisYear - sum.lastYear : undefined} />
          </div>
          <Card
            title="Consumption"
            action={
              <Segmented<Range>
                label="Period"
                value={range}
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'year', label: 'Year' },
                ]}
                onChange={setRange}
              />
            }
          >
            {chart ? (
              <BarChart
                title={`Energy consumption by ${range === 'day' ? 'hour' : range === 'week' ? 'day' : 'month'}`}
                labels={chart.labels}
                series={[
                  { name: 'Cooling', values: chart.cool, className: 'bar-cool' },
                  { name: 'Heating', values: chart.heat, className: 'bar-heat' },
                ]}
                compare={chart.compare}
              />
            ) : (
              <p className="muted">Not reported for this period.</p>
            )}
          </Card>
          {!id && targets.length > 1 && (
            <Card title="By unit">
              {targets.map((t) => {
                const d = data[t.id];
                const s = d && typeof d !== 'string' ? summarize(d) : undefined;
                return (
                  <Row key={t.id} title={t.name} detail={typeof d === 'string' ? d : `Today ${s?.today ?? 0} kWh · 7 days ${s?.week ?? 0} kWh`} onClick={() => navigate(`/unit/${t.id}/energy`)}>
                    {s && <strong>{money(s.week * price)}</strong>}
                  </Row>
                );
              })}
            </Card>
          )}
        </>
      )}
      <PriceSheet open={priceOpen} onClose={() => setPriceOpen(false)} unitId={id} current={price} currency={settings.currency} onSaved={(p, c) => updateSettings({ price: p, currency: c })} />
    </Page>
  );
}

function Stat({ label, kwh, price, delta }: { label: string; kwh: number; price: number; delta?: number }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>
        {kwh.toFixed(1)} <small>kWh</small>
      </strong>
      <span className="muted">≈ {money(kwh * price)}</span>
      {delta !== undefined && (
        <span className={delta > 0 ? 'text-bad small' : 'text-good small'}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} kWh vs last year
        </span>
      )}
    </div>
  );
}

function PriceSheet({ open, onClose, unitId, current, currency, onSaved }: { open: boolean; onClose: () => void; unitId?: string; current: number; currency: string; onSaved: (p: number, c: string) => void }) {
  const [p, setP] = useState(String(current));
  const [c, setC] = useState(currency);
  useEffect(() => {
    setP(String(current));
    setC(currency);
  }, [current, currency, open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Electricity price"
      footer={
        <Button
          kind="primary"
          onClick={async () => {
            const v = Number(p.replace(',', '.'));
            if (!Number.isFinite(v) || v < 0 || v > 99) {
              toast('Enter a valid price', 'error');
              return;
            }
            onSaved(v, c);
            const units = unitId ? [unitId] : visibleUnits().filter((u) => u.kind === 'aircon').map((u) => u.id);
            await Promise.allSettled(units.map((id) => getUnit(id)?.legacy?.setPrice(v)));
            toast('Price saved', 'success');
            onClose();
          }}
        >
          Save
        </Button>
      }
    >
      <Field label="Price per kWh" value={p} onChange={setP} inputMode="decimal" />
      <Field label="Currency symbol" value={c} onChange={(v) => setC(v.slice(0, 3))} />
      <p className="muted small">Stored on the adapter (like the official app) and used for cost estimates.</p>
    </Sheet>
  );
}
