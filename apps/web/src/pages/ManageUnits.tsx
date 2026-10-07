import { useState } from 'react';
import { MODE_LABELS, type Mode, type StateChange } from '@remo/core';
import { Icon, UNIT_ICONS } from '../components/Icon';
import { Button, Card, Empty, Field, Page, Row, Segmented, Select, Sheet, Stepper, Toggle, confirm } from '../components/ui';
import { navigate } from '../lib/router';
import { getState, runScene, setState, updateUnit, useApp, visibleUnits, type Scene } from '../lib/store';
import { temp } from '../lib/format';

/** Rename, regroup and reorder units (the official app's "Edit units / Edit groups"). */
export function ManageUnits() {
  const units = useApp((s) => visibleUnits(s));
  const move = (id: string, dir: -1 | 1) => {
    const list = [...units];
    const i = list.findIndex((u) => u.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    list.forEach((u, idx) => updateUnit(u.id, { order: idx }));
  };
  return (
    <Page
      title="Units & groups"
      actions={
        <Button small kind="primary" icon="plus" onClick={() => navigate('/add')}>
          Add
        </Button>
      }
    >
      {!units.length ? (
        <Empty icon="home" title="No units" />
      ) : (
        <Card>
          {units.map((u, i) => (
            <div className="manage-row" key={u.id}>
              <span className="row-icon">
                <Icon name={u.icon ?? 'home'} size={20} />
              </span>
              <div className="manage-fields">
                <input aria-label={`Name of ${u.name}`} value={u.name} onChange={(e) => updateUnit(u.id, { name: e.target.value })} />
                <input aria-label={`Group of ${u.name}`} placeholder="Group" value={u.group ?? ''} onChange={(e) => updateUnit(u.id, { group: e.target.value || undefined })} />
              </div>
              <div className="manage-actions">
                <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(u.id, -1)}>
                  <Icon name="back" style={{ transform: 'rotate(90deg)' }} />
                </button>
                <button className="icon-btn" aria-label="Move down" disabled={i === units.length - 1} onClick={() => move(u.id, 1)}>
                  <Icon name="back" style={{ transform: 'rotate(-90deg)' }} />
                </button>
                <button className="icon-btn" aria-label="Settings" onClick={() => navigate(`/unit/${u.id}/settings`)}>
                  <Icon name="settings" />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <p className="muted small">Names and groups are saved instantly. Use unit settings to also store the name on the adapter.</p>
    </Page>
  );
}

// ------------------------------------------------------------------ scenes (new)

export function Scenes() {
  const scenes = useApp((s) => s.scenes);
  const [edit, setEdit] = useState<Scene>();
  return (
    <Page
      title="Scenes"
      subtitle="One tap to set several units at once – e.g. “Good night” or “Leaving home”."
      actions={
        <Button small kind="primary" icon="plus" onClick={() => setEdit({ id: String(Date.now()), name: 'New scene', icon: 'star', actions: [] })}>
          New
        </Button>
      }
    >
      {!scenes.length ? (
        <Empty icon="star" title="No scenes yet">
          <Button
            icon="plus"
            onClick={() =>
              setEdit({
                id: String(Date.now()),
                name: 'Good night',
                icon: 'moon',
                actions: visibleUnits().filter((u) => u.kind === 'aircon').map((u) => ({ unitId: u.id, change: { power: true, mode: 'cool', targetTemp: 26, fanRate: 'silent' } })),
              })
            }
          >
            Start with “Good night”
          </Button>
        </Empty>
      ) : (
        <Card>
          {scenes.map((s) => (
            <Row key={s.id} icon={s.icon} title={s.name} detail={`${s.actions.length} unit${s.actions.length === 1 ? '' : 's'}`}>
              <div className="btn-row">
                <Button small icon="play" onClick={() => runScene(s)}>
                  Run
                </Button>
                <Button small kind="ghost" icon="edit" onClick={() => setEdit(structuredClone(s))} />
              </div>
            </Row>
          ))}
        </Card>
      )}
      {edit && <SceneSheet scene={edit} onClose={() => setEdit(undefined)} />}
    </Page>
  );
}

function SceneSheet({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const [s, setS] = useState(scene);
  const units = visibleUnits().filter((u) => u.kind === 'aircon');
  const actionFor = (id: string) => s.actions.find((a) => a.unitId === id);
  const setAction = (id: string, change: StateChange | undefined) =>
    setS((x) => ({ ...x, actions: change ? [...x.actions.filter((a) => a.unitId !== id), { unitId: id, change }] : x.actions.filter((a) => a.unitId !== id) }));
  const save = () => {
    setState((st) => ({ scenes: [...st.scenes.filter((x) => x.id !== s.id), s] }));
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit scene"
      footer={
        <>
          {getState().scenes.some((x) => x.id === s.id) && (
            <Button
              kind="danger"
              icon="trash"
              onClick={async () => {
                if (await confirm('Delete scene?', s.name, { danger: true, ok: 'Delete' })) {
                  setState((st) => ({ scenes: st.scenes.filter((x) => x.id !== s.id) }));
                  onClose();
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button kind="primary" icon="check" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name" value={s.name} onChange={(v) => setS({ ...s, name: v })} />
      <div className="icon-pick" role="radiogroup" aria-label="Icon">
        {[...UNIT_ICONS, 'power', 'plane', 'heat', 'cool'].map((ic) => (
          <button key={ic} role="radio" aria-checked={s.icon === ic} className={s.icon === ic ? 'active' : ''} onClick={() => setS({ ...s, icon: ic })} aria-label={ic}>
            <Icon name={ic} />
          </button>
        ))}
      </div>
      {units.map((u) => {
        const a = actionFor(u.id);
        return (
          <div key={u.id} className="scene-unit">
            <Row title={u.name}>
              <Toggle checked={Boolean(a)} label={`Include ${u.name}`} onChange={(v) => setAction(u.id, v ? { power: true, mode: 'cool', targetTemp: 24 } : undefined)} />
            </Row>
            {a && (
              <>
                <Segmented label="Power" value={a.change.power ? 'on' : 'off'} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} onChange={(v) => setAction(u.id, { ...a.change, power: v === 'on' })} />
                {a.change.power && (
                  <>
                    <Select<Mode> label="Mode" value={a.change.mode ?? 'cool'} options={(Object.keys(MODE_LABELS) as Mode[]).map((m) => ({ value: m, label: MODE_LABELS[m] }))} onChange={(m) => setAction(u.id, { ...a.change, mode: m })} />
                    {(a.change.mode === 'cool' || a.change.mode === 'heat' || a.change.mode === 'auto') && (
                      <Stepper label="Temperature" value={a.change.targetTemp ?? 24} min={10} max={32} step={0.5} format={(v) => temp(v)} onChange={(v) => setAction(u.id, { ...a.change, targetTemp: v })} />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}
