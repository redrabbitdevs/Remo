/**
 * Client for the classic Daikin adapter API (BRP069Axx/Bxx, BRP072A/C, BRP15B…).
 *
 * Every endpoint used by the official "DAIKIN Mobile Controller" app (v4.11.2) is exposed
 * here, either as a typed helper or through `call()`, so no feature is lost.
 */
import { TransportError, type Transport } from './transport';
import { buildQuery, decodeDaikinString, encodeDaikinString, parseKV, slashList, toNumber } from './util';
import type {
  AdapterInfo,
  Capabilities,
  EnergyData,
  FanRate,
  Mode,
  SpecialMode,
  StateChange,
  Swing,
  UnitState,
} from './model';
import { DEFAULT_CAPABILITIES } from './model';

/** All endpoints found in the decompiled official app. */
export const LEGACY_ENDPOINTS = {
  common: [
    'basic_info', 'get_remote_method', 'set_remote_method', 'get_holiday', 'set_holiday',
    'get_notify', 'set_notify', 'get_push_notice', 'set_push_notice', 'get_group', 'set_group',
    'get_network_setting', 'set_network_setting', 'get_wifi_setting', 'start_wifi_scan',
    'get_wifi_scan_result', 'start_wifi_connection', 'permit_wifi_connection', 'get_datetime',
    'notify_date_time', 'set_timezone', 'set_name', 'set_icon', 'set_led', 'set_location', 'set_lpw',
    'register_terminal', 'unregister_terminal', 'get_message', 'get_message_exist', 'set_message_read',
    'get_progsum', 'port_assign', 'port_assign_acc', 'get_spw', 'add_account_pp', 'change_password_pp',
    'set_account', 'create_onetime_key_ex', 'device_list', 'device_list_all', 'device_list_intime',
    'look_adapter', 'stop_look_adapter', 'reboot', 'erase_device', 'system/fwupdate', 'login', 'revoke',
  ],
  aircon: [
    'get_control_info', 'set_control_info', 'get_sensor_info', 'get_model_info', 'set_special_mode',
    'get_timer', 'set_timer', 'get_program', 'set_program', 'get_target', 'set_target', 'get_price',
    'set_price', 'get_demand_control', 'set_demand_control', 'get_scdltimer', 'set_scdltimer',
    'get_scdltimer_info', 'set_scdltimer_info', 'get_scdltimer_body', 'set_scdltimer_body',
    'get_day_power_ex', 'get_week_power', 'get_week_power_ex', 'get_year_power', 'get_year_power_ex',
  ],
  cleaner: [
    'get_control_info', 'set_control_info', 'get_sensor_info', 'get_model_info', 'get_unit_info',
    'get_linkage_info', 'set_linkage_info', 'get_scdltimer_info', 'set_scdltimer_info',
    'get_scdltimer_body', 'set_scdltimer_body', 'get_day_snsr_count', 'get_week_snsr_count',
  ],
} as const;

export const MODE_TO_LEGACY: Record<Mode, string> = { auto: '0', dry: '2', cool: '3', heat: '4', fan: '6' };
export const LEGACY_TO_MODE: Record<string, Mode> = {
  '0': 'auto', '1': 'auto', '7': 'auto', '2': 'dry', '3': 'cool', '4': 'heat', '6': 'fan',
};
export const FAN_TO_LEGACY: Record<FanRate, string> = {
  auto: 'A', silent: 'B', '1': '3', '2': '4', '3': '5', '4': '6', '5': '7',
};
export const LEGACY_TO_FAN: Record<string, FanRate> = {
  A: 'auto', B: 'silent', '3': '1', '4': '2', '5': '3', '6': '4', '7': '5',
};
export const SWING_TO_LEGACY: Record<Swing, string> = { off: '0', vertical: '1', horizontal: '2', '3d': '3' };
export const LEGACY_TO_SWING: Record<string, Swing> = { '0': 'off', '1': 'vertical', '2': 'horizontal', '3': '3d' };
export const SPECIAL_KIND: Partial<Record<SpecialMode, string>> = { streamer: '0', powerful: '1', econo: '2' };

