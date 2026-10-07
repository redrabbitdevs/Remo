import { useCallback, useRef, useSyncExternalStore } from 'react';
import {
  CloudClient,
  DaikinUnit,
  SimulatorTransport,
  newUuid,
  type RoutingTransport,
  type Snapshot,
  type SpecialMode,
  type StateChange,
  type UnitConfig,
} from '@remo/core';
import { createTransport, type Runtime } from './platform';

export interface Scene {
  id: string;
  name: string;
  icon: string;
  actions: { unitId: string; change: StateChange; special?: Partial<Record<SpecialMode, boolean>> }[];
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  tempUnit: 'C' | 'F';
  clock24: boolean;
  pollSeconds: number;
  bridgeUrl: string;
  bridgeToken: string;
  demo: boolean;
  confirmAllOff: boolean;
  currency: string;
  /** Default price per kWh used when the adapter has none. */
  price: number;
  weekStartsMonday: boolean;
  location: 'home' | 'away';
  cloudClientId: string;
  cloudClientSecret: string;
  cloudUser: string;
  region: string;
  onboarded: boolean;
  /** Notify when a unit reports an error code or goes offline. */
  alerts: boolean;
}

export interface UnitRuntime {
  snap?: Snapshot;
  error?: string;
  loading: boolean;
  /** Last successful refresh (epoch ms). */
  seen?: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
  action?: { label: string; run: () => void };
}

export interface AppState {
  settings: Settings;
  units: UnitConfig[];
  groups: string[];
  scenes: Scene[];
  runtime: Record<string, UnitRuntime>;
  toasts: Toast[];
  uuid: string;
  platform: Runtime;
  bridgeOk?: boolean;
  cloudSignedIn: boolean;
}

const KEY = 'remo.v1';

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  tempUnit: 'C',
  clock24: true,
  pollSeconds: 15,
  bridgeUrl: '',
  bridgeToken: '',
  demo: false,
  confirmAllOff: true,
  currency: '€',
  price: 0.3,
  weekStartsMonday: true,
  location: 'home',
  cloudClientId: (import.meta.env.VITE_DAIKIN_CLIENT_ID as string | undefined) ?? '',
  cloudClientSecret: (import.meta.env.VITE_DAIKIN_CLIENT_SECRET as string | undefined) ?? '',
  cloudUser: '',
  region: 'eu',
  onboarded: false,
  alerts: true,
};

export const DEMO_UNITS: UnitConfig[] = [
  { id: 'demo-living', name: 'Living room', host: 'demo-living', protocol: 'legacy', kind: 'aircon', group: 'Downstairs', icon: 'sofa', order: 0 },
  { id: 'demo-office', name: 'Office', host: 'demo-office', protocol: 'legacy', kind: 'aircon', group: 'Downstairs', icon: 'desk', order: 1 },
  { id: 'demo-bedroom', name: 'Bedroom', host: 'demo-bedroom', protocol: 'legacy', kind: 'aircon', group: 'Upstairs', icon: 'bed', order: 2 },
  { id: 'demo-purifier', name: 'Air purifier', host: 'demo-purifier', protocol: 'legacy', kind: 'cleaner', group: 'Upstairs', icon: 'leaf', order: 3 },
];

function safeGet(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<AppState>) : {};
  } catch {
    return {};
  }
}

const saved = safeGet();

let state: AppState = {
  settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
  units: saved.units ?? [],
  groups: saved.groups ?? [],
  scenes: saved.scenes ?? [],
  runtime: {},
  toasts: [],
  uuid: saved.uuid ?? newUuid(),
  platform: 'web',
  cloudSignedIn: false,
};

const listeners = new Set<() => void>();

function persist() {
  try {
    const { settings, units, groups, scenes, uuid } = state;
    localStorage.setItem(KEY, JSON.stringify({ settings, units, groups, scenes, uuid }));
  } catch {
    /* storage unavailable (private mode) – keep working in memory */
  }
}

