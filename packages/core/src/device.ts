/** Protocol independent façade used by the UIs. */
import { CloudClient } from './cloud';
import { DsiotClient } from './dsiot';
import { LegacyClient } from './legacy';
import type { AdapterInfo, Capabilities, EnergyData, Protocol, SpecialMode, StateChange, UnitConfig, UnitState } from './model';
import { DEFAULT_CAPABILITIES } from './model';
import { decodeBody, decodeInfo, encodeBody, encodeInfo, type ScheduleInfo, type WeeklySchedule } from './schedule';
import { TransportError, type Transport } from './transport';
import { parseKV } from './util';

export interface Snapshot {
  state: UnitState;
  info: AdapterInfo;
  caps: Capabilities;
}

export interface UnitContext {
  transport: Transport;
  /** App terminal UUID (registered with BRP072C adapters). */
  uuid: string;
  /** When set, requests go through the Out-of-Home cloud. */
  cloud?: { client: CloudClient; edgeId?: string };
}

export class DaikinUnit {
  readonly legacy?: LegacyClient;
  readonly dsiot?: DsiotClient;
  private last?: Snapshot;
  private staticInfo?: { basic: Record<string, string>; model: Record<string, string> };

  constructor(public readonly config: UnitConfig, private readonly ctx: UnitContext) {
    const https = config.protocol === 'legacy-https';
    if (config.protocol === 'dsiot') {
      const cloud = ctx.cloud;
      const transport: Transport = cloud
        ? {
            kind: 'cloud',
            request: async (req) => {
              const body = JSON.parse(req.body ?? '{}') as { requests: { op: number; to: string }[] };
              const res = await cloud.client.multireq(body.requests, cloud.edgeId);
              return { status: 200, body: JSON.stringify(res) };
            },
          }
        : ctx.transport;
      this.dsiot = new DsiotClient(transport, { host: config.host, uuid: ctx.uuid });
    } else {
      this.legacy = new LegacyClient(ctx.transport, { host: config.host, https, uuid: ctx.uuid, lpw: config.lpw });
    }
  }

  get protocol(): Protocol {
    return this.config.protocol;
  }

  get snapshot(): Snapshot | undefined {
    return this.last;
  }

  get isCleaner() {
    return this.config.kind === 'cleaner';
  }

  async refresh(): Promise<Snapshot> {
    if (this.dsiot) {
      const resp = await this.dsiot.readAll();
      const state = DsiotClient.toState(resp);
      const i = DsiotClient.info(resp);
      const info: AdapterInfo = {
        name: i.name || this.config.name,
        mac: i.mac,
        firmware: i.firmware,
        model: i.model,
        raw: {},
      };
      const caps: Capabilities = {
        ...structuredClone(DEFAULT_CAPABILITIES),
        special: (['comfort', 'econo', 'outdoorQuiet', 'powerful'] as SpecialMode[]).filter((k) => state.special[k] !== undefined),
        humidity: false,
        schedule: false,
        demandControl: false,
        holiday: false,
        led: false,
        outdoorTemp: state.outdoorTemp !== undefined,
      };
      this.last = { state, info, caps };
      return this.last;
    }
    const legacy = this.legacy!;
    if (this.isCleaner) {
      const [control, sensor, basic] = await Promise.all([
        legacy.cleanerControl(),
        legacy.cleanerSensor().catch(() => ({}) as Record<string, string>),
        this.staticInfo?.basic ?? legacy.basicInfo(),
      ]);
      const state: UnitState = {
        power: control.pow === '1',
        mode: 'fan',
        fanRate: 'auto',
        swing: 'off',
        special: {},
        indoorTemp: Number(sensor.htemp) || undefined,
        indoorHumidity: Number(sensor.hhum) || undefined,
        raw: { control, sensor },
        updatedAt: Date.now(),
      };
      this.staticInfo ??= { basic, model: {} };
      this.last = {
        state,
        info: LegacyClient.toAdapterInfo(basic),
        caps: { ...structuredClone(DEFAULT_CAPABILITIES), modes: [], special: [], schedule: true, energy: false },
      };
      return this.last;
    }
    if (!this.staticInfo) {
      const [basic, model] = await Promise.all([legacy.basicInfo(), legacy.modelInfo().catch(() => ({}))]);
      this.staticInfo = { basic, model: model as Record<string, string> };
    }
    const [control, sensor, basic] = await Promise.all([
      legacy.controlInfo(),
      legacy.sensorInfo().catch(() => ({}) as Record<string, string>),
      legacy.basicInfo().catch(() => this.staticInfo!.basic),
    ]);
    this.staticInfo.basic = basic;
    const state = LegacyClient.toState(control, sensor, basic);
    const caps = LegacyClient.capabilities(this.staticInfo.model, basic);
    if (sensor.otemp === undefined || sensor.otemp === '-') caps.outdoorTemp = false;
    if (typeof state.targetHumidity === 'number' || state.targetHumidity === 'auto') caps.humidity = true;
    this.last = { state, info: LegacyClient.toAdapterInfo(basic), caps };
    return this.last;
  }

