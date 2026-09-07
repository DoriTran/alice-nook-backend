import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type LinkPreviewMetadata = {
  url: string;
  normalizedUrl: string;
  hostname: string;
  siteName?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  faviconUrl?: string;
  fetchedAt: string;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 250;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_OEMBED_BYTES = 128 * 1024;
const MAX_REDIRECTS = 4;

type CacheEntry = { expiresAt: number; metadata: LinkPreviewMetadata };

type OEmbedMetadata = {
  title?: string;
  providerName?: string;
  authorName?: string;
  thumbnailUrl?: string;
};

const decodeHtml = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

const parseAttributes = (tag: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(tag))) {
    result[match[1].toLowerCase()] = decodeHtml(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }

  return result;
};

const readMetadata = (html: string): Map<string, string> => {
  const values = new Map<string, string>();

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = (attributes.property ?? attributes.name)?.toLowerCase();
    if (key && attributes.content && !values.has(key)) {
      values.set(key, attributes.content);
    }
  }

  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (title) {
    values.set('html:title', decodeHtml(title.replace(/<[^>]+>/g, '')));
  }

  return values;
};

const toAbsoluteHttpUrl = (
  value: string | undefined,
  base: URL,
): string | undefined => {
  if (!value || value.length > 4096) return undefined;
  try {
    const resolved = new URL(value, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.href
      : undefined;
  } catch {
    return undefined;
  }
};

const clip = (value: string | undefined, length: number): string | undefined =>
  value ? value.slice(0, length) : undefined;

const readLimitedText = async (
  response: Response,
  maxBytes: number,
  stopAfterHead = false,
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) throw new BadGatewayException('Link preview is empty');

  const decoder = new TextDecoder();
  let result = '';
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new BadGatewayException('Link preview response is too large');
    }
    result += decoder.decode(value, { stream: true });
    if (stopAfterHead && /<\/head\s*>/i.test(result)) {
      await reader.cancel();
      break;
    }
  }
  return result + decoder.decode();
};

const findFavicon = (html: string, base: URL): string | undefined => {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (
      attributes.rel?.toLowerCase().split(/\s+/).includes('icon') &&
      attributes.href
    ) {
      return toAbsoluteHttpUrl(attributes.href, base);
    }
  }
  return toAbsoluteHttpUrl('/favicon.ico', base);
};

const findOEmbedEndpoint = (html: string, base: URL): URL | undefined => {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const rel = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
    const type = attributes.type?.toLowerCase();
    if (
      rel.includes('alternate') &&
      type === 'application/json+oembed' &&
      attributes.href
    ) {
      const href = toAbsoluteHttpUrl(attributes.href, base);
      if (href) return new URL(href);
    }
  }
  return undefined;
};

const getKnownOEmbedEndpoint = (pageUrl: URL): URL | undefined => {
  const hostname = pageUrl.hostname.toLowerCase().replace(/^www\./, '');
  if (
    hostname !== 'youtube.com' &&
    hostname !== 'm.youtube.com' &&
    hostname !== 'youtu.be'
  ) {
    return undefined;
  }

  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('url', pageUrl.href);
  return endpoint;
};

const isPrivateIpv4 = (address: string): boolean => {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
    (a === 198 && b !== undefined && b >= 18 && b <= 19) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    (a !== undefined && a >= 224)
  );
};

const isPrivateIp = (address: string): boolean => {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice(7));
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('2001:db8')
  );
};

const normalizeUrl = (input: string): URL => {
  const value = input.trim();
  const candidate = /^www\./i.test(value) ? `https://${value}` : value;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new BadRequestException('URL is invalid');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new BadRequestException('Only public HTTP(S) URLs are supported');
  }
  url.hash = '';
  return url;
};

