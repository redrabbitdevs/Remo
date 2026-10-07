/** Parse the legacy Daikin "key=value,key=value" response body. */
export function parseKV(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.trim().split(',')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return out;
}

/** Daikin percent-encodes every byte of names/SSIDs ("%4c%69%76%69%6e%67"). */
export function decodeDaikinString(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Encode a string the way the official app does: every UTF-8 byte as %XX. */
export function encodeDaikinString(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((b) => '%' + b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build a query string. Values that are already %-encoded by `encodeDaikinString`
 * must be passed through `raw` so they are not double encoded.
 */
export function buildQuery(params: Record<string, string | number | undefined>, raw: string[] = []): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const s = String(v);
    parts.push(`${encodeURIComponent(k)}=${raw.includes(k) ? s : encodeURIComponent(s)}`);
  }
  return parts.join('&');
}

/** Slash separated numeric list ("1/2/3") → numbers (non numeric → 0). */
export function slashList(value: string | undefined): number[] {
  if (!value) return [];
  return value.split('/').map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
}

export function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '' || value === '-' || value === '--') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function hexToInt(hex: string): number {
  return parseInt(hex, 16);
}

/** Little-endian signed hex ("0D00", "F6FF") → integer. */
export function hexLeToInt(hex: string, signed = true): number {
  const bytes = hex.match(/../g) ?? [];
  let value = 0;
  for (let i = bytes.length - 1; i >= 0; i--) value = value * 256 + parseInt(bytes[i]!, 16);
  if (signed && bytes.length > 0) {
    const max = 2 ** (8 * bytes.length);
    if (value >= max / 2) value -= max;
  }
  return value;
}

export function intToHex(value: number, bytes = 1): string {
  return (value & (2 ** (8 * bytes) - 1)).toString(16).toUpperCase().padStart(bytes * 2, '0');
}

export function hexToAscii(hex: string): string {
  const bytes = hex.match(/../g) ?? [];
  return bytes
    .map((b) => String.fromCharCode(parseInt(b, 16)))
    .join('')
    .replace(/\0/g, '')
    .trim();
}

export function newUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}
