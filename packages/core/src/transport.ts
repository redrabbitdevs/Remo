/**
 * Transport abstraction.
 *
 * Daikin adapters live on the local network and speak plain HTTP (BRP069/BRP072A),
 * HTTPS with a self-signed certificate (BRP072C), or JSON over HTTP (BRP084, firmware ≥ 2.8).
 * Browsers cannot reach them directly (CORS, mixed content, self-signed TLS), so every
 * platform supplies its own transport:
 *
 *  - Web (browser)  → BridgeTransport: talks to the small Remo bridge server on the LAN.
 *  - Windows        → Electron main process via IPC (Node http/https + UDP).
 *  - Android        → Capacitor native plugin (OkHttp-free HttpURLConnection + UDP).
 *  - Demo / tests   → SimulatorTransport: an in-memory fake adapter.
 */

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** Accept self-signed / legacy TLS (needed for BRP072C adapters on the LAN). */
  insecureTls?: boolean;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

export interface DiscoveredAdapter {
  /** IP address the adapter answered from. */
  ip: string;
  /** Raw key/value pairs from the `basic_info` broadcast answer. */
  info: Record<string, string>;
}

export interface Transport {
  readonly kind: string;
  request(req: HttpRequest): Promise<HttpResponse>;
  /**
   * UDP broadcast discovery ("DAIKIN_UDP/common/basic_info" → port 30050).
   * Transports that cannot send UDP (pure browser) return `undefined`.
   */
  discover?(timeoutMs?: number): Promise<DiscoveredAdapter[]>;
}

export class TransportError extends Error {
  constructor(
    message: string,
    public readonly code: 'timeout' | 'network' | 'http' | 'auth' | 'protocol' | 'unsupported' = 'network',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

/** Generic fetch-based transport (used by the web bridge client and in Node tests). */
export class FetchTransport implements Transport {
  readonly kind = 'fetch';
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 8000);
    try {
      const res = await this.fetchImpl(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: ctrl.signal,
      });
      return { status: res.status, body: await res.text() };
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new TransportError('Request timed out', 'timeout');
      throw new TransportError((err as Error).message || 'Network error', 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Talks to the Remo bridge (apps/bridge) which relays requests to the LAN.
 * The bridge exposes POST /api/request and GET /api/discover.
 */
export class BridgeTransport implements Transport {
  readonly kind = 'bridge';
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.token) h['authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/api/request`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(req),
      });
    } catch (err) {
      throw new TransportError(`Bridge unreachable: ${(err as Error).message}`, 'network');
    }
    if (res.status === 401) throw new TransportError('Bridge rejected the access token', 'auth', 401);
    const json = (await res.json()) as HttpResponse & { error?: string; code?: TransportError['code'] };
    if (json.error) throw new TransportError(json.error, json.code ?? 'network');
    return json;
  }

  async discover(timeoutMs = 3000): Promise<DiscoveredAdapter[]> {
    const res = await this.fetchImpl(
      `${this.baseUrl.replace(/\/$/, '')}/api/discover?timeout=${timeoutMs}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new TransportError('Discovery failed', 'http', res.status);
    return (await res.json()) as DiscoveredAdapter[];
  }
}
