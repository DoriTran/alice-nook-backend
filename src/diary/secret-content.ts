import { BadRequestException } from '@nestjs/common';
import type {
  SecretCryptoService,
  SecretPayload,
} from './secret-crypto.service';

type JsonRecord = Record<string, unknown>;
const SECRET_TYPES = new Set(['secretContentInline', 'secretContentBlock']);
const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertSecretFragment = (fragment: unknown) => {
  if (!isRecord(fragment) || fragment.type !== 'doc')
    throw new BadRequestException('Secret fragment is invalid');
  let forbidden = false;
  const visit = (node: unknown, insideCopy = false) => {
    if (!isRecord(node)) return;
    if (SECRET_TYPES.has(String(node.type))) forbidden = true;
    const copy =
      node.type === 'contentCopyInline' || node.type === 'contentCopyBlock';
    if (copy && insideCopy) forbidden = true;
    if (
      Array.isArray(node.marks) &&
      node.marks.some((mark) => isRecord(mark) && mark.type === 'contentCopy')
    )
      forbidden = true;
    if (Array.isArray(node.content))
      node.content.forEach((child) => visit(child, insideCopy || copy));
  };
  visit(fragment);
  if (forbidden)
    throw new BadRequestException('Special Content cannot be nested');
};

const visibleText = (node: unknown): string => {
  if (!isRecord(node)) return '';
  if (typeof node.text === 'string') return node.text;
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  if (node.type === 'contentTag')
    return typeof attrs.label === 'string' ? `#${attrs.label}` : '#';
  if (node.type === 'contentReference')
    return typeof attrs.fallbackLabel === 'string'
      ? `@${attrs.fallbackLabel}`
      : '@';
  if (node.type === 'emoji')
    return typeof attrs.value === 'string' ? attrs.value : '';
  if (node.type === 'hardBreak') return '\n';
  if (!Array.isArray(node.content)) return '';
  const separator = node.type === 'doc' ? '\n' : '';
  return node.content.map(visibleText).join(separator);
};

export const graphemeLength = (fragment: unknown): number => {
  const value = visibleText(fragment);
  if (typeof Intl.Segmenter === 'function')
    return [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
        value,
      ),
    ].length;
  return Array.from(value).length;
};

export const containsSecretContent = (content: unknown): boolean => {
  let found = false;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value) || found) return;
    if (SECRET_TYPES.has(String(value.type))) {
      found = true;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(content);
  return found;
};

export const materializeSecrets = (
  content: unknown,
  payloads: SecretPayload[] | undefined,
  crypto: SecretCryptoService,
  currentContent?: unknown,
): unknown => {
  const byId = new Map((payloads ?? []).map((item) => [item.secretId, item]));
  const used = new Set<string>();
  const existing = new Map<string, string>();
  const collectExisting = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collectExisting);
      return;
    }
    if (!isRecord(value)) return;
    if (SECRET_TYPES.has(String(value.type)) && isRecord(value.attrs)) {
      if (typeof value.attrs.secretId === 'string')
        existing.set(value.attrs.secretId, JSON.stringify(value.attrs));
      return;
    }
    Object.values(value).forEach(collectExisting);
  };
  collectExisting(currentContent);
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!isRecord(value)) return value;
    if (SECRET_TYPES.has(String(value.type))) {
      const attrs = isRecord(value.attrs) ? value.attrs : {};
      const secretId = typeof attrs.secretId === 'string' ? attrs.secretId : '';
      const payload = byId.get(secretId);
      if (payload) {
        assertSecretFragment(payload.fragment);
        used.add(secretId);
        return {
          type: value.type,
          attrs: crypto.encrypt(
            payload.fragment,
            secretId,
            graphemeLength(payload.fragment),
          ),
        };
      }
      if (
        attrs.version !== 1 ||
        attrs.keyVersion !== 1 ||
        typeof attrs.ciphertext !== 'string' ||
        typeof attrs.iv !== 'string' ||
        typeof attrs.authTag !== 'string'
      )
        throw new BadRequestException('Secret content requires encryption');
      if (existing.get(secretId) !== JSON.stringify(attrs))
        throw new BadRequestException(
          'Secret ciphertext is not owned by this message',
        );
      return { type: value.type, attrs: { ...attrs } };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item)]),
    );
  };
  const result = visit(content);
  if (used.size !== byId.size)
    throw new BadRequestException('Unused Secret payload');
  return result;
};

export const hydrateSecrets = (
  content: unknown,
  crypto: SecretCryptoService,
): Record<string, unknown> => {
  const hydration: Record<string, unknown> = {};
  if (!crypto.enabled) return hydration;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (SECRET_TYPES.has(String(value.type)) && isRecord(value.attrs)) {
      const id = value.attrs.secretId;
      if (typeof id === 'string' && id) {
        try {
          hydration[id] = crypto.decrypt(value.attrs);
        } catch {
          // Keep this individual Secret unavailable; never expose crypto detail.
        }
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(content);
  return hydration;
};
