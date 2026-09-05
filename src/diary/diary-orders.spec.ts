import {
  appendChatbox,
  appendGroup,
  appendMessage,
  applySidebarLayout,
  assertValidSidebarLayout,
  deleteChatboxOrders,
  deleteGroupOrders,
  deleteMessageOrders,
  InvalidSidebarLayoutError,
  moveChatboxOrders,
} from './diary-orders';
import type { DiaryOrdersSnapshot } from './dto/diary-snapshot';

function emptyOrders(): DiaryOrdersSnapshot {
  return {
    rootOrders: [],
    groupChatboxOrders: {},
    chatboxMessageOrders: {},
  };
}

describe('diary-orders', () => {
  it('appends a group to root and initializes an empty group list', () => {
    const next = appendGroup(emptyOrders(), 'gr:personal');

    expect(next).toEqual({
      rootOrders: ['gr:personal'],
      groupChatboxOrders: { 'gr:personal': [] },
      chatboxMessageOrders: {},
    });
  });

  it('appends an ungrouped chatbox to root and initializes message order', () => {
    const next = appendChatbox(emptyOrders(), 'cb:notes', null);

    expect(next.rootOrders).toEqual(['cb:notes']);
    expect(next.chatboxMessageOrders).toEqual({ 'cb:notes': [] });
  });

  it('appends a grouped chatbox to that group list', () => {
    const start = appendGroup(emptyOrders(), 'gr:personal');
    const next = appendChatbox(start, 'cb:notes', 'gr:personal');

    expect(next.rootOrders).toEqual(['gr:personal']);
    expect(next.groupChatboxOrders['gr:personal']).toEqual(['cb:notes']);
    expect(next.chatboxMessageOrders['cb:notes']).toEqual([]);
  });

  it('appends and removes message ids without touching sidebar maps', () => {
    const start = appendChatbox(emptyOrders(), 'cb:notes', null);
    const withMessage = appendMessage(start, 'cb:notes', 'ms:1');
    const next = appendMessage(withMessage, 'cb:notes', 'ms:2');

    expect(next.chatboxMessageOrders['cb:notes']).toEqual(['ms:1', 'ms:2']);
    expect(next.rootOrders).toEqual(['cb:notes']);

    const removed = deleteMessageOrders(next, 'cb:notes', 'ms:1');
    expect(removed.chatboxMessageOrders['cb:notes']).toEqual(['ms:2']);
    expect(removed.rootOrders).toEqual(['cb:notes']);
  });

  it('moves a chatbox from root to a group and keeps an empty source group array', () => {
    const start: DiaryOrdersSnapshot = {
      rootOrders: ['gr:personal', 'cb:notes'],
      groupChatboxOrders: { 'gr:personal': [] },
      chatboxMessageOrders: { 'cb:notes': ['ms:1'] },
    };

    const next = moveChatboxOrders(start, 'cb:notes', null, 'gr:personal');

    expect(next.rootOrders).toEqual(['gr:personal']);
    expect(next.groupChatboxOrders['gr:personal']).toEqual(['cb:notes']);
    expect(next.chatboxMessageOrders).toEqual({ 'cb:notes': ['ms:1'] });
  });

  it('moves a chatbox from a group to root and keeps the empty source list', () => {
    const start: DiaryOrdersSnapshot = {
      rootOrders: ['gr:personal'],
      groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      chatboxMessageOrders: { 'cb:notes': [] },
    };

    const next = moveChatboxOrders(start, 'cb:notes', 'gr:personal', null);

    expect(next.rootOrders).toEqual(['gr:personal', 'cb:notes']);
    expect(next.groupChatboxOrders['gr:personal']).toEqual([]);
  });

  it('removes a chatbox from sidebar lists and drops its message-order key', () => {
    const start: DiaryOrdersSnapshot = {
      rootOrders: ['gr:personal'],
      groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      chatboxMessageOrders: { 'cb:notes': ['ms:1'], 'cb:other': [] },
    };

    const next = deleteChatboxOrders(start, 'cb:notes', 'gr:personal');

    expect(next.rootOrders).toEqual(['gr:personal']);
    expect(next.groupChatboxOrders['gr:personal']).toEqual([]);
    expect(next.chatboxMessageOrders).toEqual({ 'cb:other': [] });
  });

  it('concatenates ordered children then leftovers by createdAt and id on group delete', () => {
    const start: DiaryOrdersSnapshot = {
      rootOrders: ['cb:root', 'gr:personal'],
      groupChatboxOrders: { 'gr:personal': ['cb:b', 'cb:a'] },
      chatboxMessageOrders: {
        'cb:a': [],
        'cb:b': [],
        'cb:c': [],
        'cb:d': [],
      },
    };

    const next = deleteGroupOrders(start, 'gr:personal', [
      { id: 'cb:a', createdAt: new Date('2026-01-01T00:00:02.000Z') },
      { id: 'cb:b', createdAt: new Date('2026-01-01T00:00:01.000Z') },
      { id: 'cb:d', createdAt: new Date('2026-01-01T00:00:03.000Z') },
      { id: 'cb:c', createdAt: new Date('2026-01-01T00:00:03.000Z') },
    ]);

    expect(next.rootOrders).toEqual([
      'cb:root',
      'cb:b',
      'cb:a',
      'cb:c',
      'cb:d',
    ]);
    expect(next.groupChatboxOrders).toEqual({});
    expect(next.chatboxMessageOrders['cb:a']).toEqual([]);
  });

  it('replaces sidebar maps and preserves message orders', () => {
    const start: DiaryOrdersSnapshot = {
      rootOrders: ['gr:old'],
      groupChatboxOrders: { 'gr:old': ['cb:notes'] },
      chatboxMessageOrders: { 'cb:notes': ['ms:1'] },
    };

    const next = applySidebarLayout(start, {
      rootOrders: ['gr:personal', 'cb:inbox'],
      groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
    });

    expect(next).toEqual({
      rootOrders: ['gr:personal', 'cb:inbox'],
      groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      chatboxMessageOrders: { 'cb:notes': ['ms:1'] },
    });
  });

  it('rejects orphan group map keys and chatboxes listed in both places', () => {
    const groups = new Set(['gr:personal']);
    const chatboxes = new Set(['cb:notes', 'cb:inbox']);

    expect(() =>
      assertValidSidebarLayout(
        {
          rootOrders: ['cb:notes'],
          groupChatboxOrders: { 'gr:personal': ['cb:inbox'] },
        },
        groups,
        chatboxes,
      ),
    ).toThrow(InvalidSidebarLayoutError);

    expect(() =>
      assertValidSidebarLayout(
        {
          rootOrders: ['gr:personal', 'cb:notes'],
          groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
        },
        groups,
        chatboxes,
      ),
    ).toThrow(InvalidSidebarLayoutError);
  });

  it('accepts an incomplete owned layout when omitted groups have no map key', () => {
    expect(() =>
      assertValidSidebarLayout(
        {
          rootOrders: ['cb:inbox'],
          groupChatboxOrders: {},
        },
        new Set(['gr:personal']),
        new Set(['cb:inbox', 'cb:notes']),
      ),
    ).not.toThrow();
  });
});
