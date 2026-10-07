/** Unified, protocol independent model used by every UI. */

export type Mode = 'auto' | 'cool' | 'heat' | 'dry' | 'fan';
export type FanRate = 'auto' | 'silent' | '1' | '2' | '3' | '4' | '5';
export type Swing = 'off' | 'vertical' | 'horizontal' | '3d';
export type SpecialMode = 'powerful' | 'econo' | 'streamer' | 'comfort' | 'outdoorQuiet';

/** How Remo talks to an adapter. */
export type Protocol =
  /** BRP069Axx/Bxx, BRP072A: plain HTTP, key=value. */
  | 'legacy'
  /** BRP072Cxx: HTTPS + registered terminal UUID (X-Daikin-uuid), key=value. */
  | 'legacy-https'
  /** BRP084 / firmware ≥ 2.8: JSON /dsiot/multireq. */
  | 'dsiot'
  /** Purely simulated demo unit. */
  | 'demo';

export type DeviceKind = 'aircon' | 'cleaner';

export interface UnitConfig {
  id: string;
  name: string;
  host: string;
  protocol: Protocol;
  kind: DeviceKind;
  /** 13 digit key printed on BRP072C adapters (for /common/register_terminal). */
  key?: string;
  /** Local password / child-lock code (sent as lpw or HTTP Basic). */
  lpw?: string;
  icon?: string;
  group?: string;
  order?: number;
  mac?: string;
  /** Cloud edge id (Out-of-Home units imported from the account). */
  edgeId?: string;
  /** Favourite presets shown on the dashboard. */
  favourite?: boolean;
}

export interface Capabilities {
  modes: Mode[];
  fanRates: FanRate[];
  swing: Swing[];
  special: SpecialMode[];
  humidity: boolean;
  energy: boolean;
  schedule: boolean;
  demandControl: boolean;
  holiday: boolean;
  led: boolean;
  outdoorTemp: boolean;
  tempRange: { cool: [number, number]; heat: [number, number]; auto: [number, number] };
}

export interface UnitState {
  power: boolean;
  mode: Mode;
  /** Target temperature in °C (undefined when the mode has none, e.g. fan / dry). */
  targetTemp?: number;
  targetHumidity?: number | 'auto' | 'continuous';
  fanRate: FanRate;
  swing: Swing;
  special: Partial<Record<SpecialMode, boolean>>;
  indoorTemp?: number;
  indoorHumidity?: number;
  outdoorTemp?: number;
  compressorFreq?: number;
  errorCode?: string;
  holiday?: boolean;
  filterSign?: boolean;
  /** Raw protocol values (shown in diagnostics and used for exotic fields). */
  raw: Record<string, unknown>;
  updatedAt: number;
}

export interface AdapterInfo {
  name: string;
  mac?: string;
  firmware?: string;
  model?: string;
  adapterKind?: string;
  ssid?: string;
  /** Wi-Fi RSSI in dBm. */
  signal?: number;
  led?: boolean;
  remoteMethod?: 'polling' | 'home only' | string;
  holiday?: boolean;
  region?: string;
  raw: Record<string, string>;
}

export interface StateChange {
  power?: boolean;
  mode?: Mode;
  targetTemp?: number;
  targetHumidity?: number | 'auto' | 'continuous';
  fanRate?: FanRate;
  swing?: Swing;
}

export interface EnergyData {
  /** Today's consumption per hour in kWh (cool + heat). */
  todayHourly?: { cool: number[]; heat: number[] };
  yesterdayHourly?: { cool: number[]; heat: number[] };
  /** Last 7 days (oldest first) in kWh. */
  week?: { cool: number[]; heat: number[]; total: number[] };
  /** Month by month (Jan..Dec) in kWh. */
  thisYear?: { cool: number[]; heat: number[]; total: number[] };
  lastYear?: { cool: number[]; heat: number[]; total: number[] };
  /** Electricity price per kWh (adapter setting). */
  price?: number;
  raw: Record<string, Record<string, string>>;
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  modes: ['auto', 'cool', 'heat', 'dry', 'fan'],
  fanRates: ['auto', 'silent', '1', '2', '3', '4', '5'],
  swing: ['off', 'vertical', 'horizontal', '3d'],
  special: ['powerful', 'econo', 'streamer'],
  humidity: false,
  energy: true,
  schedule: true,
  demandControl: false,
  holiday: true,
  led: true,
  outdoorTemp: true,
  tempRange: { cool: [18, 32], heat: [10, 30], auto: [18, 30] },
};

export const MODE_LABELS: Record<Mode, string> = {
  auto: 'Auto',
  cool: 'Cool',
  heat: 'Heat',
  dry: 'Dry',
  fan: 'Fan',
};

export const FAN_LABELS: Record<FanRate, string> = {
  auto: 'Auto',
  silent: 'Quiet',
  '1': 'Level 1',
  '2': 'Level 2',
  '3': 'Level 3',
  '4': 'Level 4',
  '5': 'Level 5',
};

export const SWING_LABELS: Record<Swing, string> = {
  off: 'Off',
  vertical: 'Up-down',
  horizontal: 'Left-right',
  '3d': '3D',
};

export const SPECIAL_LABELS: Record<SpecialMode, string> = {
  powerful: 'Powerful',
  econo: 'Econo',
  streamer: 'Streamer',
  comfort: 'Comfort airflow',
  outdoorQuiet: 'Outdoor quiet',
};
