import { useEffect, useState } from 'react';
import {
  DAYS,
  DAY_LABELS,
  FAN_LABELS,
  MODE_LABELS,
  SWING_LABELS,
  formatTime,
  type Day,
  type FanRate,
  type Mode,
  type ScheduleEntry,
  type ScheduleInfo,
  type Swing,
  type WeeklySchedule,
} from '@remo/core';
import { Icon, MODE_ICONS } from '../components/Icon';
import { Badge, Button, Card, Empty, Field, Page, Row, Segmented, Select, Sheet, Spinner, Stepper, Toggle, confirm } from '../components/ui';
import { navigate } from '../lib/router';
import { errorText, getUnit, toast, unitById, useApp, visibleUnits } from '../lib/store';
import { temp } from '../lib/format';

export function ScheduleList() {
  const units = useApp((s) => visibleUnits(s));
  return (
    <Page title="Schedules" subtitle="Weekly programs stored on each adapter – they run even when Remo is closed.">
      {units.length === 0 ? (
        <Empty icon="calendar" title="No units" />
      ) : (
        <Card>
          {units.map((u) => (
            <Row key={u.id} icon="calendar" title={u.name} detail={u.group} onClick={() => navigate(`/unit/${u.id}/schedule`)} />
          ))}
        </Card>
      )}
    </Page>
  );
}

const newEntry = (): ScheduleEntry => ({ enabled: true, power: true, time: 7 * 60, mode: 'cool', temp: 25, fanRate: 'auto', swing: 'off' });

