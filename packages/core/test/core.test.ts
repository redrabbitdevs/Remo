import { describe, expect, it } from 'vitest';
import {
  DaikinUnit,
  DsiotClient,
  LegacyClient,
  SimulatorTransport,
  combine,
  decodeBody,
  decodeEntry,
  encodeBody,
  encodeDaikinString,
  encodeEntry,
  energyToCsv,
  hexLeToInt,
  parseKV,
  summarize,
  detectProtocol,
  type HttpRequest,
  type Transport,
} from '../src';

const sim = () => {
  const t = new SimulatorTransport();
  t.latencyMs = 0;
  return t;
};

describe('util', () => {
  it('parses key=value bodies', () => {
    expect(parseKV('ret=OK,pow=1,stemp=24.0,name=%41%42')).toEqual({ ret: 'OK', pow: '1', stemp: '24.0', name: '%41%42' });
  });
  it('encodes names like the official app', () => {
    expect(encodeDaikinString('Ab')).toBe('%41%62');
  });
  it('decodes little-endian signed hex', () => {
    expect(hexLeToInt('0D00')).toBe(13);
    expect(hexLeToInt('F6FF')).toBe(-10);
  });
});

describe('legacy client', () => {
  it('reads and normalises state from the simulator', async () => {
    const c = new LegacyClient(sim(), { host: 'demo-living' });
    const s = await c.state();
    expect(s.power).toBe(false);
    expect(s.mode).toBe('cool');
    expect(s.targetTemp).toBe(24);
    expect(s.indoorTemp).toBe(27.5);
  });

  it('merges current values when setting state', async () => {
    const t = sim();
    const seen: string[] = [];
    const spy: Transport = { kind: 'spy', request: (r: HttpRequest) => (seen.push(r.url), t.request(r)) };
    const c = new LegacyClient(spy, { host: 'demo-living' });
    await c.setState({ power: true, targetTemp: 22.5 });
    const set = seen.find((u) => u.includes('set_control_info'))!;
    expect(set).toContain('pow=1');
    expect(set).toContain('stemp=22.5');
    expect(set).toContain('mode=3');
    expect(set).toContain('f_rate=A');
    const s = await c.state();
    expect(s.power).toBe(true);
    expect(s.targetTemp).toBe(22.5);
  });

  it('restores the per-mode memory when changing mode', async () => {
    const c = new LegacyClient(sim(), { host: 'demo-living' });
    await c.setState({ mode: 'heat' });
    const s = await c.state();
    expect(s.mode).toBe('heat');
    expect(s.targetTemp).toBe(21);
  });

  it('toggles special modes', async () => {
    const c = new LegacyClient(sim(), { host: 'demo-living' });
    await c.setSpecialMode('powerful', true);
    expect((await c.state()).special.powerful).toBe(true);
    await c.setSpecialMode('econo', true);
    const s = await c.state();
    expect(s.special.econo).toBe(true);
    expect(s.special.powerful).toBe(false);
  });

  it('parses energy data', async () => {
    const e = await new LegacyClient(sim(), { host: 'demo-living' }).energy();
    expect(e.todayHourly?.cool).toHaveLength(24);
    expect(e.week?.total).toHaveLength(7);
    expect(e.thisYear?.total).toHaveLength(12);
    expect(e.price).toBeCloseTo(0.28);
    const sum = summarize(e);
    expect(sum.today).toBeGreaterThanOrEqual(0);
    expect(energyToCsv('Living', e).split('\n')[0]).toBe('unit,period,index,cool_kwh,heat_kwh,total_kwh');
    expect(combine([e, e]).week?.total[0]).toBeCloseTo((e.week?.total[0] ?? 0) * 2, 1);
  });

  it('sends X-Daikin-uuid and uses https for BRP072C', async () => {
    let req: HttpRequest | undefined;
    const t: Transport = { kind: 'x', request: async (r) => ((req = r), { status: 200, body: 'ret=OK' }) };
    await new LegacyClient(t, { host: '10.0.0.5', https: true, uuid: 'ab-cd' }).registerTerminal('0123456789012');
    expect(req!.url).toBe('https://10.0.0.5/common/register_terminal?key=0123456789012');
    expect(req!.headers!['X-Daikin-uuid']).toBe('abcd');
    expect(req!.insecureTls).toBe(true);
  });

  it('raises on ret=PARAM NG', async () => {
    const t: Transport = { kind: 'x', request: async () => ({ status: 200, body: 'ret=PARAM NG' }) };
    await expect(new LegacyClient(t, { host: 'h' }).controlInfo()).rejects.toThrow(/PARAM NG/);
  });
});