export interface LegacyOptions {
  host: string;
  https?: boolean;
  /** Terminal UUID without dashes; sent as X-Daikin-uuid. */
  uuid?: string;
  lpw?: string;
  timeoutMs?: number;
}

export class DaikinApiError extends Error {
  constructor(public readonly ret: string, public readonly path: string) {
    super(`${path}: adapter answered ret=${ret}`);
    this.name = 'DaikinApiError';
  }
}

export class LegacyClient {
  constructor(private readonly transport: Transport, private readonly opts: LegacyOptions) {}

  get baseUrl(): string {
    return `${this.opts.https ? 'https' : 'http'}://${this.opts.host}`;
  }

  /** Generic call: GET /<path>?<params>, returns parsed key/value pairs. */
  async call(
    path: string,
    params: Record<string, string | number | undefined> = {},
    { raw = [] as string[], allowNg = false } = {},
  ): Promise<Record<string, string>> {
    const p = path.startsWith('/') ? path : `/${path}`;
    const all = { ...params };
    if (this.opts.lpw && !('lpw' in all)) all.lpw = this.opts.lpw;
    const qs = buildQuery(all, raw);
    const headers: Record<string, string> = {};
    if (this.opts.uuid) headers['X-Daikin-uuid'] = this.opts.uuid.replace(/-/g, '');
    const res = await this.transport.request({
      method: 'GET',
      url: `${this.baseUrl}${p}${qs ? `?${qs}` : ''}`,
      headers,
      insecureTls: this.opts.https,
      timeoutMs: this.opts.timeoutMs ?? 8000,
    });
    if (res.status === 403) throw new TransportError('Adapter refused access (register this device with the adapter key)', 'auth', 403);
    if (res.status === 401) throw new TransportError('Adapter locked – enter the child-lock code', 'auth', 401);
    if (res.status >= 400) throw new TransportError(`HTTP ${res.status} from adapter`, 'http', res.status);
    const kv = parseKV(res.body);
    if (!allowNg && kv.ret && kv.ret !== 'OK') throw new DaikinApiError(kv.ret, p);
    return kv;
  }

  // ---------------------------------------------------------------- info
  basicInfo() { return this.call('/common/basic_info'); }
  modelInfo() { return this.call('/aircon/get_model_info'); }
  controlInfo() { return this.call('/aircon/get_control_info'); }
  sensorInfo() { return this.call('/aircon/get_sensor_info'); }

  async adapterInfo(): Promise<AdapterInfo> {
    return LegacyClient.toAdapterInfo(await this.basicInfo());
  }

  static toAdapterInfo(b: Record<string, string>): AdapterInfo {
    return {
      name: decodeDaikinString(b.name) || 'Daikin unit',
      mac: b.mac,
      firmware: b.ver?.replace(/_/g, '.'),
      adapterKind: b.adp_kind,
      model: b.type,
      ssid: decodeDaikinString(b.ssid),
      signal: toNumber(b.radio1),
      led: b.led === undefined ? undefined : b.led === '1',
      remoteMethod: b.method,
      holiday: b.en_hol === '1',
      region: b.reg,
      raw: b,
    };
  }

  static capabilities(model: Record<string, string>, basic: Record<string, string> = {}): Capabilities {
    const caps: Capabilities = structuredClone(DEFAULT_CAPABILITIES);
    if (model.en_frate === '0') caps.fanRates = ['auto'];
    else if (model.frate_steps === '2') caps.fanRates = ['auto', 'silent', '1', '3', '5'];
    if (model.en_frate_silent === '0') caps.fanRates = caps.fanRates.filter((f) => f !== 'silent');
    if (model.en_fdir === '0') caps.swing = ['off'];
    else if (model.s_fdir === '1') caps.swing = ['off', 'vertical'];
    caps.humidity = model.humd === '1' || model.s_humd !== undefined && model.s_humd !== '0';
    caps.schedule = model.en_scdltimer !== '0';
    caps.demandControl = model.dmnd === '1' || model.en_demand === '1';
    caps.special = model.en_spmode === '0' ? [] : ['powerful', 'econo', 'streamer'];
    caps.led = basic.led !== undefined;
    caps.holiday = basic.en_hol !== undefined || true;
    return caps;
  }

