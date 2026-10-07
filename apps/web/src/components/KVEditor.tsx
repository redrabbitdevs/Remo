import { useEffect, useState } from 'react';
import { Button, Field, Spinner } from './ui';
import { errorText, toast } from '../lib/store';

/**
 * Generic editor for adapter settings that are plain key=value lists. Used for rarely
 * used/model specific endpoints so that every feature of the official app stays reachable.
 */
export function KVEditor({
  load,
  save,
  labels = {},
  readOnly = [],
  hidden = ['ret'],
  emptyText = 'Nothing reported by this adapter.',
}: {
  load: () => Promise<Record<string, string>>;
  save?: (values: Record<string, string>) => Promise<unknown>;
  labels?: Record<string, string>;
  readOnly?: string[];
  hidden?: string[];
  emptyText?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>();
  const [error, setError] = useState<string>();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    load()
      .then((v) => setValues(v))
      .catch((e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="muted">{error}</p>;
  if (!values) return <Spinner />;
  const keys = Object.keys(values).filter((k) => !hidden.includes(k));
  if (!keys.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="kv">
      {keys.map((k) =>
        save && !readOnly.includes(k) ? (
          <Field
            key={k}
            label={labels[k] ?? k}
            value={values[k] ?? ''}
            onChange={(v) => {
              setValues({ ...values, [k]: v });
              setDirty(true);
            }}
          />
        ) : (
          <div key={k} className="kv-row">
            <span className="muted">{labels[k] ?? k}</span>
            <code>{values[k]}</code>
          </div>
        ),
      )}
      {save && (
        <Button
          kind="primary"
          disabled={!dirty}
          onClick={async () => {
            try {
              const out = Object.fromEntries(Object.entries(values).filter(([k]) => !hidden.includes(k) && !readOnly.includes(k)));
              await save(out);
              setDirty(false);
              toast('Saved', 'success');
            } catch (e) {
              toast(errorText(e), 'error');
            }
          }}
        >
          Save
        </Button>
      )}
    </div>
  );
}
