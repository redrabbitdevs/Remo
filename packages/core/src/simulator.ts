/**
 * In-memory Daikin adapter simulator speaking the legacy key=value API.
 * Powers Demo mode (try every screen without hardware) and the unit tests.
 * Hosts starting with "demo" are served by the simulator.
 */
import type { DiscoveredAdapter, HttpRequest, HttpResponse, Transport } from './transport';
import { encodeDaikinString } from './util';
import { encodeEntry } from './schedule';

const MORNING = encodeEntry({ enabled: true, power: true, mode: 'cool', temp: 26, time: 7 * 60, fanRate: 'auto', swing: 'off' });
const NIGHT = encodeEntry({ enabled: true, power: false, time: 23 * 60 });

interface SimUnit {
  basic: Record<string, string>;
  model: Record<string, string>;
  control: Record<string, string>;
  sensor: Record<string, string>;
  store: Record<string, Record<string, string>>;
  cleaner?: boolean;
  lastTick: number;
}

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function makeEnergy(seed: number, hours: number, scale: number) {
  const rnd = seeded(seed);
  return Array.from({ length: hours }, (_, h) => {
    const peak = h >= 13 && h <= 22 ? 1 : 0.25;
    return Math.round(rnd() * 6 * peak * scale);
  });
}

export function createDemoUnit(name: string, mac: string, opts: Partial<{ cleaner: boolean; humidity: boolean; seed: number }> = {}): SimUnit {
  const seed = opts.seed ?? 7;
  const basic: Record<string, string> = {
    ret: 'OK', type: opts.cleaner ? 'cj' : 'aircon', reg: 'eu', dst: '1', ver: '3_3_9', rev: 'C3FF8A6', pow: '0',
    err: '0', location: '0', name: encodeDaikinString(name), icon: '0', method: 'home only', port: '30050',
    id: '', pw: '', lpw_flag: '0', adp_kind: '3', pv: '3.20', cpv: '3', cpv_minor: '20', led: '1',
    en_setzone: '1', mac, ssid: encodeDaikinString('HomeNetwork'), adp_mode: 'run', en_hol: '0',
    ssid1: encodeDaikinString('HomeNetwork'), radio1: '-52', grp_name: '', en_grp: '0',
  };
  const model: Record<string, string> = {
    ret: 'OK', model: '0FD4', type: 'N', pv: '3.20', cpv: '3', cpv_minor: '20', mid: 'NA', humd: opts.humidity ? '1' : '0',
    s_humd: opts.humidity ? '16' : '0', acled: '0', land: '0', elec: '1', temp: '1', temp_rng: '0', m_dtct: '1',
    ac_dst: '--', disp_dry: '0', dmnd: '1', en_scdltimer: '1', en_frate: '1', en_fdir: '1', s_fdir: '3',
    en_rtemp_a: '0', en_spmode: '7', en_ipw_sep: '1', en_mompow: '1',
  };
  const control: Record<string, string> = {
    ret: 'OK', pow: '0', mode: '3', adv: '', stemp: '24.0', shum: opts.humidity ? '50' : '0',
    dt1: '25.0', dt2: 'M', dt3: '24.0', dt4: '21.0', dt5: '21.0', dt7: '25.0',
    dh1: 'AUTO', dh2: '50', dh3: '0', dh4: '0', dh5: '0', dh7: 'AUTO',
    dhh: '50', b_mode: '3', b_stemp: '24.0', b_shum: '0', alert: '255',
    f_rate: 'A', f_dir: '0', b_f_rate: 'A', b_f_dir: '0',
    dfr1: 'A', dfr2: 'A', dfr3: 'A', dfr4: 'A', dfr5: 'A', dfr6: '5', dfr7: 'A', dfrh: '5',
    dfd1: '0', dfd2: '0', dfd3: '0', dfd4: '0', dfd5: '0', dfd6: '0', dfd7: '0', dfdh: '0',
  };
  const sensor: Record<string, string> = {
    ret: 'OK', htemp: '27.5', hhum: opts.humidity ? '55' : '-', otemp: '31.0', err: '0', cmpfreq: '0', mompow: '0',
  };
  const day = (s: number) => makeEnergy(s, 24, 1).join('/');
  const months = (s: number) => makeEnergy(s, 12, 40).join('/');
  const store: SimUnit['store'] = {
    day: {
      ret: 'OK', curr_day_heat: day(seed + 1), prev_1day_heat: day(seed + 2),
      curr_day_cool: day(seed + 3), prev_1day_cool: day(seed + 4),
    },
    weekEx: { ret: 'OK', s_dayw: '3', week_heat: makeEnergy(seed + 5, 14, 3).join('/'), week_cool: makeEnergy(seed + 6, 14, 6).join('/') },
    week: { ret: 'OK', today_runtime: '120', datas: makeEnergy(seed + 7, 7, 400).join('/') },
    yearEx: {
      ret: 'OK', curr_year_heat: months(seed + 8), prev_year_heat: months(seed + 9),
      curr_year_cool: months(seed + 10), prev_year_cool: months(seed + 11),
    },
    year: { ret: 'OK', previous_year: months(seed + 12), this_year: months(seed + 13) },
    price: { ret: 'OK', price_int: '0', price_dec: '28' },
    demand: { ret: 'OK', type: '1', en_demand: '0', mode: '0', max_pow: '100', scdl_per_day: '4', moc: '0', tuc: '0', wec: '0', thc: '0', frc: '0', sac: '0', suc: '0' },
    timer: { ret: 'OK', en_oldtimer: '1', on_t: '-', off_t: '-' },
    notify: { ret: 'OK', auto_off_flg: '0', auto_off_tm: '- ' },
    pushNotice: { ret: 'OK', en_push: '1' },
    scdlInfo: { ret: 'OK', format: 'v1', f_detail: 'total#18;_en#1;_pow#1;_mode#1;_temp#4;_time#4;_vamt#1;_vdir#1;_hum#3;_adv#2', en_scdltimer: '1', active_no: '1', scdl_per_day: '6', scdl_num: '3', scdl1_name: 'Weekdays', scdl2_name: 'Weekend', scdl3_name: 'Holiday' },
    'scdl1': {
      ret: 'OK', format: 'v1', target: '1',
      moc: '2', mo1: MORNING, mo2: NIGHT, tuc: '2', tu1: MORNING, tu2: NIGHT, wec: '2', we1: MORNING, we2: NIGHT,
      thc: '2', th1: MORNING, th2: NIGHT, frc: '2', fr1: MORNING, fr2: NIGHT, sac: '0', suc: '0',
    },
    'scdl2': { ret: 'OK', format: 'v1', target: '2', moc: '0', tuc: '0', wec: '0', thc: '0', frc: '0', sac: '0', suc: '0' },
    'scdl3': { ret: 'OK', format: 'v1', target: '3', moc: '0', tuc: '0', wec: '0', thc: '0', frc: '0', sac: '0', suc: '0' },
    messages: { ret: 'OK', cnt: '1', msg1: encodeDaikinString('Welcome to Remo demo mode'), read1: '0' },
    network: { ret: 'OK', auto_ip: '1', ipaddr: '192.168.1.40', netmask: '255.255.255.0', gateway: '192.168.1.1', auto_dns: '1', dns1: '', dns2: '' },
    scan: {
      ret: 'OK', cnt: '3',
      ssid1: encodeDaikinString('HomeNetwork'), sec1: 'mixed', radio1: '-45',
      ssid2: encodeDaikinString('Neighbour_5G'), sec2: 'wpa2', radio2: '-71',
      ssid3: encodeDaikinString('Guest'), sec3: 'none', radio3: '-60',
    },
    cleanerControl: { ret: 'OK', pow: '0', mode: '1', airvol: '0', humd: '0', uv_clean: '0' },
    cleanerSensor: { ret: 'OK', htemp: '24', hhum: '48', pm25: '12', dust: '1', odor: '1' },
    cleanerDay: { ret: 'OK', pm25: makeEnergy(seed + 20, 24, 4).join('/'), dust: makeEnergy(seed + 21, 24, 1).join('/'), odor: makeEnergy(seed + 22, 24, 1).join('/') },
    cleanerWeek: { ret: 'OK', pm25: makeEnergy(seed + 23, 7, 6).join('/'), dust: makeEnergy(seed + 24, 7, 1).join('/'), odor: makeEnergy(seed + 25, 7, 1).join('/') },
    linkage: { ret: 'OK', en_cjlink: '0' },
  };
  return { basic, model, control, sensor, store, cleaner: opts.cleaner, lastTick: Date.now() };
}