  /** Read control + sensor info and normalise. */
  async state(): Promise<UnitState> {
    const [control, sensor] = await Promise.all([this.controlInfo(), this.sensorInfo().catch(() => ({}))]);
    return LegacyClient.toState(control, sensor as Record<string, string>);
  }

  static toState(c: Record<string, string>, s: Record<string, string> = {}, basic: Record<string, string> = {}): UnitState {
    let swing: Swing = LEGACY_TO_SWING[c.f_dir ?? '0'] ?? 'off';
    if (c.f_dir_ud !== undefined && c.f_dir_lr !== undefined) {
      const ud = c.f_dir_ud === 'S';
      const lr = c.f_dir_lr === 'S';
      swing = ud && lr ? '3d' : ud ? 'vertical' : lr ? 'horizontal' : 'off';
    }
    const adv = (c.adv ?? '').split('/');
    const shum = c.shum;
    return {
      power: c.pow === '1',
      mode: LEGACY_TO_MODE[c.mode ?? '0'] ?? 'auto',
      targetTemp: toNumber(c.stemp),
      targetHumidity: shum === 'AUTO' ? 'auto' : shum === 'CONTINUE' ? 'continuous' : toNumber(shum) || undefined,
      fanRate: LEGACY_TO_FAN[c.f_rate ?? 'A'] ?? 'auto',
      swing,
      special: { powerful: adv.includes('2'), econo: adv.includes('12'), streamer: adv.includes('13') },
      indoorTemp: toNumber(s.htemp),
      indoorHumidity: toNumber(s.hhum),
      outdoorTemp: toNumber(s.otemp),
      compressorFreq: toNumber(s.cmpfreq),
      errorCode: s.err && s.err !== '0' ? s.err : undefined,
      holiday: basic.en_hol === undefined ? undefined : basic.en_hol === '1',
      filterSign: s.filter_sign_info === '1' || undefined,
      raw: { control: c, sensor: s },
      updatedAt: Date.now(),
    };
  }

  /**
   * Apply a change. set_control_info needs the complete parameter set, so the current
   * values are read first and merged (as the official app does).
   */
  async setState(change: StateChange): Promise<Record<string, string>> {
    const cur = await this.controlInfo();
    const mode = change.mode ? MODE_TO_LEGACY[change.mode] : cur.mode ?? '0';
    const modeChanged = change.mode !== undefined && mode !== cur.mode;
    // Per mode memories: dt<mode>, dh<mode>, dfr<mode>, dfd<mode>
    const mem = (prefix: string, fallback: string | undefined) =>
      modeChanged ? cur[`${prefix}${mode}`] ?? fallback : fallback;
    let stemp = change.targetTemp !== undefined ? formatTemp(change.targetTemp) : mem('dt', cur.stemp);
    let shum =
      change.targetHumidity !== undefined
        ? change.targetHumidity === 'auto'
          ? 'AUTO'
          : change.targetHumidity === 'continuous'
            ? 'CONTINUE'
            : String(change.targetHumidity)
        : mem('dh', cur.shum);
    if (mode === '6' && !stemp) stemp = '--';
    if (mode === '2' && (!stemp || stemp === '--')) stemp = 'M';
    if (!shum) shum = '0';
    const params: Record<string, string> = {
      pow: change.power === undefined ? cur.pow ?? '1' : change.power ? '1' : '0',
      mode,
      stemp: stemp ?? '--',
      shum,
    };
    if (cur.f_rate !== undefined || change.fanRate) {
      params.f_rate = change.fanRate ? FAN_TO_LEGACY[change.fanRate] : mem('dfr', cur.f_rate) ?? 'A';
    }
    const swing = change.swing;
    if (cur.f_dir_ud !== undefined && cur.f_dir_lr !== undefined) {
      params.f_dir_ud = swing ? (swing === 'vertical' || swing === '3d' ? 'S' : '0') : cur.f_dir_ud;
      params.f_dir_lr = swing ? (swing === 'horizontal' || swing === '3d' ? 'S' : '0') : cur.f_dir_lr;
    } else if (cur.f_dir !== undefined || swing) {
      params.f_dir = swing ? SWING_TO_LEGACY[swing] : mem('dfd', cur.f_dir) ?? '0';
    }
    // Keep any extra writable fields some models require (e.g. adv, b_* fields are read-only).
    return this.call('/aircon/set_control_info', params);
  }

