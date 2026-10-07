/**
 * Client for the JSON "dsiot" API used by BRP084 adapters and every adapter on firmware ≥ 2.8
 * (POST /dsiot/multireq). Paths were cross-checked against the official app and pydaikin.
 */
import { TransportError, type Transport } from './transport';
import type { EnergyData, FanRate, Mode, SpecialMode, StateChange, Swing, UnitState } from './model';
import { hexLeToInt, hexToAscii, hexToInt } from './util';

const DGC_IN = '/dsiot/edge/adr_0100.dgc_status';
const DGC_OUT = '/dsiot/edge/adr_0200.dgc_status';
const WEEK_POWER = '/dsiot/edge/adr_0100.i_power.week_power';
const ADP_I = '/dsiot/edge.adp_i';
const ADP_D = '/dsiot/edge.adp_d';

type Path = [to: string, ...pn: string[]];

const P = {
  power: [DGC_IN, 'dgc_status', 'e_1002', 'e_A002', 'p_01'],
  mode: [DGC_IN, 'dgc_status', 'e_1002', 'e_3001', 'p_01'],
  indoorTemp: [DGC_IN, 'dgc_status', 'e_1002', 'e_A00B', 'p_01'],
  indoorHumidity: [DGC_IN, 'dgc_status', 'e_1002', 'e_A00B', 'p_02'],
  outdoorTemp: [DGC_OUT, 'dgc_status', 'e_1003', 'e_A00D', 'p_01'],
  comfort: [DGC_IN, 'dgc_status', 'e_1002', 'e_3003', 'p_1D'],
  econo: [DGC_IN, 'dgc_status', 'e_1002', 'e_3003', 'p_24'],
  outdoorQuiet: [DGC_OUT, 'dgc_status', 'e_1003', 'e_3002', 'p_3D'],
  powerful: [DGC_OUT, 'dgc_status', 'e_1003', 'e_3002', 'p_44'],
  indoorModel: [DGC_IN, 'dgc_status', 'e_1002', 'e_A001', 'p_01'],
  outdoorModel: [DGC_OUT, 'dgc_status', 'e_1003', 'e_A001', 'p_01'],
  compressorTemp: [DGC_OUT, 'dgc_status', 'e_1003', 'e_A005', 'p_01'],
  mac: [ADP_I, 'adp_i', 'mac'],
  firmware: [ADP_I, 'adp_i', 'ver'],
  name: [ADP_D, 'adp_d', 'name'],
  todayRuntime: [WEEK_POWER, 'week_power', 'today_runtime'],
  weekData: [WEEK_POWER, 'week_power', 'datas'],
} satisfies Record<string, Path>;

const E3001 = [DGC_IN, 'dgc_status', 'e_1002', 'e_3001'] as const;
const TEMP_P: Partial<Record<Mode, string>> = { cool: 'p_02', heat: 'p_03', auto: 'p_1D' };
const FAN_P: Partial<Record<Mode, string>> = { auto: 'p_26', cool: 'p_09', heat: 'p_0A', fan: 'p_28' };
const SWING_P: Record<Mode, [v: string, h: string]> = {
  auto: ['p_20', 'p_21'],
  cool: ['p_05', 'p_06'],
  heat: ['p_07', 'p_08'],
  fan: ['p_24', 'p_25'],
  dry: ['p_22', 'p_23'],
};

export const DSIOT_MODE: Record<string, Mode> = { '0300': 'auto', '0200': 'cool', '0100': 'heat', '0000': 'fan', '0500': 'dry' };
const MODE_DSIOT = Object.fromEntries(Object.entries(DSIOT_MODE).map(([k, v]) => [v, k])) as Record<Mode, string>;
export const DSIOT_FAN: Record<string, FanRate> = {
  '0A00': 'auto', '0B00': 'silent', '0300': '1', '0400': '2', '0500': '3', '0600': '4', '0700': '5',
};
const FAN_DSIOT = Object.fromEntries(Object.entries(DSIOT_FAN).map(([k, v]) => [v, k])) as Record<FanRate, string>;
/** Feature toggles available over dsiot (streamer is not exposed by this API). */
export const DSIOT_SPECIAL = ['comfort', 'econo', 'outdoorQuiet', 'powerful'] as const;
const SWING_ON = '0F0000';
const SWING_OFF = '000000';

interface PcNode { pn: string; pv?: unknown; pch?: PcNode[] }
interface MultiResponse { responses: { fr: string; pc?: PcNode; rsc?: number }[] }

