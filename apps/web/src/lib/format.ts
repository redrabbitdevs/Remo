import { celsiusToFahrenheit, type Mode } from '@remo/core';
import { getState } from './store';

export function temp(c: number | undefined, withUnit = true): string {
  if (c === undefined || Number.isNaN(c)) return '--';
  const f = getState().settings.tempUnit === 'F';
  const v = f ? celsiusToFahrenheit(c) : c;
  const s = f ? String(v) : Number.isInteger(v) ? String(v) : v.toFixed(1);
  return withUnit ? `${s}°${f ? 'F' : 'C'}` : s;
}

export function dialFormat(c: number): string {
  return getState().settings.tempUnit === 'F' ? String(celsiusToFahrenheit(c)) : c.toFixed(1);
}

export function ago(ts?: number): string {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts).toLocaleString();
}

export function money(v: number): string {
  const c = getState().settings.currency;
  return `${c}${v.toFixed(2)}`;
}

export const MODE_TONE: Record<Mode, string> = { auto: 'auto', cool: 'cool', heat: 'heat', dry: 'dry', fan: 'fan' };

/** Daikin error codes shown with a short explanation (subset of the service manual). */
export const ERROR_HINTS: Record<string, string> = {
  A1: 'Indoor PCB defect',
  A5: 'Freeze-up protection / high pressure control',
  A6: 'Indoor fan motor fault',
  C4: 'Heat exchanger thermistor fault',
  C9: 'Room temperature thermistor fault',
  E1: 'Outdoor PCB defect',
  E5: 'Compressor overload (OL activation)',
  E6: 'Compressor lock',
  E7: 'Outdoor fan motor lock',
  F3: 'Discharge pipe temperature too high',
  H6: 'Compressor position sensor fault',
  L5: 'Outdoor inverter over-current',
  U0: 'Low refrigerant',
  U2: 'Supply voltage abnormal',
  U4: 'Indoor / outdoor communication error',
  UA: 'Indoor / outdoor unit mismatch',
};