export function Schedule({ id }: { id: string }) {
  const cfg = unitById(id);
  const mondayFirst = useApp((s) => s.settings.weekStartsMonday);
  const clock24 = useApp((s) => s.settings.clock24);
  const [info, setInfo] = useState<ScheduleInfo>();
  const [program, setProgram] = useState(1);
  const [week, setWeek] = useState<WeeklySchedule>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [edit, setEdit] = useState<{ day: Day; index: number; entry: ScheduleEntry }>();
  const [copyFrom, setCopyFrom] = useState<Day>();
  const days: Day[] = mondayFirst ? [...DAYS.slice(1), 'su'] : [...DAYS];

  useEffect(() => {
    const u = getUnit(id);
    if (!u) return;
    u.scheduleInfo()
      .then((i) => {
        setInfo(i);
        setProgram(i.activeNo || 1);
      })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  useEffect(() => {
    const u = getUnit(id);
    if (!u || !info) return;
    setWeek(undefined);
    setDirty(false);
    u.schedule(program).then(setWeek).catch((e) => setError(errorText(e)));
  }, [id, program, info]);

  if (!cfg) return null;

  const save = async () => {
    const u = getUnit(id)!;
    try {
      await u.saveSchedule(week!);
      setDirty(false);
      toast('Schedule saved to the adapter', 'success');
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  const saveInfo = async (next: ScheduleInfo) => {
    setInfo(next);
    try {
      await getUnit(id)!.saveScheduleInfo(next);
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };

  const updateDay = (day: Day, list: ScheduleEntry[]) => {
    setWeek((w) => w && { ...w, days: { ...w.days, [day]: [...list].sort((a, b) => a.time - b.time) } });
    setDirty(true);
  };

  const perDay = info?.perDay ?? 6;

  return (
    <Page
      title="Schedule timer"
      subtitle={cfg.name}
      backTo={`/unit/${id}`}
      actions={
        <Button kind="primary" icon="check" disabled={!dirty} onClick={save}>
          Save
        </Button>
      }
    >
      {error ? (
        <Empty icon="calendar" title="Schedule unavailable">
          <p className="muted">{error}</p>
        </Empty>
      ) : !info ? (
        <div className="center pad">
          <Spinner size={28} />
        </div>
      ) : (
        <>
          <Card>
            <Row icon="calendar" title="Schedule timer" detail={info.enabled ? `Running “${info.names[(info.activeNo || 1) - 1]}”` : 'Off'}>
              <Toggle checked={info.enabled} label="Schedule enabled" onChange={(v) => saveInfo({ ...info, enabled: v, activeNo: info.activeNo || program })} />
            </Row>
            <div className="program-tabs">
              <Segmented
                label="Program"
                value={String(program)}
                options={info.names.map((n, i) => ({ value: String(i + 1), label: `${n}${info.activeNo === i + 1 ? ' ●' : ''}` }))}
                onChange={async (v) => {
                  if (dirty && !(await confirm('Discard changes?', 'You have unsaved changes in this program.'))) return;
                  setProgram(Number(v));
                }}
              />
            </div>
            <div className="btn-row">
              <Button small icon="play" disabled={info.activeNo === program && info.enabled} onClick={() => saveInfo({ ...info, activeNo: program, enabled: true })}>
                Use this program
              </Button>
              <Button
                small
                icon="edit"
                onClick={async () => {
                  const name = window.prompt('Program name', info.names[program - 1]);
                  if (name === null) return;
                  const names = [...info.names] as ScheduleInfo['names'];
                  names[program - 1] = name.slice(0, 16) || `Program ${program}`;
                  await saveInfo({ ...info, names });
                }}
              >
                Rename
              </Button>
            </div>
          </Card>
          {!week ? (
            <div className="center pad">
              <Spinner size={28} />
            </div>
          ) : (
            <div className="week">
              {days.map((d) => (
                <Card
                  key={d}
                  title={DAY_LABELS[d]}
                  action={
                    <div className="btn-row">
                      <Button small kind="ghost" icon="upload" title="Copy to other days" onClick={() => setCopyFrom(d)}>
                        Copy
                      </Button>
                      <Button small kind="ghost" icon="plus" disabled={week.days[d].length >= perDay} onClick={() => setEdit({ day: d, index: -1, entry: newEntry() })}>
                        Add
                      </Button>
                    </div>
                  }
                >
                  <Timeline entries={week.days[d]} />
                  {week.days[d].length === 0 && <p className="muted small">No actions.</p>}
                  {week.days[d].map((e, i) => (
                    <button key={i} className={`entry${e.enabled ? '' : ' disabled'}`} onClick={() => setEdit({ day: d, index: i, entry: { ...e } })}>
                      <strong>{formatTime(e.time, clock24)}</strong>
                      {e.power ? (
                        <>
                          <Badge tone="good">On</Badge>
                          {e.mode && (
                            <span>
                              <Icon name={MODE_ICONS[e.mode] ?? 'auto'} size={14} /> {MODE_LABELS[e.mode]}
                            </span>
                          )}
                          {typeof e.temp === 'number' && <span>{temp(e.temp)}</span>}
                          {e.fanRate && <span className="muted">Fan {FAN_LABELS[e.fanRate]}</span>}
                        </>
                      ) : (
                        <Badge>Off</Badge>
                      )}
                      {!e.enabled && <Badge tone="warn">Disabled</Badge>}
                    </button>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {edit && (
        <EntrySheet
          edit={edit}
          onClose={() => setEdit(undefined)}
          onSave={(entry) => {
            const list = [...week!.days[edit.day]];
            if (edit.index < 0) list.push(entry);
            else list[edit.index] = entry;
            updateDay(edit.day, list);
            setEdit(undefined);
          }}
          onDelete={
            edit.index >= 0
              ? () => {
                  updateDay(
                    edit.day,
                    week!.days[edit.day].filter((_, i) => i !== edit.index),
                  );
                  setEdit(undefined);
                }
              : undefined
          }
        />
      )}
      {copyFrom && week && (
        <CopySheet
          from={copyFrom}
          days={days}
          onClose={() => setCopyFrom(undefined)}
          onApply={(targets) => {
            setWeek({ ...week, days: { ...week.days, ...Object.fromEntries(targets.map((t) => [t, week.days[copyFrom].map((e) => ({ ...e }))])) } });
            setDirty(true);
            setCopyFrom(undefined);
          }}
        />
      )}
    </Page>
  );
}

function Timeline({ entries }: { entries: ScheduleEntry[] }) {
  // Visualise on/off periods across the day.
  const segs: { from: number; to: number; on: boolean; mode?: Mode }[] = [];
  const sorted = entries.filter((e) => e.enabled).sort((a, b) => a.time - b.time);
  sorted.forEach((e, i) => segs.push({ from: e.time, to: sorted[i + 1]?.time ?? 1440, on: e.power, mode: e.mode }));
  return (
    <div className="timeline" aria-hidden="true">
      {segs.map((s, i) => (
        <span key={i} className={`seg${s.on ? ` on tone-${s.mode ?? 'auto'}` : ''}`} style={{ left: `${(s.from / 1440) * 100}%`, width: `${((s.to - s.from) / 1440) * 100}%` }} />
      ))}
      {[6, 12, 18].map((h) => (
        <i key={h} style={{ left: `${(h / 24) * 100}%` }} />
      ))}
    </div>
  );
}

function EntrySheet({ edit, onClose, onSave, onDelete }: { edit: { day: Day; entry: ScheduleEntry }; onClose: () => void; onSave: (e: ScheduleEntry) => void; onDelete?: () => void }) {
  const [e, setE] = useState<ScheduleEntry>(edit.entry);
  const hh = String(Math.floor(e.time / 60)).padStart(2, '0');
  const mm = String(e.time % 60).padStart(2, '0');
  const patch = (p: Partial<ScheduleEntry>) => setE((x) => ({ ...x, ...p }));
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${DAY_LABELS[edit.day]} action`}
      footer={
        <>
          {onDelete && (
            <Button kind="danger" icon="trash" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button kind="primary" icon="check" onClick={() => onSave(e)}>
            Done
          </Button>
        </>
      }
    >
      <Field
        label="Time"
        type="time"
        value={`${hh}:${mm}`}
        onChange={(v) => {
          const [h, m] = v.split(':').map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) patch({ time: h! * 60 + m! });
        }}
      />
      <Row title="Action enabled">
        <Toggle checked={e.enabled} label="Enabled" onChange={(v) => patch({ enabled: v })} />
      </Row>
      <Segmented label="Power" value={e.power ? 'on' : 'off'} options={[{ value: 'on', label: 'Turn on' }, { value: 'off', label: 'Turn off' }]} onChange={(v) => patch({ power: v === 'on' })} />
      {e.power && (
        <>
          <h3 className="sub">Mode</h3>
          <Segmented<Mode>
            label="Mode"
            value={e.mode}
            options={(['auto', 'cool', 'heat', 'dry', 'fan'] as Mode[]).map((m) => ({ value: m, label: MODE_LABELS[m], icon: MODE_ICONS[m] }))}
            onChange={(m) => patch({ mode: m, temp: m === 'fan' ? undefined : m === 'dry' ? 'M' : typeof e.temp === 'number' ? e.temp : 24 })}
          />
          {(e.mode === 'cool' || e.mode === 'heat' || e.mode === 'auto') && (
            <>
              <h3 className="sub">Temperature</h3>
              <Stepper label="Temperature" value={typeof e.temp === 'number' ? e.temp : 24} min={10} max={32} step={0.5} format={(v) => temp(v)} onChange={(v) => patch({ temp: v })} />
            </>
          )}
          <Select<FanRate | ''>
            label="Fan speed"
            value={e.fanRate ?? ''}
            options={[{ value: '', label: 'Keep current' }, ...(Object.keys(FAN_LABELS) as FanRate[]).map((f) => ({ value: f, label: FAN_LABELS[f] }))]}
            onChange={(v) => patch({ fanRate: v || undefined })}
          />
          <Select<Swing | ''>
            label="Air flow direction"
            value={e.swing ?? ''}
            options={[{ value: '', label: 'Keep current' }, ...(Object.keys(SWING_LABELS) as Swing[]).map((f) => ({ value: f, label: SWING_LABELS[f] }))]}
            onChange={(v) => patch({ swing: v || undefined })}
          />
        </>
      )}
    </Sheet>
  );
}

function CopySheet({ from, days, onClose, onApply }: { from: Day; days: Day[]; onClose: () => void; onApply: (d: Day[]) => void }) {
  const [sel, setSel] = useState<Day[]>([]);
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Copy ${DAY_LABELS[from]} to…`}
      footer={
        <Button kind="primary" disabled={!sel.length} onClick={() => onApply(sel)}>
          Apply to {sel.length} day{sel.length === 1 ? '' : 's'}
        </Button>
      }
    >
      <div className="btn-row">
        <Button small onClick={() => setSel(days.filter((d) => d !== from && !['sa', 'su'].includes(d)))}>
          Weekdays
        </Button>
        <Button small onClick={() => setSel(days.filter((d) => d !== from && ['sa', 'su'].includes(d)))}>
          Weekend
        </Button>
        <Button small onClick={() => setSel(days.filter((d) => d !== from))}>
          All
        </Button>
      </div>
      {days
        .filter((d) => d !== from)
        .map((d) => (
          <Row key={d} title={DAY_LABELS[d]}>
            <Toggle checked={sel.includes(d)} label={DAY_LABELS[d]} onChange={(v) => setSel((s) => (v ? [...s, d] : s.filter((x) => x !== d)))} />
          </Row>
        ))}
    </Sheet>
  );
}