@Injectable()
export class LinkPreviewService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<LinkPreviewMetadata>>();

  async resolve(input: string): Promise<LinkPreviewMetadata> {
    const url = normalizeUrl(input);
    const cached = this.cache.get(url.href);
    if (cached && cached.expiresAt > Date.now()) return cached.metadata;

    const pending = this.inFlight.get(url.href);
    if (pending) return pending;

    const request = this.fetchMetadata(url).finally(() => {
      this.inFlight.delete(url.href);
    });
    this.inFlight.set(url.href, request);

    const metadata = await request;
    this.cache.set(url.href, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      metadata,
    });
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
    return metadata;
  }

  private async assertPublicHost(url: URL): Promise<void> {
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new BadRequestException('Private network URLs are not supported');
    }

    let addresses: { address: string }[];
    try {
      addresses = isIP(hostname)
        ? [{ address: hostname }]
        : await lookup(hostname, { all: true });
    } catch {
      throw new BadGatewayException('Link preview host could not be resolved');
    }
    if (
      !addresses.length ||
      addresses.some(({ address }) => isPrivateIp(address))
    ) {
      throw new BadRequestException('Private network URLs are not supported');
    }
  }

  private async safePublicAssetUrl(
    value: string | undefined,
    base: URL,
  ): Promise<string | undefined> {
    const resolved = toAbsoluteHttpUrl(value, base);
    if (!resolved) return undefined;

    try {
      await this.assertPublicHost(new URL(resolved));
      return resolved;
    } catch {
      return undefined;
    }
  }

  private async fetchOEmbed(
    endpoint: URL,
    pageUrl: URL,
  ): Promise<OEmbedMetadata | undefined> {
    try {
      let url = endpoint;
      let response: Response | undefined;
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        await this.assertPublicHost(url);
        response = await fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(5000),
          headers: {
            Accept: 'application/json',
            'User-Agent': 'AliceNook-LinkPreview/1.0',
          },
        });
        if (response.status < 300 || response.status >= 400) break;

        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) return undefined;
        url = normalizeUrl(new URL(location, url).href);
      }
      if (!response?.ok) return undefined;

      const raw = JSON.parse(
        await readLimitedText(response, MAX_OEMBED_BYTES),
      ) as Record<string, unknown>;
      const readString = (key: string): string | undefined =>
        typeof raw[key] === 'string' ? raw[key] : undefined;
      const thumbnailUrl = await this.safePublicAssetUrl(
        readString('thumbnail_url'),
        pageUrl,
      );

      return {
        title: clip(readString('title'), 300),
        providerName: clip(readString('provider_name'), 100),
        authorName: clip(readString('author_name'), 100),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    } catch {
      return undefined;
    }
  }

  private async fetchMetadata(initialUrl: URL): Promise<LinkPreviewMetadata> {
    const knownOEmbedEndpoint = getKnownOEmbedEndpoint(initialUrl);
    const knownOEmbed = knownOEmbedEndpoint
      ? await this.fetchOEmbed(knownOEmbedEndpoint, initialUrl)
      : undefined;
    if (knownOEmbed?.title) {
      return {
        url: initialUrl.href,
        normalizedUrl: initialUrl.href,
        hostname: initialUrl.hostname.replace(/^www\./i, ''),
        ...(knownOEmbed.providerName
          ? { siteName: knownOEmbed.providerName }
          : {}),
        title: knownOEmbed.title,
        ...(knownOEmbed.authorName
          ? { description: knownOEmbed.authorName }
          : {}),
        ...(knownOEmbed.thumbnailUrl
          ? { imageUrl: knownOEmbed.thumbnailUrl }
          : {}),
        fetchedAt: new Date().toISOString(),
      };
    }

    let url = initialUrl;

    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await this.assertPublicHost(url);
      let response: Response;
      try {
        response = await fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(7000),
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'AliceNook-LinkPreview/1.0',
          },
        });
      } catch {
        throw new BadGatewayException('Link preview could not be loaded');
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) {
          throw new BadGatewayException('Link preview redirect failed');
        }
        url = normalizeUrl(new URL(location, url).href);
        continue;
      }

      if (!response.ok) {
        throw new BadGatewayException('Link preview could not be loaded');
      }
      const type = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (
        !type.includes('text/html') &&
        !type.includes('application/xhtml+xml')
      ) {
        throw new BadGatewayException('Link preview is not an HTML page');
      }

      const html = await readLimitedText(response, MAX_HTML_BYTES, true);
      const values = readMetadata(html);
      const discoveredOEmbedEndpoint = findOEmbedEndpoint(html, url);
      const oEmbed =
        discoveredOEmbedEndpoint &&
        (!values.get('og:title') || !values.get('og:image'))
          ? await this.fetchOEmbed(discoveredOEmbedEndpoint, url)
          : undefined;
      const title = clip(
        values.get('og:title') ??
          values.get('twitter:title') ??
          oEmbed?.title ??
          values.get('html:title'),
        300,
      );
      const description = clip(
        values.get('og:description') ??
          values.get('twitter:description') ??
          values.get('description'),
        500,
      );
      const image =
        values.get('og:image') ??
        values.get('twitter:image') ??
        oEmbed?.thumbnailUrl;
      const imageUrl = await this.safePublicAssetUrl(image, url);
      const faviconUrl = await this.safePublicAssetUrl(
        findFavicon(html, url),
        url,
      );

      return {
        url: initialUrl.href,
        normalizedUrl: url.href,
        hostname: url.hostname.replace(/^www\./i, ''),
        ...(clip(values.get('og:site_name') ?? oEmbed?.providerName, 100)
          ? {
              siteName: clip(
                values.get('og:site_name') ?? oEmbed?.providerName,
                100,
              ),
            }
          : {}),
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(faviconUrl ? { faviconUrl } : {}),
        fetchedAt: new Date().toISOString(),
      };
    }

    throw new BadGatewayException('Link preview could not be loaded');
  }
}
