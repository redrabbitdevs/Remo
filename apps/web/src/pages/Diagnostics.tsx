import { useState } from 'react';
import { LEGACY_ENDPOINTS } from '@remo/core';
import { Button, Card, Field, Page, Select } from '../components/ui';
import { useRoute } from '../lib/router';
import { errorText, getUnit, useApp, visibleUnits } from '../lib/store';

/** Raw API console – reach every endpoint the adapter offers (new in Remo). */
export function Diagnostics() {
  const route = useRoute();
  const units = useApp((s) => visibleUnits(s));
  const runtime = useApp((s) => s.runtime);
  const [unitId, setUnitId] = useState(route.query.get('unit') ?? units[0]?.id ?? '');
  const [path, setPath] = useState('/common/basic_info');
  const [params, setParams] = useState('');
  const [out, setOut] = useState<string>();
  const unit = getUnit(unitId);
  const isDsiot = unit?.protocol === 'dsiot';
  const all = [...LEGACY_ENDPOINTS.common.map((e) => `/common/${e}`), ...LEGACY_ENDPOINTS.aircon.map((e) => `/aircon/${e}`), ...LEGACY_ENDPOINTS.cleaner.map((e) => `/cleaner/${e}`)];
  const writes = /\/(set_|reboot|erase|register|unregister|start_|permit_|add_|change_|revoke|login)/;

  return (
    <Page title="Diagnostics" subtitle="Send raw requests to an adapter. Read-only calls (get_…) are safe; set_… calls change the unit." backTo="/settings">
      <Card>
        <Select label="Unit" value={unitId} options={units.map((u) => ({ value: u.id, label: `${u.name} (${u.host}, ${u.protocol})` }))} onChange={setUnitId} />
        {isDsiot ? (
          <Field label="multireq path or JSON request array" value={path} onChange={setPath} placeholder="/dsiot/edge/adr_0100.dgc_status" />
        ) : (
          <>
            <label className="field">
              <span className="field-label">Endpoint</span>
              <input list="endpoints" value={path} onChange={(e) => setPath(e.target.value)} />
              <datalist id="endpoints">
                {all.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </label>
            <Field label="Parameters (key=value&…)" value={params} onChange={setParams} placeholder="target=1" />
          </>
        )}
        <div className="btn-row">
          <Button
            kind={writes.test(path) ? 'danger' : 'primary'}
            icon="play"
            disabled={!unit}
            onClick={async () => {
              try {
                const p = Object.fromEntries(new URLSearchParams(params));
                const r = await unit!.raw(path, p);
                setOut(JSON.stringify(r, null, 2));
              } catch (e) {
                setOut(`Error: ${errorText(e)}`);
              }
            }}
          >
            {writes.test(path) ? 'Send (changes unit)' : 'Send'}
          </Button>
          <Button onClick={() => setOut(JSON.stringify(runtime[unitId]?.snap ?? runtime[unitId], null, 2))}>Show cached state</Button>
        </div>
      </Card>
      {out && (
        <Card title="Response">
          <pre className="code" tabIndex={0}>
            {out}
          </pre>
          <Button small onClick={() => navigator.clipboard?.writeText(out)}>
            Copy
          </Button>
        </Card>
      )}
    </Page>
  );
}
