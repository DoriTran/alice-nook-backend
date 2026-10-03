import {
  assertAttachments,
  assertLinkPreview,
  assertMessageContent,
  assertReactions,
  assertRichTextContent,
  assertTodoContent,
} from './diary-message-content';

const doc = {
  json: { type: 'doc', content: [{ type: 'paragraph', attrs: { ext: 1 } }] },
  preview: 'hello',
};

describe('message content guards', () => {
  const durableImage = {
    id: 'att:123e4567-e89b-42d3-a456-426614174000',
    type: 'image',
    name: 'tiny.png',
    mimeType: 'image/png',
    size: 68,
  };

  it('accepts canonical durable binary attachments without a URL', () => {
    expect(assertAttachments([durableImage])).toBeNull();
    expect(
      assertAttachments([
        {
          ...durableImage,
          type: 'video',
          name: 'clip.mp4',
          mimeType: 'video/mp4',
          size: 1024,
          duration: 1.5,
        },
        {
          ...durableImage,
          type: 'file',
          name: 'payload.bin',
          mimeType: 'application/octet-stream',
          size: 12,
        },
      ]),
    ).toBeNull();
  });

  it('rejects malformed or incomplete durable attachment shapes', () => {
    expect(assertAttachments([{ ...durableImage, id: 'att:not-a-uuid' }])).toBe(
      'durable attachment id is invalid',
    );
    expect(assertAttachments([{ id: 'anything', type: 'image' }])).toBe(
      'durable attachment id is invalid',
    );
  });

  it('keeps legacy and link URL contracts while rejecting transient URLs', () => {
    expect(
      assertAttachments([
        { id: 'legacy:image', type: 'image', url: '/dummy/image.png' },
      ]),
    ).toBeNull();
    expect(
      assertAttachments([
        { id: 'link:1', type: 'link', url: 'https://example.com' },
      ]),
    ).toBeNull();
    expect(assertAttachments([{ id: 'link:1', type: 'link' }])).toBe(
      'link attachment url is required',
    );
    expect(
      assertAttachments([
        { id: 'legacy:image', type: 'image', url: 'blob:temporary' },
      ]),
    ).toBe('legacy attachment url is invalid');
    expect(
      assertAttachments([
        { id: 'link:1', type: 'link', url: 'data:text/plain,nope' },
      ]),
    ).toBe('link attachment url is required');
  });

  it('uses the same durable attachment guard for todo items', () => {
    expect(
      assertTodoContent({
        items: [
          {
            id: 'todo:1',
            completed: false,
            content: doc,
            attachments: [durableImage],
          },
        ],
      }),
    ).toBeNull();
  });

  it('validates link preview state and metadata', () => {
    expect(
      assertLinkPreview({
        enabled: true,
        primaryUrl: 'www.example.com',
        normalizedUrl: 'https://www.example.com/',
        metadata: {
          url: 'https://www.example.com/',
          normalizedUrl: 'https://www.example.com/',
          hostname: 'example.com',
          imageUrl: 'https://cdn.example.com/preview.jpg',
          fetchedAt: '2026-09-07T00:00:00.000Z',
        },
      }),
    ).toBeNull();
    expect(
      assertLinkPreview({
        enabled: true,
        primaryUrl: 'https://example.com',
        normalizedUrl: 'https://example.com/',
        surprise: true,
      }),
    ).toBe('linkPreview contains unknown fields');
  });

  it('accepts a TipTap doc with extension attrs', () => {
    expect(assertRichTextContent(doc)).toBeNull();
    expect(assertMessageContent('text', doc)).toBeNull();
    expect(assertMessageContent('ai', doc)).toBeNull();
  });

  it('rejects empty todo items and duplicate item ids', () => {
    expect(assertTodoContent({ items: [] })).toBe(
      'Todo content.items must contain at least one item',
    );
    expect(
      assertTodoContent({
        items: [
          { id: 'todo:1', completed: false, content: doc, attachments: [] },
          { id: 'todo:1', completed: true, content: doc, attachments: [] },
        ],
      }),
    ).toBe('Duplicate todo item id');
  });

  it('accepts a valid todo and rejects duplicate reactions', () => {
    expect(
      assertMessageContent('todo', {
        items: [
          { id: 'todo:1', completed: false, content: doc, attachments: [] },
        ],
      }),
    ).toBeNull();
    expect(
      assertReactions([
        { emoji: '👍', count: 1 },
        { emoji: '👍', count: 1 },
      ]),
    ).toBe('Duplicate reaction emoji');
  });
});