describe('schedule codec', () => {
  it('round-trips an entry', () => {
    const e = { enabled: true, power: true, mode: 'cool' as const, temp: 26, time: 7 * 60 + 30, fanRate: 'auto' as const, swing: 'off' as const, humidity: undefined };
    const s = encodeEntry(e);
    expect(s).toHaveLength(18);
    const d = decodeEntry(s)!;
    expect(d).toMatchObject({ enabled: true, power: true, mode: 'cool', temp: 26, time: 450, fanRate: 'auto', swing: 'off' });
  });

  it('round-trips a weekly body', () => {
    const body = { ret: 'OK', target: '2', format: 'v1', moc: '1', mo1: encodeEntry({ enabled: true, power: false, time: 1380 }), tuc: '0', wec: '0', thc: '0', frc: '0', sac: '0', suc: '0' };
    const w = decodeBody(body);
    expect(w.target).toBe(2);
    expect(w.days.mo).toHaveLength(1);
    const enc = encodeBody(w);
    expect(enc.moc).toBe('1');
    expect(enc.mo1).toBe(body.mo1);
  });
});

describe('dsiot', () => {
  const resp = {
    responses: [
      {
        fr: '/dsiot/edge/adr_0100.dgc_status',
        pc: {
          pn: 'dgc_status',
          pch: [
            {
              pn: 'e_1002',
              pch: [
                { pn: 'e_A002', pch: [{ pn: 'p_01', pv: '01' }] },
                { pn: 'e_3001', pch: [{ pn: 'p_01', pv: '0200' }, { pn: 'p_02', pv: '32' }, { pn: 'p_09', pv: '0A00' }, { pn: 'p_05', pv: '0F0000' }, { pn: 'p_06', pv: '000000' }] },
                { pn: 'e_A00B', pch: [{ pn: 'p_01', pv: '1A' }, { pn: 'p_02', pv: '37' }] },
                { pn: 'e_3003', pch: [{ pn: 'p_24', pv: '01' }] },
              ],
            },
          ],
        },
      },
      { fr: '/dsiot/edge/adr_0200.dgc_status', pc: { pn: 'dgc_status', pch: [{ pn: 'e_1003', pch: [{ pn: 'e_A00D', pch: [{ pn: 'p_01', pv: 'F6FF' }] }] }] } },
      { fr: '/dsiot/edge.adp_i', pc: { pn: 'adp_i', pch: [{ pn: 'mac', pv: 'AABBCC' }, { pn: 'ver', pv: '2_8_0' }] } },
    ],
  };

  it('parses state', () => {
    const s = DsiotClient.toState(resp);
    expect(s).toMatchObject({ power: true, mode: 'cool', targetTemp: 25, fanRate: 'auto', swing: 'vertical', indoorTemp: 26, indoorHumidity: 55, outdoorTemp: -5 });
    expect(s.special.econo).toBe(true);
    expect(DsiotClient.info(resp).mac).toBe('AABBCC');
  });

  it('builds grouped write requests', () => {
    const req = DsiotClient.buildWrite([
      { path: ['/dsiot/edge/adr_0100.dgc_status', 'dgc_status', 'e_1002', 'e_A002', 'p_01'], value: '01' },
      { path: ['/dsiot/edge/adr_0100.dgc_status', 'dgc_status', 'e_1002', 'e_3001', 'p_02'], value: '30' },
    ]);
    expect(req).toHaveLength(1);
    expect(JSON.stringify(req[0])).toBe(
      '{"op":3,"to":"/dsiot/edge/adr_0100.dgc_status","pc":{"pn":"dgc_status","pch":[{"pn":"e_1002","pch":[{"pn":"e_A002","pch":[{"pn":"p_01","pv":"01"}]},{"pn":"e_3001","pch":[{"pn":"p_02","pv":"30"}]}]}]}}',
    );
  });
});

describe('device façade', () => {
  it('detects the legacy protocol and controls a unit', async () => {
    const t = sim();
    const det = await detectProtocol(t, 'demo-office', 'uuid');
    expect(det.protocol).toBe('legacy');
    const unit = new DaikinUnit({ id: '1', name: 'Office', host: 'demo-office', protocol: 'legacy', kind: 'aircon' }, { transport: t, uuid: 'u' });
    const snap = await unit.refresh();
    expect(snap.info.name).toBe('Office');
    expect(snap.caps.swing).toContain('3d');
    const after = await unit.setState({ power: true, fanRate: '3', swing: '3d' });
    expect(after.state).toMatchObject({ power: true, fanRate: '3', swing: '3d' });
    const info = await unit.scheduleInfo();
    expect(info.names[0]).toBe('Weekdays');
    const week = await unit.schedule(1);
    expect(week.days.mo.length).toBe(2);
    await unit.saveSchedule({ ...week, days: { ...week.days, sa: [{ enabled: true, power: true, time: 600, mode: 'heat', temp: 22 }] } });
    expect((await unit.schedule(1)).days.sa[0]).toMatchObject({ mode: 'heat', temp: 22, time: 600 });
  });

  it('discovers simulated units', async () => {
    const found = await sim().discover();
    expect(found.map((f) => f.ip)).toContain('demo-purifier');
  });
});