export function getState() {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if ('settings' in p || 'units' in p || 'groups' in p || 'scenes' in p) persist();
  listeners.forEach((l) => l());
}

export function useApp<T>(selector: (s: AppState) => T): T {
  // Cache per store snapshot: selectors may build new arrays/objects, which would otherwise
  // make useSyncExternalStore re-render forever.
  const cache = useRef<{ state?: AppState; fn?: unknown; value?: T }>({});
  const sel = useRef(selector);
  sel.current = selector;
  const get = useCallback(() => {
    if (cache.current.state !== state || cache.current.fn !== sel.current) {
      cache.current = { state, fn: sel.current, value: sel.current(state) };
    }
    return cache.current.value as T;
  }, []);
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    get,
    get,
  );
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
  if ('bridgeUrl' in patch || 'bridgeToken' in patch) rebuildTransport();
}

// ------------------------------------------------------------------ transport & units

export const simulator = new SimulatorTransport();
let transport: RoutingTransport;
let cloud: CloudClient | undefined;
const units = new Map<string, DaikinUnit>();

export function rebuildTransport() {
  const t = createTransport({ bridgeUrl: state.settings.bridgeUrl, bridgeToken: state.settings.bridgeToken }, simulator);
  transport = t.transport;
  units.clear();
  setState({ platform: t.runtime });
}
rebuildTransport();

export function getTransport() {
  return transport;
}

export function getCloud(): CloudClient {
  if (!cloud) {
    cloud = new CloudClient(transport, state.uuid, {
      clientId: state.settings.cloudClientId,
      clientSecret: state.settings.cloudClientSecret,
    });
  }
  return cloud;
}

export function resetCloud() {
  cloud = undefined;
}

export function visibleUnits(s: AppState = state): UnitConfig[] {
  const list = s.settings.demo ? [...s.units.filter((u) => !u.host.startsWith('demo')), ...DEMO_UNITS.map((d) => s.units.find((u) => u.id === d.id) ?? d)] : s.units.filter((u) => !u.host.startsWith('demo'));
  return [...list].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}

export function unitById(id: string): UnitConfig | undefined {
  return visibleUnits().find((u) => u.id === id);
}

export function getUnit(id: string): DaikinUnit | undefined {
  const cfg = unitById(id);
  if (!cfg) return undefined;
  const cached = units.get(id);
  if (cached && JSON.stringify(cached.config) === JSON.stringify(cfg)) return cached;
  const away = state.settings.location === 'away' && state.cloudSignedIn && cfg.protocol === 'dsiot';
  const u = new DaikinUnit(cfg, { transport, uuid: state.uuid, cloud: away ? { client: getCloud(), edgeId: cfg.edgeId ?? cfg.mac } : undefined });
  units.set(id, u);
  return u;
}

function setRuntime(id: string, patch: Partial<UnitRuntime>) {
  setState((s) => ({ runtime: { ...s.runtime, [id]: { ...(s.runtime[id] ?? { loading: false }), ...patch } } }));
}

export function errorText(e: unknown): string {
  const err = e as Error;
  return err?.message || String(e);
}

export async function refreshUnit(id: string, quiet = false) {
  const u = getUnit(id);
  if (!u) return;
  if (!quiet) setRuntime(id, { loading: true });
  try {
    const snap = await u.refresh();
    const prev = state.runtime[id]?.snap;
    setRuntime(id, { snap, error: undefined, loading: false, seen: Date.now() });
    if (state.settings.alerts && snap.state.errorCode && snap.state.errorCode !== prev?.state.errorCode) {
      toast(`${u.config.name}: unit reports error ${snap.state.errorCode}`, 'error');
      notifyNative(`${u.config.name} reports error ${snap.state.errorCode}`);
    }
  } catch (e) {
    setRuntime(id, { error: errorText(e), loading: false });
  }
}