export class SimulatorTransport implements Transport {
  readonly kind = 'simulator';
  readonly units = new Map<string, SimUnit>();
  /** Artificial latency so loading states are visible. */
  latencyMs = 120;

  constructor(seedDemo = true) {
    if (seedDemo) {
      this.units.set('demo-living', createDemoUnit('Living room', '0011223344A1', { seed: 7, humidity: true }));
      this.units.set('demo-bedroom', createDemoUnit('Bedroom', '0011223344A2', { seed: 21 }));
      this.units.set('demo-office', createDemoUnit('Office', '0011223344A3', { seed: 42 }));
      this.units.set('demo-purifier', createDemoUnit('Air purifier', '0011223344A4', { seed: 5, cleaner: true }));
    }
  }

  async discover(): Promise<DiscoveredAdapter[]> {
    return [...this.units.entries()].map(([ip, u]) => ({ ip, info: { ...u.basic } }));
  }

  private tick(u: SimUnit) {
    // Room temperature drifts towards the set point while running.
    const now = Date.now();
    const dt = Math.min((now - u.lastTick) / 1000, 600);
    u.lastTick = now;
    const room = Number(u.sensor.htemp);
    const target = Number(u.control.stemp);
    if (u.control.pow === '1' && Number.isFinite(target)) {
      const next = room + Math.sign(target - room) * Math.min(Math.abs(target - room), dt * 0.02);
      u.sensor.htemp = (Math.round(next * 2) / 2).toFixed(1);
      u.sensor.cmpfreq = Math.abs(target - room) > 0.4 ? '42' : '18';
    } else {
      u.sensor.cmpfreq = '0';
    }
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    const url = new URL(req.url);
    const u = this.units.get(url.hostname);
    if (!u) return { status: 404, body: 'ret=PARAM NG' };
    this.tick(u);
    const q = Object.fromEntries(url.searchParams.entries());
    const ok = (extra: Record<string, string> = {}) => ({ status: 200, body: toKV({ ret: 'OK', ...extra }) });
    const send = (r: Record<string, string>) => ({ status: 200, body: toKV(r) });
    const s = u.store;
    switch (url.pathname) {
      case '/common/basic_info':
        return send(u.basic);
      case '/aircon/get_model_info':
        return send(u.model);
      case '/aircon/get_control_info':
        return send(u.control);
      case '/aircon/set_control_info': {
        for (const k of ['pow', 'mode', 'stemp', 'shum', 'f_rate', 'f_dir']) if (q[k] !== undefined) u.control[k] = q[k]!;
        const m = u.control.mode;
        if (q.stemp) u.control[`dt${m}`] = q.stemp;
        if (q.shum) u.control[`dh${m}`] = q.shum;
        if (q.f_rate) u.control[`dfr${m}`] = q.f_rate;
        if (q.f_dir) u.control[`dfd${m}`] = q.f_dir;
        u.basic.pow = u.control.pow!;
        return ok();
      }
      case '/aircon/get_sensor_info':
        return send(u.sensor);
      case '/aircon/set_special_mode': {
        const adv = new Set((u.control.adv ?? '').split('/').filter(Boolean));
        const code = ({ '0': '13', '1': '2', '2': '12' } as Record<string, string>)[q.spmode_kind ?? ''] ?? (q.en_streamer !== undefined ? '13' : undefined);
        const on = q.set_spmode === '1' || q.en_streamer === '1';
        if (code) {
          if (on) {
            if (code === '2') adv.delete('12');
            if (code === '12') adv.delete('2');
            adv.add(code);
          } else adv.delete(code);
        }
        u.control.adv = [...adv].join('/');
        return ok({ adv: u.control.adv });
      }
      case '/aircon/get_day_power_ex': return send(s.day!);
      case '/aircon/get_week_power_ex': return send(s.weekEx!);
      case '/aircon/get_week_power': return send(s.week!);
      case '/aircon/get_year_power_ex': return send(s.yearEx!);
      case '/aircon/get_year_power': return send(s.year!);
      case '/aircon/get_price': return send(s.price!);
      case '/aircon/set_price': Object.assign(s.price!, q); return ok();
      case '/aircon/get_demand_control': return send(s.demand!);
      case '/aircon/set_demand_control': Object.assign(s.demand!, q); return ok();
      case '/aircon/get_timer': return send(s.timer!);
      case '/aircon/set_timer': Object.assign(s.timer!, q); return ok();
      case '/aircon/get_target': return ok({ target: '0' });
      case '/aircon/get_scdltimer_info':
      case '/cleaner/get_scdltimer_info':
        return send(s.scdlInfo!);
      case '/aircon/set_scdltimer_info':
      case '/cleaner/set_scdltimer_info':
        Object.assign(s.scdlInfo!, q);
        return ok();
      case '/aircon/get_scdltimer_body':
      case '/cleaner/get_scdltimer_body':
        return send(s[`scdl${q.target ?? '1'}`] ?? { ret: 'OK', target: q.target ?? '1' });
      case '/aircon/set_scdltimer_body':
      case '/cleaner/set_scdltimer_body':
        s[`scdl${q.target ?? '1'}`] = { ret: 'OK', ...q };
        return ok();
      case '/common/set_holiday': u.basic.en_hol = q.en_hol ?? '0'; return ok();
      case '/common/get_holiday': return ok({ en_hol: u.basic.en_hol! });
      case '/common/set_led': u.basic.led = q.led ?? '1'; return ok();
      case '/common/set_name': u.basic.name = encodeDaikinString(q.name ?? ''); return ok();
      case '/common/set_icon': u.basic.icon = q.icon ?? '0'; return ok();
      case '/common/get_group': return ok({ en_grp: u.basic.en_grp!, grp_name: u.basic.grp_name! });
      case '/common/set_group': u.basic.en_grp = q.en_grp ?? '0'; u.basic.grp_name = encodeDaikinString(q.grp_name ?? ''); return ok();
      case '/common/get_remote_method': return ok({ method: u.basic.method!, notice_ip_int: '3600', notice_sync_int: '60' });
      case '/common/set_remote_method': u.basic.method = q.method ?? 'home only'; return ok();
      case '/common/get_datetime': return ok({ sta: '2', cur: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      case '/common/notify_date_time':
      case '/common/set_timezone':
      case '/common/set_location':
      case '/common/reboot':
      case '/common/set_lpw':
      case '/common/register_terminal':
      case '/common/unregister_terminal':
      case '/common/start_wifi_scan':
      case '/common/start_wifi_connection':
      case '/common/permit_wifi_connection':
      case '/common/set_message_read':
      case '/common/set_account':
      case '/common/add_account_pp':
      case '/common/change_password_pp':
        return ok();
      case '/common/get_notify': return send(s.notify!);
      case '/common/set_notify': Object.assign(s.notify!, q); return ok();
      case '/common/get_push_notice': return send(s.pushNotice!);
      case '/common/set_push_notice': Object.assign(s.pushNotice!, q); return ok();
      case '/common/get_message_exist': return ok({ exist: '1' });
      case '/common/get_message': return send(s.messages!);
      case '/common/get_network_setting': return send(s.network!);
      case '/common/set_network_setting': Object.assign(s.network!, q); return ok();
      case '/common/get_wifi_scan_result': return send(s.scan!);
      case '/common/get_wifi_setting': return ok({ ssid: u.basic.ssid!, security: 'mixed', key: '', link: '1' });
      case '/common/system/fwupdate': return ok({ state: 'latest', ver: u.basic.ver! });
      case '/common/get_spw': return ok({ spw: '' });
      case '/cleaner/get_control_info': return send(s.cleanerControl!);
      case '/cleaner/set_control_info': Object.assign(s.cleanerControl!, q); return ok();
      case '/cleaner/get_sensor_info': return send(s.cleanerSensor!);
      case '/cleaner/get_model_info': return ok({ model: 'MCK70', humd: '1', uv: '1' });
      case '/cleaner/get_unit_info': return ok({ filter: '82', humd_tank: '1' });
      case '/cleaner/get_linkage_info': return send(s.linkage!);
      case '/cleaner/set_linkage_info': Object.assign(s.linkage!, q); return ok();
      case '/cleaner/get_day_snsr_count': return send(s.cleanerDay!);
      case '/cleaner/get_week_snsr_count': return send(s.cleanerWeek!);
      default:
        return { status: 404, body: 'ret=PARAM NG' };
    }
  }
}

function toKV(r: Record<string, string>): string {
  const { ret, ...rest } = r;
  return [`ret=${ret ?? 'OK'}`, ...Object.entries(rest).map(([k, v]) => `${k}=${v}`)].join(',');
}

/** Sends demo-* hosts to the simulator and everything else to the real transport. */
export class RoutingTransport implements Transport {
  readonly kind: string;
  constructor(private readonly real: Transport | undefined, readonly sim: SimulatorTransport) {
    this.kind = real ? `${real.kind}+demo` : 'demo';
  }

  request(req: HttpRequest): Promise<HttpResponse> {
    let host = '';
    try {
      host = new URL(req.url).hostname;
    } catch {
      /* ignore */
    }
    if (host.startsWith('demo') || !this.real) return this.sim.request(req);
    return this.real.request(req);
  }

  async discover(timeoutMs?: number): Promise<DiscoveredAdapter[]> {
    if (!this.real?.discover) return [];
    return this.real.discover(timeoutMs);
  }
}
