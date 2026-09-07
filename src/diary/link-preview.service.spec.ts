import { BadRequestException } from '@nestjs/common';

import { LinkPreviewService } from './link-preview.service';

describe('LinkPreviewService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('parses metadata and keeps remote image URLs unchanged', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response(
          '<html><head>' +
            '<meta property="og:site_name" content="Alice Video">' +
            '<meta property="og:title" content="Cozy desk">' +
            '<meta name="description" content="A tiny nook">' +
            '<meta property="og:image" content="http://93.184.216.34/image.jpg">' +
            '<link rel="icon" href="/favicon.png">' +
            '</head></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        ),
      );
    global.fetch = fetchMock;
    const service = new LinkPreviewService();

    const result = await service.resolve('http://93.184.216.34/page');

    expect(result).toMatchObject({
      siteName: 'Alice Video',
      title: 'Cozy desk',
      description: 'A tiny nook',
      imageUrl: 'http://93.184.216.34/image.jpg',
      faviconUrl: 'http://93.184.216.34/favicon.png',
    });
    await service.resolve('http://93.184.216.34/page');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses YouTube oEmbed metadata without downloading the thumbnail', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: 'A cozy video',
          author_name: 'Alice Channel',
          provider_name: 'YouTube',
          thumbnail_url: 'https://i.ytimg.com/vi/example/hqdefault.jpg',
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock;
    const service = new LinkPreviewService();
    (
      service as unknown as {
        assertPublicHost: (url: URL) => Promise<void>;
      }
    ).assertPublicHost = jest.fn().mockResolvedValue(undefined);

    const result = await service.resolve(
      'https://www.youtube.com/watch?v=example',
    );

    expect(result).toMatchObject({
      siteName: 'YouTube',
      title: 'A cozy video',
      description: 'Alice Channel',
      imageUrl: 'https://i.ytimg.com/vi/example/hqdefault.jpg',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'https://www.youtube.com/oembed',
    );
  });

  it.each([
    'http://127.0.0.1/private',
    'http://10.0.0.1/private',
    'http://[::1]/private',
  ])('rejects private target %s', async (url) => {
    global.fetch = jest.fn();
    const service = new LinkPreviewService();

    await expect(service.resolve(url)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
