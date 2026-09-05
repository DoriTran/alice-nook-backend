export const JSON_MAX_DEPTH = 32;
export const JSON_MAX_NODES = 20_000;
export const JSON_MAX_BYTES = 524_288;
export const RICH_TEXT_PREVIEW_MAX_LENGTH = 20_000;

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isJsonValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
  counters: { nodes: number; bytes: number } = { nodes: 0, bytes: 0 },
): boolean {
  if (depth > JSON_MAX_DEPTH) {
    return false;
  }

  counters.nodes += 1;
  if (counters.nodes > JSON_MAX_NODES || counters.bytes > JSON_MAX_BYTES) {
    return false;
  }

  if (value === null) {
    counters.bytes += 4;
    return true;
  }

  if (typeof value === 'string') {
    counters.bytes += Buffer.byteLength(value, 'utf8');
    return counters.bytes <= JSON_MAX_BYTES;
  }

  if (typeof value === 'boolean') {
    counters.bytes += 4;
    return true;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return false;
    }

    counters.bytes += 8;
    return true;
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  if (Array.isArray(value)) {
    seen.add(value);
    return value.every((item) => isJsonValue(item, depth + 1, seen, counters));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  seen.add(value);

  return Object.entries(value).every(
    ([key, nested]) =>
      typeof key === 'string' && isJsonValue(nested, depth + 1, seen, counters),
  );
}