export interface DsiotOptions {
  host: string;
  https?: boolean;
  uuid?: string;
  timeoutMs?: number;
}

export class DsiotClient {
  constructor(private readonly transport: Transport, private readonly opts: DsiotOptions) {}

  private get url() {
    return `${this.opts.https ? 'https' : 'http'}://${this.opts.host}/dsiot/multireq`;
  }

  async multireq(requests: unknown[]): Promise<MultiResponse> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.opts.uuid) headers['X-Daikin-uuid'] = this.opts.uuid.replace(/-/g, '');
    const res = await this.transport.request({
      method: 'POST',
      url: this.url,
      headers,
      body: JSON.stringify({ requests }),
      insecureTls: this.opts.https,
      timeoutMs: this.opts.timeoutMs ?? 8000,
    });
    if (res.status >= 400) throw new TransportError(`HTTP ${res.status} from adapter`, 'http', res.status);
    try {
      return JSON.parse(res.body) as MultiResponse;
    } catch {
      throw new TransportError('Adapter returned invalid JSON', 'protocol');
    }
  }

  async readAll(): Promise<MultiResponse> {
    return this.multireq([
      { op: 2, to: `${DGC_IN}?filter=pv,pt,md` },
      { op: 2, to: `${DGC_OUT}?filter=pv,pt,md` },
      { op: 2, to: `${WEEK_POWER}?filter=pv,pt,md` },
      { op: 2, to: ADP_I },
      { op: 2, to: ADP_D },
    ]);
  }

  /** Read one value from a multireq answer. */
  static find(resp: MultiResponse, [to, ...pns]: readonly string[]): unknown {
    const base = to!.split('?')[0];
    let nodes = resp.responses.filter((r) => r.fr === base && r.pc).map((r) => r.pc!);
    for (let i = 0; i < pns.length; i++) {
      const hit = nodes.find((n) => n && n.pn === pns[i]);
      if (!hit) return undefined;
      if (i === pns.length - 1) return hit.pv;
      nodes = hit.pch ?? [];
    }
    return undefined;
  }

  static toState(resp: MultiResponse): UnitState {
    const s = (p: readonly string[]) => DsiotClient.find(resp, p) as string | undefined;
    const power = s(P.power) === '01';
    const mode = DSIOT_MODE[s(P.mode) ?? ''] ?? 'auto';
    const tp = TEMP_P[mode];
    const fp = FAN_P[mode];
    const [vp, hp] = SWING_P[mode];
    const temp = tp ? s([...E3001, tp]) : undefined;
    const fan = fp ? s([...E3001, fp]) : undefined;
    const v = s([...E3001, vp]) ?? '';
    const h = s([...E3001, hp]) ?? '';
    const vert = v.includes('F');
    const hor = h.includes('F');
    const swing: Swing = vert && hor ? '3d' : vert ? 'vertical' : hor ? 'horizontal' : 'off';
    const flag = (p: readonly string[]) => {
      const x = s(p);
      return x === undefined ? undefined : x === '01';
    };
    const special: Partial<Record<SpecialMode, boolean>> = {};
    for (const k of DSIOT_SPECIAL) {
      const f = flag(P[k]);
      if (f !== undefined) special[k] = f;
    }
    const it = s(P.indoorTemp);
    const ih = s(P.indoorHumidity);
    const ot = s(P.outdoorTemp);
    return {
      power,
      mode,
      targetTemp: temp ? hexToInt(temp.slice(0, 2)) / 2 : undefined,
      fanRate: (fan && DSIOT_FAN[fan]) || 'auto',
      swing,
      special,
      indoorTemp: it ? hexToInt(it.slice(0, 2)) : undefined,
      indoorHumidity: ih && ih !== 'FF' ? hexToInt(ih) : undefined,
      outdoorTemp: ot ? hexLeToInt(ot) / 2 : undefined,
      raw: { dsiot: resp },
      updatedAt: Date.now(),
    };
  }

  static info(resp: MultiResponse) {
    const s = (p: readonly string[]) => DsiotClient.find(resp, p) as string | undefined;
    const model = s(P.indoorModel);
    return {
      mac: s(P.mac),
      firmware: s(P.firmware),
      name: s(P.name),
      model: model ? hexToAscii(model) : undefined,
      outdoorModel: s(P.outdoorModel) ? hexToAscii(s(P.outdoorModel)!) : undefined,
    };
  }

  static toEnergy(resp: MultiResponse): EnergyData {
    const datas = DsiotClient.find(resp, P.weekData);
    const total = Array.isArray(datas) ? datas.map((n) => Number(n) / 1000) : [];
    return {
      week: total.length ? { cool: total.map(() => 0), heat: total.map(() => 0), total } : undefined,
      raw: { dsiot: { today_runtime: String(DsiotClient.find(resp, P.todayRuntime) ?? '') } },
    };
  }

  async state(): Promise<UnitState> {
    return DsiotClient.toState(await this.readAll());
  }

  /** Build an op:3 write request grouping attributes by target. */
  static buildWrite(attrs: { path: readonly string[]; value: string }[]) {
    const requests: { op: 3; to: string; pc: PcNode }[] = [];
    for (const { path, value } of attrs) {
      const [to, root, ...rest] = path as string[];
      let req = requests.find((r) => r.to === to);
      if (!req) {
        req = { op: 3, to: to!, pc: { pn: root!, pch: [] } };
        requests.push(req);
      }
      let node = req.pc;
      for (let i = 0; i < rest.length - 1; i++) {
        node.pch ??= [];
        let child = node.pch.find((c) => c.pn === rest[i]);
        if (!child) {
          child = { pn: rest[i]!, pch: [] };
          node.pch.push(child);
        }
        node = child;
      }
      node.pch ??= [];
      node.pch.push({ pn: rest[rest.length - 1]!, pv: value });
    }
    return requests;
  }

  async setState(change: StateChange, current?: UnitState): Promise<void> {
    const cur = current ?? (await this.state());
    const mode = change.mode ?? cur.mode;
    const attrs: { path: readonly string[]; value: string }[] = [];
    if (change.power !== undefined) attrs.push({ path: P.power, value: change.power ? '01' : '00' });
    if (change.mode) attrs.push({ path: P.mode, value: MODE_DSIOT[change.mode] });
    if (change.targetTemp !== undefined && TEMP_P[mode]) {
      const hex = Math.round(change.targetTemp * 2).toString(16).toUpperCase().padStart(2, '0');
      attrs.push({ path: [...E3001, TEMP_P[mode]!], value: hex });
    }
    if (change.fanRate && FAN_P[mode]) attrs.push({ path: [...E3001, FAN_P[mode]!], value: FAN_DSIOT[change.fanRate] });
    if (change.swing) {
      const [vp, hp] = SWING_P[mode];
      const vOn = change.swing === 'vertical' || change.swing === '3d';
      const hOn = change.swing === 'horizontal' || change.swing === '3d';
      attrs.push({ path: [...E3001, vp], value: vOn ? SWING_ON : SWING_OFF });
      attrs.push({ path: [...E3001, hp], value: hOn ? SWING_ON : SWING_OFF });
    }
    if (attrs.length) await this.multireq(DsiotClient.buildWrite(attrs));
  }

  /**
   * Toggle a feature. Mirrors the remote controller: Powerful and {Comfort, Econo,
   * Outdoor quiet} are mutually exclusive.
   */
  async setSpecialMode(kind: SpecialMode, on: boolean, current?: UnitState): Promise<void> {
    if (!(DSIOT_SPECIAL as readonly string[]).includes(kind)) {
      throw new TransportError(`${kind} is not available on this adapter`, 'unsupported');
    }
    const attrs: { path: readonly string[]; value: string }[] = [{ path: P[kind as (typeof DSIOT_SPECIAL)[number]], value: on ? '01' : '00' }];
    const trio = ['comfort', 'econo', 'outdoorQuiet'] as const;
    if (on && kind === 'powerful') for (const k of trio) if (current?.special[k]) attrs.push({ path: P[k], value: '00' });
    if (on && (trio as readonly string[]).includes(kind) && current?.special.powerful) attrs.push({ path: P.powerful, value: '00' });
    await this.multireq(DsiotClient.buildWrite(attrs));
  }

  /** Schedule timer on dsiot adapters (raw JSON, edited through the generic editor). */
  readSchedule() {
    return this.multireq([
      { op: 2, to: '/dsiot/edge/adr_0100.scdl_t.info' },
      { op: 2, to: '/dsiot/edge/adr_0100.scdl_t.body' },
    ]);
  }

  readHistory() {
    return this.multireq([{ op: 2, to: '/dsiot/edge/adr_0100.history' }]);
  }
}