  /** Powerful / Econo / Streamer. */
  async setSpecialMode(kind: SpecialMode, on: boolean): Promise<Record<string, string>> {
    const k = SPECIAL_KIND[kind];
    if (k === undefined) throw new TransportError(`${kind} is not supported by this adapter`, 'unsupported');
    try {
      return await this.call('/aircon/set_special_mode', { spmode_kind: k, set_spmode: on ? 1 : 0 });
    } catch (err) {
      // Older firmware only knows en_streamer=…
      if (kind === 'streamer') return this.call('/aircon/set_special_mode', { en_streamer: on ? 1 : 0 });
      throw err;
    }
  }

  // ---------------------------------------------------------------- energy
  async energy(): Promise<EnergyData> {
    const raw: EnergyData['raw'] = {};
    const tryCall = async (key: string, path: string, params?: Record<string, string | number>) => {
      try {
        raw[key] = await this.call(path, params);
      } catch {
        /* not supported on every adapter */
      }
    };
    await tryCall('day', '/aircon/get_day_power_ex', { days: 2 });
    await tryCall('weekEx', '/aircon/get_week_power_ex');
    await tryCall('week', '/aircon/get_week_power');
    await tryCall('yearEx', '/aircon/get_year_power_ex');
    await tryCall('year', '/aircon/get_year_power');
    await tryCall('price', '/aircon/get_price');
    return LegacyClient.toEnergy(raw);
  }

  static toEnergy(raw: EnergyData['raw']): EnergyData {
    const tenth = (v: string | undefined) => slashList(v).map((n) => n / 10);
    const out: EnergyData = { raw };
    const day = raw.day;
    if (day) {
      out.todayHourly = { cool: tenth(day.curr_day_cool), heat: tenth(day.curr_day_heat) };
      out.yesterdayHourly = { cool: tenth(day.prev_1day_cool), heat: tenth(day.prev_1day_heat) };
    }
    const wex = raw.weekEx;
    if (wex && (wex.week_cool || wex.week_heat)) {
      // 14 values, newest first: this week and previous week → take last 7 days.
      const cool = tenth(wex.week_cool).slice(0, 7).reverse();
      const heat = tenth(wex.week_heat).slice(0, 7).reverse();
      out.week = { cool, heat, total: cool.map((c, i) => round1(c + (heat[i] ?? 0))) };
    } else if (raw.week?.datas) {
      const total = slashList(raw.week.datas).map((wh) => wh / 1000);
      out.week = { cool: total.map(() => 0), heat: total.map(() => 0), total };
    }
    const yex = raw.yearEx;
    if (yex && (yex.curr_year_cool || yex.curr_year_heat)) {
      const mk = (c?: string, h?: string) => {
        const cool = tenth(c);
        const heat = tenth(h);
        return { cool, heat, total: cool.map((v, i) => round1(v + (heat[i] ?? 0))) };
      };
      out.thisYear = mk(yex.curr_year_cool, yex.curr_year_heat);
      out.lastYear = mk(yex.prev_year_cool, yex.prev_year_heat);
    } else if (raw.year) {
      const t = slashList(raw.year.this_year);
      const p = slashList(raw.year.previous_year);
      out.thisYear = { cool: t.map(() => 0), heat: t.map(() => 0), total: t };
      out.lastYear = { cool: p.map(() => 0), heat: p.map(() => 0), total: p };
    }
    if (raw.price?.price_int !== undefined) {
      out.price = Number(`${raw.price.price_int}.${raw.price.price_dec ?? '0'}`);
    }
    return out;
  }

  setPrice(price: number) {
    const [i, d = '0'] = price.toFixed(2).split('.');
    return this.call('/aircon/set_price', { price_int: i, price_dec: d });
  }

