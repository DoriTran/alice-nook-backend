import { isJsonValue, JSON_MAX_DEPTH, JSON_MAX_BYTES } from './diary-json';

describe('isJsonValue', () => {
  it('accepts plain JSON including nested objects and arrays', () => {
    expect(
      isJsonValue({
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { ext: true } }],
      }),
    ).toBe(true);
    expect(isJsonValue([null, 'a', 1, false])).toBe(true);
  });

  it('rejects functions, bigint, class instances, NaN, and Infinity', () => {
    expect(isJsonValue(() => undefined)).toBe(false);
    expect(isJsonValue(1n)).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);
    expect(isJsonValue(new Map())).toBe(false);
    expect(isJsonValue(Number.NaN)).toBe(false);
    expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('rejects circular objects', () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(isJsonValue(value)).toBe(false);
  });

  it('rejects excessive depth', () => {
    let nested: unknown = { type: 'doc' };
    for (let index = 0; index < JSON_MAX_DEPTH + 2; index += 1) {
      nested = { child: nested };
    }

    expect(isJsonValue(nested)).toBe(false);
  });

  it('rejects excessive payload size', () => {
    expect(isJsonValue('x'.repeat(JSON_MAX_BYTES + 1))).toBe(false);
  });
});
