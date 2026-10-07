/**
 * "Out-of-Home" (remote) access through Daikin's cloud, as used by the official app.
 *
 * Two generations exist:
 *  - GPF / dsiot cloud (proddit.ditdeneb.com): OAuth password grant at /premise/dsiot/login,
 *    then JSON multireq at /dsiot/multireq with `to: /dsiot/edges/<edgeId>/…`.
 *  - Daikin Online Controller (sha2.daikinonlinecontroller.com): form login at /common/login,
 *    then the legacy key=value API relayed through the server with `port=<assigned port>`.
 *
 * The OAuth client id/secret that the official app embeds belong to Daikin and are NOT shipped
 * with Remo – the user supplies them in Settings → Out-of-Home (or at build time through
 * VITE_DAIKIN_CLIENT_ID / VITE_DAIKIN_CLIENT_SECRET).
 */
import { TransportError, type Transport } from './transport';
import { parseKV } from './util';

export const CLOUD_HOSTS = {
  gpf: 'proddit.ditdeneb.com',
  gpfDemo: 'scr.dspsph.com',
  gpfEnergy: 'proddit-energy.ditdeneb.com',
  online: 'sha2.daikinonlinecontroller.com',
} as const;

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  idToken?: string;
  uid?: string;
  generation: 'gpf' | 'online';
}

export interface CloudCredentials {
  clientId: string;
  clientSecret: string;
}

export class CloudClient {
  session?: CloudSession;

  constructor(
    private readonly transport: Transport,
    private readonly uuid: string,
    private readonly creds?: CloudCredentials,
    private readonly host: string = CLOUD_HOSTS.gpf,
  ) {}

  private requireCreds(): CloudCredentials {
    if (!this.creds?.clientId || !this.creds.clientSecret) {
      throw new TransportError(
        'Out-of-Home needs the cloud API client id and secret (Settings → Out-of-Home).',
        'unsupported',
      );
    }
    return this.creds;
  }

  private async postJson(path: string, body: unknown, auth = false) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth) headers.authorization = `Bearer ${await this.accessToken()}`;
    const res = await this.transport.request({
      method: 'POST',
      url: `https://${this.host}${path}`,
      headers,
      body: JSON.stringify(body),
      timeoutMs: 15000,
    });
    let json: Record<string, unknown> = {};
    try {
      json = res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {};
    } catch {
      json = parseKV(res.body);
    }
    if (res.status === 401) throw new TransportError('Login rejected – check your ID and password', 'auth', 401);
    if (res.status >= 400) throw new TransportError(String(json.error ?? `Cloud error ${res.status}`), 'http', res.status);
    return json;
  }

  private store(json: Record<string, unknown>, generation: CloudSession['generation']): CloudSession {
    if (!json.access_token) throw new TransportError(String(json.error ?? 'Login failed'), 'auth');
    this.session = {
      accessToken: String(json.access_token),
      refreshToken: String(json.refresh_token ?? this.session?.refreshToken ?? ''),
      expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
      idToken: json.id_token ? String(json.id_token) : undefined,
      uid: json.uid ? String(json.uid) : undefined,
      generation,
    };
    return this.session;
  }

  /** GPF login (current cloud). */
  async login(userId: string, password: string): Promise<CloudSession> {
    const c = this.requireCreds();
    const json = await this.postJson('/premise/dsiot/login', {
      grant_type: 'password',
      user_id: userId,
      password,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      uuid: this.uuid,
    });
    return this.store(json, 'gpf');
  }

  /** Daikin Online Controller login (older adapters registered with an Out-of-Home ID). */
  async loginOnlineController(userId: string, password: string): Promise<CloudSession> {
    const body = new URLSearchParams({ grant_type: 'password', scope: 'smart_app', username: userId, password });
    const res = await this.transport.request({
      method: 'POST',
      url: `https://${CLOUD_HOSTS.online}/common/login`,
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Daikin-UID': this.uuid.replace(/-/g, '') },
      body: body.toString(),
      timeoutMs: 15000,
    });
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      json = parseKV(res.body);
    }
    return this.store(json, 'online');
  }

  async refresh(): Promise<CloudSession> {
    if (!this.session?.refreshToken) throw new TransportError('Not signed in', 'auth');
    const json = await this.postJson('/premise/dsiot/token', {
      grant_type: 'refresh_token',
      refresh_token: this.session.refreshToken,
    });
    return this.store(json, this.session.generation);
  }

  async accessToken(): Promise<string> {
    if (!this.session) throw new TransportError('Not signed in to Out-of-Home', 'auth');
    if (Date.now() > this.session.expiresAt - 60_000 && this.session.generation === 'gpf') await this.refresh();
    return this.session.accessToken;
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try {
      if (this.session.generation === 'gpf') {
        const c = this.requireCreds();
        await this.postJson('/premise/dsiot/logout', {
          client_id: c.clientId,
          client_secret: c.clientSecret,
          token: this.session.refreshToken,
        });
      }
    } finally {
      this.session = undefined;
    }
  }

  /** Cloud multireq. Local paths (/dsiot/edge/…) are rewritten to /dsiot/edges/<edgeId>/…. */
  async multireq(requests: { op: number; to: string; pc?: unknown }[], edgeId?: string) {
    const rewritten = requests.map((r) => ({
      ...r,
      to: edgeId ? r.to.replace(/^\/dsiot\/edge(\/|\.)/, `/dsiot/edges/${edgeId}$1`) : r.to,
    }));
    const json = (await this.postJson('/dsiot/multireq', { requests: rewritten }, true)) as {
      responses?: { fr: string; pc?: unknown; rsc?: number }[];
    };
    const responses = (json.responses ?? []).map((r) => ({
      ...r,
      fr: edgeId ? r.fr.replace(`/dsiot/edges/${edgeId}`, '/dsiot/edge') : r.fr,
    }));
    return { responses };
  }

  /** Units registered to the account. */
  async listEdges(): Promise<{ edgeId: string; name?: string; raw: unknown }[]> {
    const res = await this.multireq([{ op: 2, to: '/dsiot/edges' }]);
    const first = res.responses[0]?.pc as { pch?: { pn: string; pv?: unknown; pch?: { pn: string; pv?: unknown }[] }[] } | undefined;
    return (first?.pch ?? []).map((e) => ({
      edgeId: e.pn,
      name: e.pch?.find((c) => c.pn === 'name')?.pv as string | undefined,
      raw: e,
    }));
  }

  /** Remove a unit from the cloud account. */
  deleteEdge(edgeId: string) {
    return this.multireq([{ op: 4, to: `/dsiot/edges/${edgeId}` }]);
  }

  /** Push notification history ("Bills on demand" notices etc.). */
  notificationHistory() {
    return this.multireq([{ op: 2, to: '/dsiot/push_notification/history' }]);
  }

  closeAccount() {
    return this.multireq([{ op: 3, to: '/dsiot/account/close' }]);
  }
}