  // ---------------------------------------------------------------- adapter settings
  setHoliday(on: boolean) { return this.call('/common/set_holiday', { en_hol: on ? 1 : 0 }); }
  setLed(on: boolean) { return this.call('/common/set_led', { led: on ? 1 : 0 }); }
  setName(name: string) { return this.call('/common/set_name', { name: encodeDaikinString(name) }, { raw: ['name'] }); }
  setIcon(icon: number) { return this.call('/common/set_icon', { icon }); }
  getGroup() { return this.call('/common/get_group'); }
  setGroup(name: string | undefined) {
    return this.call(
      '/common/set_group',
      { en_grp: name ? 1 : 0, grp_name: name ? encodeDaikinString(name) : '' },
      { raw: ['grp_name'] },
    );
  }
  setLocation(params: Record<string, string>) { return this.call('/common/set_location', params); }
  /** Child-lock code ("local password"). Empty string removes it. */
  setLockCode(newCode: string) { return this.call('/common/set_lpw', { new_lpw: newCode }); }
  getRemoteMethod() { return this.call('/common/get_remote_method'); }
  setRemoteMethod(method: 'polling' | 'home only') { return this.call('/common/set_remote_method', { method }); }
  getDatetime() { return this.call('/common/get_datetime', { cur: '' }, { allowNg: true }); }

  /** Push the current UTC time (adapters without cloud access never learn the time otherwise). */
  syncClock(now = new Date()) {
    const p = (n: number) => String(n).padStart(2, '0');
    return this.call('/common/notify_date_time', {
      date: `${now.getUTCFullYear()}/${p(now.getUTCMonth() + 1)}/${p(now.getUTCDate())}`,
      zone: 'GMT',
      time: `${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())}`,
    });
  }

  setTimezone(zone: string, dst: boolean) { return this.call('/common/set_timezone', { zone, dst: dst ? 1 : 0 }); }
  reboot() { return this.call('/common/reboot'); }
  eraseDevice() { return this.call('/common/erase_device'); }

  /** BRP072C: register this app's UUID with the 13 digit key on the adapter sticker. */
  registerTerminal(key: string) { return this.call('/common/register_terminal', { key }); }
  unregisterTerminal() { return this.call('/common/unregister_terminal'); }

  // ---------------------------------------------------------------- notifications
  getNotify() { return this.call('/common/get_notify'); }
  setNotify(params: Record<string, string>) { return this.call('/common/set_notify', params); }
  getPushNotice() { return this.call('/common/get_push_notice'); }
  setPushNotice(params: Record<string, string>) { return this.call('/common/set_push_notice', params); }
  getMessageExist() { return this.call('/common/get_message_exist', {}, { allowNg: true }); }
  getMessages() { return this.call('/common/get_message', {}, { allowNg: true }); }
  setMessageRead(params: Record<string, string>) { return this.call('/common/set_message_read', params); }

  // ---------------------------------------------------------------- timers & schedules
  getTimer() { return this.call('/aircon/get_timer'); }
  setTimer(params: Record<string, string>) { return this.call('/aircon/set_timer', params); }
  getProgram() { return this.call('/aircon/get_program'); }
  setProgram(params: Record<string, string>) { return this.call('/aircon/set_program', params); }
  getScheduleInfo(prefix: 'aircon' | 'cleaner' = 'aircon') { return this.call(`/${prefix}/get_scdltimer_info`); }
  setScheduleInfo(params: Record<string, string | number>, prefix: 'aircon' | 'cleaner' = 'aircon') {
    return this.call(`/${prefix}/set_scdltimer_info`, params);
  }
  getScheduleBody(target: number, prefix: 'aircon' | 'cleaner' = 'aircon') {
    return this.call(`/${prefix}/get_scdltimer_body`, { target });
  }
  setScheduleBody(params: Record<string, string>, prefix: 'aircon' | 'cleaner' = 'aircon') {
    return this.call(`/${prefix}/set_scdltimer_body`, params);
  }
  getScheduleLegacy() { return this.call('/aircon/get_scdltimer'); }
  setScheduleLegacy(params: Record<string, string>) { return this.call('/aircon/set_scdltimer', params); }

  // ---------------------------------------------------------------- power saving
  getDemandControl() { return this.call('/aircon/get_demand_control'); }
  setDemandControl(params: { en_demand?: 0 | 1; mode?: 0 | 1 | 2; max_pow?: number } & Record<string, string | number | undefined>) {
    return this.call('/aircon/set_demand_control', params);
  }
  getTarget() { return this.call('/aircon/get_target'); }
  setTarget(params: Record<string, string>) { return this.call('/aircon/set_target', params); }

