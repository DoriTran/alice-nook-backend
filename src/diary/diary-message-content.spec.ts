import {
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
