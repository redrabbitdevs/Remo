/** Energy helpers: totals, cost estimates and CSV export (new in Remo). */
import type { EnergyData } from './model';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const sum = (xs: number[] | undefined) => Math.round((xs ?? []).reduce((a, b) => a + b, 0) * 10) / 10;

export function addSeries(a: number[] = [], b: number[] = []): number[] {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => Math.round(((a[i] ?? 0) + (b[i] ?? 0)) * 10) / 10);
}

export interface EnergySummary {
  today: number;
  yesterday: number;
  week: number;
  thisYear: number;
  lastYear: number;
}

export function summarize(e: EnergyData): EnergySummary {
  return {
    today: sum(addSeries(e.todayHourly?.cool, e.todayHourly?.heat)),
    yesterday: sum(addSeries(e.yesterdayHourly?.cool, e.yesterdayHourly?.heat)),
    week: sum(e.week?.total),
    thisYear: sum(e.thisYear?.total),
    lastYear: sum(e.lastYear?.total),
  };
}

/** Combine several units (the "All units" / group consumption view). */
export function combine(list: EnergyData[]): EnergyData {
  const pair = (k: 'todayHourly' | 'yesterdayHourly') => {
    const items = list.map((e) => e[k]).filter(Boolean) as { cool: number[]; heat: number[] }[];
    if (!items.length) return undefined;
    return {
      cool: items.reduce((acc, x) => addSeries(acc, x.cool), [] as number[]),
      heat: items.reduce((acc, x) => addSeries(acc, x.heat), [] as number[]),
    };
  };
  const triple = (k: 'week' | 'thisYear' | 'lastYear') => {
    const items = list.map((e) => e[k]).filter(Boolean) as { cool: number[]; heat: number[]; total: number[] }[];
    if (!items.length) return undefined;
    return {
      cool: items.reduce((acc, x) => addSeries(acc, x.cool), [] as number[]),
      heat: items.reduce((acc, x) => addSeries(acc, x.heat), [] as number[]),
      total: items.reduce((acc, x) => addSeries(acc, x.total), [] as number[]),
    };
  };
  return {
    todayHourly: pair('todayHourly'),
    yesterdayHourly: pair('yesterdayHourly'),
    week: triple('week'),
    thisYear: triple('thisYear'),
    lastYear: triple('lastYear'),
    price: list.find((e) => e.price !== undefined)?.price,
    raw: {},
  };
}

export function energyToCsv(name: string, e: EnergyData): string {
  const rows: string[] = ['unit,period,index,cool_kwh,heat_kwh,total_kwh'];
  const push = (period: string, s?: { cool: number[]; heat: number[]; total?: number[] }, label?: (i: number) => string) => {
    if (!s) return;
    const n = Math.max(s.cool.length, s.heat.length, s.total?.length ?? 0);
    for (let i = 0; i < n; i++) {
      const c = s.cool[i] ?? 0;
      const h = s.heat[i] ?? 0;
      const t = s.total?.[i] ?? Math.round((c + h) * 10) / 10;
      rows.push([csv(name), period, label ? label(i) : String(i), c, h, t].join(','));
    }
  };
  push('today', e.todayHourly, (i) => `${String(i).padStart(2, '0')}:00`);
  push('yesterday', e.yesterdayHourly, (i) => `${String(i).padStart(2, '0')}:00`);
  push('last7days', e.week, (i) => `day-${6 - i}`);
  push('this_year', e.thisYear, (i) => MONTHS[i] ?? String(i));
  push('last_year', e.lastYear, (i) => MONTHS[i] ?? String(i));
  return rows.join('\n');
}

function csv(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
