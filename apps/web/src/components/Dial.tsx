import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const START = 135; // degrees, 0 = 3 o'clock, clockwise
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/**
 * Circular set-point control. Drag, scroll, click or use arrow keys / PageUp / PageDown.
 * Changes are committed `commitDelay` ms after the last interaction so a drag sends one request.
 */
export function Dial({
  value,
  min,
  max,
  step = 0.5,
  onCommit,
  disabled,
  tone = 'cool',
  format = (v) => v.toFixed(1),
  unit = '°',
  caption,
  commitDelay = 700,
}: {
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  tone?: string;
  format?: (v: number) => string;
  unit?: string;
  caption?: string;
  commitDelay?: number;
}) {
  const [local, setLocal] = useState<number | undefined>(value);
  const timer = useRef<number>(undefined);
  const dragging = useRef(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!dragging.current && timer.current === undefined) setLocal(value);
  }, [value]);

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));

  const schedule = (v: number) => {
    setLocal(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      onCommit(v);
    }, commitDelay);
  };

  const fromPointer = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    let deg = (Math.atan2(y, x) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    let rel = deg - START;
    if (rel < 0) rel += 360;
    if (rel > SWEEP) rel = rel > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    schedule(clamp(min + (rel / SWEEP) * (max - min)));
  };

  const onKey = (e: KeyboardEvent) => {
    if (disabled || local === undefined) return;
    const big = (max - min) / 10;
    const map: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big };
    if (e.key in map) {
      e.preventDefault();
      schedule(clamp(local + map[e.key]!));
    } else if (e.key === 'Home') schedule(min);
    else if (e.key === 'End') schedule(max);
  };

  const v = local ?? min;
  const frac = local === undefined ? 0 : (v - min) / (max - min);
  const knob = polar(100, 100, 80, START + frac * SWEEP);

  return (
    <div className={`dial tone-${tone}${disabled ? ' disabled' : ''}`}>
      <svg
        ref={svg}
        viewBox="0 0 200 200"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={caption ?? 'Target temperature'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={local}
        aria-valuetext={local === undefined ? 'not set' : `${format(v)}${unit}`}
        aria-disabled={disabled}
        onKeyDown={onKey}
        onWheel={(e) => {
          if (disabled || local === undefined) return;
          schedule(clamp(v + (e.deltaY < 0 ? step : -step)));
        }}
        onPointerDown={(e) => {
          if (disabled || local === undefined) return;
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <path className="dial-track" d={arc(100, 100, 80, START, START + SWEEP)} />
        {local !== undefined && frac > 0.001 && <path className="dial-fill" d={arc(100, 100, 80, START, START + frac * SWEEP)} />}
        {local !== undefined && <circle className="dial-knob" cx={knob.x} cy={knob.y} r={11} />}
      </svg>
      <div className="dial-center" aria-hidden="true">
        {caption && <span className="dial-caption">{caption}</span>}
        <span className="dial-value">
          {local === undefined ? '--' : format(v)}
          <small>{unit}</small>
        </span>
      </div>
      <div className="dial-buttons">
        <button aria-label="Lower" disabled={disabled || local === undefined || v <= min} onClick={() => schedule(clamp(v - step))}>
          −
        </button>
        <button aria-label="Raise" disabled={disabled || local === undefined || v >= max} onClick={() => schedule(clamp(v + step))}>
          +
        </button>
      </div>
    </div>
  );
}
