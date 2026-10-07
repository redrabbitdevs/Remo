/**
 * Picks the right Transport for the runtime:
 *  - Windows app (Electron)  → window.remoNative (IPC to Node main process)
 *  - Android app (Capacitor) → native "DaikinNet" plugin
 *  - Browser                 → Remo bridge (same origin when served by it, or a configured URL)
 *  - Always                  → demo-* hosts are answered by the built-in simulator
 */
import {
  BridgeTransport,
  RoutingTransport,
  SimulatorTransport,
  TransportError,
  type DiscoveredAdapter,
  type HttpRequest,
  type HttpResponse,
  type Transport,
} from '@remo/core';

export type Runtime = 'desktop' | 'android' | 'web';

interface NativeBridge {
  request(req: HttpRequest): Promise<HttpResponse & { error?: string; code?: TransportError['code'] }>;
  discover(timeoutMs?: number): Promise<DiscoveredAdapter[]>;
  platform?: string;
  version?: string;
  openExternal?(url: string): void;
  setTray?(state: { units: { id: string; name: string; on: boolean }[] }): void;
  onTrayAction?(cb: (action: string, id?: string) => void): void;
  setAutoLaunch?(enabled: boolean): Promise<boolean>;
}

interface CapacitorPlugin {
  request(req: HttpRequest): Promise<HttpResponse>;
  discover(opts: { timeoutMs: number }): Promise<{ devices: DiscoveredAdapter[] }>;
}

declare global {
  interface Window {
    remoNative?: NativeBridge;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: Record<string, unknown>;
      registerPlugin?: <T>(name: string) => T;
    };
  }
}

export function detectRuntime(): Runtime {
  if (typeof window !== 'undefined' && window.remoNative) return 'desktop';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return 'android';
  return 'web';
}

class NativeTransport implements Transport {
  readonly kind = 'desktop';
  constructor(private readonly n: NativeBridge) {}
  async request(req: HttpRequest): Promise<HttpResponse> {
    const r = await this.n.request(req);
    if (r.error) throw new TransportError(r.error, r.code ?? 'network');
    return r;
  }
  discover(timeoutMs?: number) {
    return this.n.discover(timeoutMs);
  }
}

class CapacitorTransport implements Transport {
  readonly kind = 'android';
  private plugin: CapacitorPlugin;
  constructor() {
    const cap = window.Capacitor!;
    this.plugin = (cap.Plugins?.DaikinNet as CapacitorPlugin) ?? cap.registerPlugin!<CapacitorPlugin>('DaikinNet');
  }
  async request(req: HttpRequest): Promise<HttpResponse> {
    try {
      return await this.plugin.request(req);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      throw new TransportError(msg, /timed? ?out/i.test(msg) ? 'timeout' : 'network');
    }
  }
  async discover(timeoutMs = 3000) {
    return (await this.plugin.discover({ timeoutMs })).devices;
  }
}

export interface PlatformOptions {
  bridgeUrl?: string;
  bridgeToken?: string;
}

export function createTransport(opts: PlatformOptions, sim: SimulatorTransport): { transport: RoutingTransport; runtime: Runtime; real?: Transport } {
  const runtime = detectRuntime();
  let real: Transport | undefined;
  if (runtime === 'desktop') real = new NativeTransport(window.remoNative!);
  else if (runtime === 'android') real = new CapacitorTransport();
  else {
    const url = opts.bridgeUrl?.trim() || (location.protocol.startsWith('http') ? location.origin + location.pathname.replace(/\/[^/]*$/, '') : '');
    if (url) real = new BridgeTransport(url, opts.bridgeToken);
  }
  return { transport: new RoutingTransport(real, sim), runtime, real };
}

/** Is a bridge reachable (web runtime only)? */
export async function probeBridge(opts: PlatformOptions): Promise<boolean> {
  const url = opts.bridgeUrl?.trim() || location.origin + location.pathname.replace(/\/[^/]*$/, '');
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/health`, { cache: 'no-store' });
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: boolean };
    return Boolean(j.ok);
  } catch {
    return false;
  }
}

export function openExternal(url: string) {
  if (window.remoNative?.openExternal) window.remoNative.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
