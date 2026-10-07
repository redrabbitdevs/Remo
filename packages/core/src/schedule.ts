/**
 * Weekly schedule timer codec (aircon/cleaner get|set_scdltimer_body).
 *
 * Reverse engineered from the official app (dknetlib ScheduleTimer encoder). Each day key
 * (su, mo, … sa) has a count `<day>c` and entries `<day>1…<day>N`, each a fixed width string:
 *
 *   pos  len  meaning
 *   0    1    entry enabled  (1/0)
 *   1    1    power          (1 on / 0 off)
 *   2    1    mode           (legacy mode code: 0/1/7 auto, 2 dry, 3 cool, 4 heat, 6 fan)
 *   3    4    temperature    ("25.0", "----" none, "L000"/"M000"/"H000" levels)
 *   7    4    time           (HHMM)
 *   11   1    fan rate       (A, B, 3‑7 or '-')
 *   12   1    fan direction  (0‑3 or '-')
 *   13   3    humidity       ("050", "---", "A_L", "A_N", "A_H", "CNT")
 *   16   1    advanced mode  ('1' powerful, '2' econo, '-' none, '0' off)
 *   17   1    advanced flag  ('1'/'0'/'-')
 */
import { FAN_TO_LEGACY, LEGACY_TO_FAN, LEGACY_TO_MODE, LEGACY_TO_SWING, MODE_TO_LEGACY, SWING_TO_LEGACY } from './legacy';
import type { FanRate, Mode, Swing } from './model';

export const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const;
export type Day = (typeof DAYS)[number];
export const DAY_LABELS: Record<Day, string> = {
  su: 'Sunday', mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday',
};

export type Humidity = number | 'auto-low' | 'auto' | 'auto-high' | 'continuous' | undefined;

export interface ScheduleEntry {
  enabled: boolean;
  power: boolean;
  /** Minutes since midnight. */
  time: number;
  mode?: Mode;
  /** °C, or 'L' | 'M' | 'H' levels for dry mode. */
  temp?: number | 'L' | 'M' | 'H';
  fanRate?: FanRate;
  swing?: Swing;
  humidity?: Humidity;
  advanced?: 'powerful' | 'econo';
  advancedOn?: boolean;
}

export interface WeeklySchedule {
  /** Program number 1..3. */
  target: number;
  format?: 'v1' | '';
  days: Record<Day, ScheduleEntry[]>;
}

export interface ScheduleInfo {
  enabled: boolean;
  /** Active program 1..3 (0 = none). */
  activeNo: number;
  names: [string, string, string];
  perDay: number;
  raw: Record<string, string>;
}

const HUM_DECODE: Record<string, Humidity> = { '---': undefined, A_L: 'auto-low', A_N: 'auto', A_H: 'auto-high', CNT: 'continuous' };
const HUM_ENCODE = (h: Humidity): string => {
  if (h === undefined) return '---';
  if (typeof h === 'number') return String(Math.round(h)).padStart(3, '0');
  return { 'auto-low': 'A_L', auto: 'A_N', 'auto-high': 'A_H', continuous: 'CNT' }[h];
};

export function decodeEntry(s: string): ScheduleEntry | undefined {
  if (s.length < 11) return undefined;
  const tempRaw = s.slice(3, 7);
  let temp: ScheduleEntry['temp'];
  if (/^[LMH]/.test(tempRaw)) temp = tempRaw[0] as 'L' | 'M' | 'H';
  else if (!tempRaw.includes('-')) temp = Number(tempRaw);
  const time = s.slice(7, 11);
  const hh = Number(time.slice(0, 2));
  const mm = Number(time.slice(2, 4));
  const fr = s[11];
  const fd = s[12];
  const hum = s.slice(13, 16);
  const adv = s[16];
  const advFlag = s[17];
  const humidity: Humidity = hum in HUM_DECODE ? HUM_DECODE[hum] : Number.isFinite(Number(hum)) ? Number(hum) : undefined;
  return {
    enabled: s[0] === '1',
    power: s[1] === '1',
    mode: LEGACY_TO_MODE[s[2]!],
    temp,
    time: (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0),
    fanRate: fr && fr !== '-' ? LEGACY_TO_FAN[fr] : undefined,
    swing: fd && fd !== '-' ? LEGACY_TO_SWING[fd] : undefined,
    humidity,
    advanced: adv === '1' ? 'powerful' : adv === '2' ? 'econo' : undefined,
    advancedOn: advFlag === '1' ? true : advFlag === '0' ? false : undefined,
  };
}