  async setState(change: StateChange): Promise<Snapshot> {
    if (this.dsiot) await this.dsiot.setState(change, this.last?.state);
    else if (this.isCleaner) await this.legacy!.setCleanerControl({ pow: change.power ? 1 : 0 });
    else await this.legacy!.setState(change);
    return this.refresh();
  }

  async setSpecialMode(kind: SpecialMode, on: boolean): Promise<Snapshot> {
    if (this.dsiot) await this.dsiot.setSpecialMode(kind, on, this.last?.state);
    else await this.legacy!.setSpecialMode(kind, on);
    return this.refresh();
  }

  async energy(): Promise<EnergyData> {
    if (this.dsiot) return DsiotClient.toEnergy(await this.dsiot.readAll());
    return this.legacy!.energy();
  }

  private requireLegacy(feature: string): LegacyClient {
    if (!this.legacy) throw new TransportError(`${feature} is not available on this adapter`, 'unsupported');
    return this.legacy;
  }

  async scheduleInfo(): Promise<ScheduleInfo> {
    const l = this.requireLegacy('Schedule timer');
    return decodeInfo(await l.getScheduleInfo(this.isCleaner ? 'cleaner' : 'aircon'));
  }

  async saveScheduleInfo(info: Pick<ScheduleInfo, 'enabled' | 'activeNo' | 'names'>) {
    return this.requireLegacy('Schedule timer').setScheduleInfo(encodeInfo(info), this.isCleaner ? 'cleaner' : 'aircon');
  }

  async schedule(target: number): Promise<WeeklySchedule> {
    const l = this.requireLegacy('Schedule timer');
    return decodeBody(await l.getScheduleBody(target, this.isCleaner ? 'cleaner' : 'aircon'), target);
  }

  async saveSchedule(s: WeeklySchedule) {
    return this.requireLegacy('Schedule timer').setScheduleBody(encodeBody(s), this.isCleaner ? 'cleaner' : 'aircon');
  }

  /** Escape hatch for every other endpoint (diagnostics, rarely used settings). */
  async raw(path: string, params: Record<string, string> = {}): Promise<Record<string, string> | unknown> {
    if (this.dsiot) {
      if (path.startsWith('{') || path.startsWith('[')) return this.dsiot.multireq(JSON.parse(path));
      return this.dsiot.multireq([{ op: 2, to: path }]);
    }
    return this.legacy!.call(path, params, { allowNg: true });
  }
}

/**
 * Work out which protocol an adapter speaks.
 * Order: plain HTTP legacy → HTTPS legacy (BRP072C) → dsiot JSON.
 */
export async function detectProtocol(
  transport: Transport,
  host: string,
  uuid: string,
): Promise<{ protocol: Protocol; basic?: Record<string, string>; needsKey?: boolean; kind: 'aircon' | 'cleaner' }> {
  const kindOf = (b: Record<string, string>) => (b.type === 'cj' || b.type === 'cleaner' || b.type?.startsWith('cj') ? 'cleaner' : 'aircon');
  try {
    const res = await transport.request({ method: 'GET', url: `http://${host}/common/basic_info`, timeoutMs: 4000 });
    if (res.status === 200 && res.body.includes('ret=OK')) {
      const b = parseKV(res.body);
      return { protocol: 'legacy', basic: b, kind: kindOf(b) };
    }
  } catch {
    /* try next */
  }
  try {
    const res = await transport.request({
      method: 'GET',
      url: `https://${host}/common/basic_info`,
      headers: { 'X-Daikin-uuid': uuid.replace(/-/g, '') },
      insecureTls: true,
      timeoutMs: 5000,
    });
    if (res.status === 200 && res.body.includes('ret=OK')) {
      const b = parseKV(res.body);
      return { protocol: 'legacy-https', basic: b, kind: kindOf(b) };
    }
    if (res.status === 403) return { protocol: 'legacy-https', needsKey: true, kind: 'aircon' };
  } catch {
    /* try next */
  }
  const d = new DsiotClient(transport, { host });
  try {
    const resp = await d.readAll();
    if (resp.responses?.length) {
      const info = DsiotClient.info(resp);
      return { protocol: 'dsiot', basic: { name: info.name ?? '', mac: info.mac ?? '', ver: info.firmware ?? '' }, kind: 'aircon' };
    }
  } catch {
    /* fall through */
  }
  throw new TransportError(`No Daikin adapter answered at ${host}`, 'network');
}
