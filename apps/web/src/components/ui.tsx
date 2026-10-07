import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { back } from '../lib/router';

export function Page({
  title,
  subtitle,
  backTo,
  actions,
  children,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  backTo?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`page${wide ? ' page-wide' : ''}`}>
      <header className="page-head">
        {backTo !== undefined && (
          <button className="icon-btn" onClick={() => back(backTo)} aria-label="Back">
            <Icon name="back" />
          </button>
        )}
        <div className="page-title">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <div className="page-actions">{actions}</div>
      </header>
      {children}
    </section>
  );
}

export function Card({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = 'secondary',
  icon,
  disabled,
  busy,
  type = 'button',
  title,
  small,
}: {
  children?: ReactNode;
  onClick?: () => void | Promise<unknown>;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  small?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const isBusy = busy || running;
  return (
    <button
      type={type}
      title={title}
      className={`btn btn-${kind}${small ? ' btn-small' : ''}`}
      disabled={disabled || isBusy}
      onClick={async () => {
        if (!onClick) return;
        const r = onClick();
        if (r instanceof Promise) {
          setRunning(true);
          try {
            await r;
          } finally {
            setRunning(false);
          }
        }
      }}
    >
      {isBusy ? <Spinner /> : icon ? <Icon name={icon} size={18} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ name, label, onClick, active }: { name: IconName; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button className={`icon-btn${active ? ' active' : ''}`} onClick={onClick} aria-label={label} title={label}>
      <Icon name={name} />
    </button>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | undefined;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={18} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Row({ icon, title, detail, children, onClick }: { icon?: IconName; title: ReactNode; detail?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      {icon && (
        <span className="row-icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {detail && <span className="row-detail muted">{detail}</span>}
      </span>
      <span className="row-end">{children ?? (onClick ? <Icon name="next" size={18} /> : null)}</span>
    </>
  );
  return onClick ? (
    <button className="row row-link" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="row">{inner}</div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  autoFocus,
  inputMode,
  min,
  max,
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: ReactNode;
  autoFocus?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'url';
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="field-hint muted">{hint}</span>}
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" role="status" />;
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <IconButton name="close" label="Close" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Imperative confirm dialog. */
let confirmResolver: ((v: boolean) => void) | undefined;
let setConfirmState: ((s: { title: string; text: string; danger?: boolean; ok?: string } | undefined) => void) | undefined;

export function confirm(title: string, text: string, opts: { danger?: boolean; ok?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    setConfirmState?.({ title, text, ...opts });
  });
}

export function ConfirmHost() {
  const [s, setS] = useState<{ title: string; text: string; danger?: boolean; ok?: string }>();
  setConfirmState = setS;
  const close = (v: boolean) => {
    setS(undefined);
    confirmResolver?.(v);
    confirmResolver = undefined;
  };
  return (
    <Sheet
      open={Boolean(s)}
      onClose={() => close(false)}
      title={s?.title ?? ''}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button kind={s?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {s?.ok ?? 'OK'}
          </Button>
        </>
      }
    >
      <p style={{ whiteSpace: 'pre-line' }}>{s?.text}</p>
    </Sheet>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, format, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} disabled={value <= min}>
        <Icon name="minus" />
      </button>
      <output aria-live="polite">{format ? format(value) : value}</output>
      <button aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} disabled={value >= max}>
        <Icon name="plus" />
      </button>
    </div>
  );
}