export function encodeEntry(e: ScheduleEntry): string {
  const hh = String(Math.floor(e.time / 60) % 24).padStart(2, '0');
  const mm = String(e.time % 60).padStart(2, '0');
  let temp = '----';
  if (typeof e.temp === 'number') temp = (Math.round(e.temp * 2) / 2).toFixed(1).padStart(4, '0').slice(0, 4);
  else if (e.temp) temp = `${e.temp}000`;
  return [
    e.enabled ? '1' : '0',
    e.power ? '1' : '0',
    e.mode ? MODE_TO_LEGACY[e.mode] : '0',
    temp,
    `${hh}${mm}`,
    e.fanRate ? FAN_TO_LEGACY[e.fanRate] : '-',
    e.swing ? SWING_TO_LEGACY[e.swing] : '-',
    HUM_ENCODE(e.humidity),
    e.advanced === 'powerful' ? '1' : e.advanced === 'econo' ? '2' : '-',
    e.advancedOn === undefined ? '-' : e.advancedOn ? '1' : '0',
  ].join('');
}

export function emptyWeek(): Record<Day, ScheduleEntry[]> {
  return { su: [], mo: [], tu: [], we: [], th: [], fr: [], sa: [] };
}

export function decodeBody(kv: Record<string, string>, target = Number(kv.target ?? 1)): WeeklySchedule {
  const days = emptyWeek();
  for (const d of DAYS) {
    const count = Number(kv[`${d}c`] ?? 0);
    for (let i = 1; i <= count; i++) {
      const e = kv[`${d}${i}`] ? decodeEntry(kv[`${d}${i}`]!) : undefined;
      if (e) days[d].push(e);
    }
    days[d].sort((a, b) => a.time - b.time);
  }
  return { target, format: kv.format === 'v1' ? 'v1' : '', days };
}

export function encodeBody(s: WeeklySchedule): Record<string, string> {
  const out: Record<string, string> = { format: s.format ?? '', target: String(s.target) };
  for (const d of DAYS) {
    const list = [...s.days[d]].sort((a, b) => a.time - b.time);
    out[`${d}c`] = String(list.length);
    list.forEach((e, i) => (out[`${d}${i + 1}`] = encodeEntry(e)));
  }
  return out;
}

export function decodeInfo(kv: Record<string, string>): ScheduleInfo {
  const dec = (v?: string) => {
    if (!v) return '';
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return {
    enabled: kv.en_scdltimer !== '0',
    activeNo: Number(kv.active_no ?? 0),
    names: [dec(kv.scdl1_name) || 'Program 1', dec(kv.scdl2_name) || 'Program 2', dec(kv.scdl3_name) || 'Program 3'],
    perDay: Number(kv.scdl_per_day ?? 6),
    raw: kv,
  };
}

export function encodeInfo(info: Pick<ScheduleInfo, 'enabled' | 'activeNo' | 'names'>): Record<string, string> {
  return {
    active_no: String(info.activeNo),
    en_scdltimer: info.enabled ? '1' : '0',
    scdl1_name: info.names[0],
    scdl2_name: info.names[1],
    scdl3_name: info.names[2],
  };
}

/** Copy one day's entries to other days (the app's "Apply to week" feature). */
export function applyToDays(s: WeeklySchedule, from: Day, to: Day[]): WeeklySchedule {
  const days = { ...s.days };
  for (const d of to) days[d] = s.days[from].map((e) => ({ ...e }));
  return { ...s, days };
}

export function formatTime(minutes: number, h24 = true): string {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  if (h24) return `${String(h).padStart(2, '0')}:${m}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${suffix}`;
}