export async function refreshAll(quiet = false) {
  await Promise.all(visibleUnits().map((u) => refreshUnit(u.id, quiet)));
}

/** Optimistic control: update UI immediately, roll back on failure. */
export async function control(id: string, change: StateChange) {
  const u = getUnit(id);
  if (!u) return;
  const prev = state.runtime[id]?.snap;
  if (prev) {
    const optimistic = { ...prev, state: { ...prev.state, ...change, updatedAt: Date.now() } };
    setRuntime(id, { snap: optimistic as Snapshot });
  }
  try {
    const snap = await u.setState(change);
    setRuntime(id, { snap, error: undefined, seen: Date.now() });
  } catch (e) {
    if (prev) setRuntime(id, { snap: prev });
    toast(`${u.config.name}: ${errorText(e)}`, 'error');
  }
}

export async function special(id: string, kind: SpecialMode, on: boolean) {
  const u = getUnit(id);
  if (!u) return;
  try {
    const snap = await u.setSpecialMode(kind, on);
    setRuntime(id, { snap, error: undefined });
  } catch (e) {
    toast(`${u.config.name}: ${errorText(e)}`, 'error');
  }
}

export async function allOff(ids = visibleUnits().map((u) => u.id)) {
  await Promise.all(ids.map((id) => control(id, { power: false })));
  toast('All units switched off', 'success');
}

export async function runScene(scene: Scene) {
  for (const a of scene.actions) {
    await control(a.unitId, a.change);
    for (const [k, v] of Object.entries(a.special ?? {})) await special(a.unitId, k as SpecialMode, Boolean(v));
  }
  toast(`Scene “${scene.name}” applied`, 'success');
}

// ------------------------------------------------------------------ unit config editing

export function addUnit(cfg: UnitConfig) {
  setState((s) => ({ units: [...s.units.filter((u) => u.id !== cfg.id), { ...cfg, order: cfg.order ?? s.units.length }] }));
  void refreshUnit(cfg.id);
}

export function updateUnit(id: string, patch: Partial<UnitConfig>) {
  setState((s) => {
    const exists = s.units.some((u) => u.id === id);
    const base = exists ? s.units : [...s.units, ...DEMO_UNITS.filter((d) => d.id === id)];
    return { units: base.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
  });
}

export function removeUnit(id: string) {
  setState((s) => {
    const runtime = { ...s.runtime };
    delete runtime[id];
    return { units: s.units.filter((u) => u.id !== id), runtime };
  });
  units.delete(id);
}

// ------------------------------------------------------------------ toasts

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', action?: Toast['action']) {
  const t = { id: toastId++, text, kind, action };
  setState((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), kind === 'error' ? 6000 : 3500);
}

function notifyNative(body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification('Remo', { body, icon: './icon-192.png' });
    }
  } catch {
    /* notifications unsupported */
  }
}

// ------------------------------------------------------------------ backup / restore

export function exportBackup(): string {
  const { settings, units, groups, scenes } = state;
  const clean = { ...settings, cloudClientSecret: '', bridgeToken: '' };
  return JSON.stringify({ app: 'remo', version: 1, exportedAt: new Date().toISOString(), settings: clean, units, groups, scenes }, null, 2);
}

export function importBackup(text: string) {
  const data = JSON.parse(text) as { app?: string; settings?: Partial<Settings>; units?: UnitConfig[]; groups?: string[]; scenes?: Scene[] };
  if (data.app !== 'remo' || !Array.isArray(data.units)) throw new Error('Not a Remo backup file');
  setState((s) => ({
    settings: { ...s.settings, ...(data.settings ?? {}), cloudClientSecret: s.settings.cloudClientSecret, bridgeToken: s.settings.bridgeToken },
    units: data.units!,
    groups: data.groups ?? [],
    scenes: data.scenes ?? [],
  }));
  units.clear();
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