  // ---------------------------------------------------------------- Wi-Fi provisioning (adapter in AP mode)
  startWifiScan() { return this.call('/common/start_wifi_scan'); }
  async wifiScanResult(): Promise<{ ssid: string; security: string; signal?: number }[]> {
    const r = await this.call('/common/get_wifi_scan_result', {}, { allowNg: true });
    const count = Number(r.cnt ?? 20);
    const out: { ssid: string; security: string; signal?: number }[] = [];
    for (let i = 1; i <= Math.max(count, 20); i++) {
      const ssid = r[`ssid${i}`];
      if (!ssid) continue;
      out.push({ ssid: decodeDaikinString(ssid), security: r[`sec${i}`] ?? r[`security${i}`] ?? 'mixed', signal: toNumber(r[`radio${i}`]) });
    }
    return out.sort((a, b) => (b.signal ?? -999) - (a.signal ?? -999));
  }
  getWifiSetting() { return this.call('/common/get_wifi_setting'); }
  getNetworkSetting() { return this.call('/common/get_network_setting'); }

  /** Send home Wi-Fi credentials (+ optional static IP / proxy) to the adapter. */
  setNetworkSetting(n: {
    ssid: string; key: string; security: string;
    autoIp?: boolean; ipaddr?: string; netmask?: string; gateway?: string;
    autoDns?: boolean; dns1?: string; dns2?: string;
    useProxy?: boolean; proxy?: string; proxyPort?: string;
  }) {
    return this.call(
      '/common/set_network_setting',
      {
        ssid: encodeDaikinString(n.ssid),
        key: encodeDaikinString(n.key),
        security: n.security,
        auto_ip: n.autoIp === false ? 0 : 1,
        ipaddr: n.ipaddr ?? '',
        netmask: n.netmask ?? '',
        gateway: n.gateway ?? '',
        auto_dns: n.autoDns === false ? 0 : 1,
        dns1: n.dns1 ?? '',
        dns2: n.dns2 ?? '',
        use_proxy: n.useProxy ? 1 : 0,
        proxy: n.proxy ?? '',
        proxy_port: n.proxyPort ?? '',
      },
      { raw: ['ssid', 'key'] },
    );
  }
  startWifiConnection() { return this.call('/common/start_wifi_connection'); }
  permitWifiConnection() { return this.call('/common/permit_wifi_connection'); }

  // ---------------------------------------------------------------- out-of-home (adapter side)
  getOutOfHomePassword() { return this.call('/common/get_spw'); }
  addOutOfHomeAccount(id: string, spw: string) { return this.call('/common/add_account_pp', { id, spw }); }
  changeOutOfHomePassword(id: string, spw: string, newPw: string) {
    return this.call('/common/change_password_pp', { id, spw, new_pw: newPw });
  }
  setAccount(params: Record<string, string>) { return this.call('/common/set_account', params); }

  // ---------------------------------------------------------------- firmware
  checkFirmware() { return this.call('/common/system/fwupdate', {}, { allowNg: true }); }
  getProgressSum() { return this.call('/common/get_progsum', {}, { allowNg: true }); }

  // ---------------------------------------------------------------- air purifier (cleaner)
  cleanerControl() { return this.call('/cleaner/get_control_info'); }
  setCleanerControl(params: Record<string, string | number>) { return this.call('/cleaner/set_control_info', params); }
  cleanerSensor() { return this.call('/cleaner/get_sensor_info'); }
  cleanerModel() { return this.call('/cleaner/get_model_info'); }
  cleanerUnitInfo() { return this.call('/cleaner/get_unit_info'); }
  cleanerLinkage() { return this.call('/cleaner/get_linkage_info'); }
  setCleanerLinkage(params: Record<string, string>) { return this.call('/cleaner/set_linkage_info', params); }
  cleanerDaySensorCount() { return this.call('/cleaner/get_day_snsr_count'); }
  cleanerWeekSensorCount() { return this.call('/cleaner/get_week_snsr_count'); }
}

export function formatTemp(t: number): string {
  return (Math.round(t * 2) / 2).toFixed(1);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
