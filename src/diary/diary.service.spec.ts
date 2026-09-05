import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DiaryService } from './diary.service';
import { PrismaService } from '../prisma/prisma.service';
import { DIARY_ORDER_RETRY_MESSAGE } from './diary-order-tx';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

const USER_A = 'user-a';
const USER_B = 'user-b';

function emptyOrders(): {
  rootOrders: string[];
  groupChatboxOrders: Record<string, string[]>;
  chatboxMessageOrders: Record<string, string[]>;
} {
  return {
    rootOrders: [],
    groupChatboxOrders: {},
    chatboxMessageOrders: {},
  };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  const error = new Error(code) as Error & {
    code: string;
    meta?: Record<string, unknown>;
  };
  error.code = code;
  error.meta = meta;
  return error;
}

function createPrismaMock() {
  return {
    diaryGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    diaryChatbox: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    diaryMessage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    diaryTag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    diaryMessageTag: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    diaryCustomPalette: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    diaryOrder: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
}

function scopedEmpty(prisma: ReturnType<typeof createPrismaMock>) {
  prisma.diaryGroup.findMany.mockResolvedValue([]);
  prisma.diaryChatbox.findMany.mockResolvedValue([]);
  prisma.diaryMessage.findMany.mockResolvedValue([]);
  prisma.diaryTag.findMany.mockResolvedValue([]);
  prisma.diaryCustomPalette.findMany.mockResolvedValue([]);
  prisma.diaryOrder.findUnique.mockResolvedValue(null);
  prisma.diaryOrder.upsert.mockResolvedValue({
    userId: USER_A,
    ...emptyOrders(),
  });
  prisma.$transaction.mockImplementation(
    async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
}

describe('DiaryService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: DiaryService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DiaryService(prisma as unknown as PrismaService);
    scopedEmpty(prisma);
  });

  it('returns an empty valid snapshot with default orders for a user with no data', async () => {
    await expect(service.getSnapshot(USER_A)).resolves.toEqual({
      groups: [],
      chatboxes: [],
      messages: [],
      tags: [],
      palettes: [],
      orders: emptyOrders(),
    });

    expect(prisma.diaryGroup.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
    });
    expect(prisma.diaryChatbox.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
    });
    expect(prisma.diaryMessage.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
      include: { messageTags: { select: { tagId: true } } },
    });
    expect(prisma.diaryTag.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
    });
    expect(prisma.diaryCustomPalette.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
    });
    expect(prisma.diaryOrder.findUnique).toHaveBeenCalledWith({
      where: { userId: USER_A },
    });
  });

  it('never returns another user rows in the snapshot', async () => {
    const userAGroup = {
      id: 'gr:a',
      userId: USER_A,
      name: 'Alice',
      icon: 'Heart',
      colorId: 'rose',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    };
    const userBGroup = {
      id: 'gr:b',
      userId: USER_B,
      name: 'Bob',
      icon: 'Briefcase',
      colorId: 'violet',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: null,
    };

    prisma.diaryGroup.findMany.mockImplementation(
      ({ where }: { where: { userId: string } }) => {
        if (where.userId === USER_A) {
          return Promise.resolve([userAGroup]);
        }

        if (where.userId === USER_B) {
          return Promise.resolve([userBGroup]);
        }

        return Promise.resolve([]);
      },
    );

    const snapshot = await service.getSnapshot(USER_A);

    expect(snapshot.groups).toEqual([
      {
        id: 'gr:a',
        name: 'Alice',
        icon: 'Heart',
        colorId: 'rose',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
      },
    ]);
    expect(snapshot.groups.map((group) => group.id)).not.toContain('gr:b');
    expect(prisma.diaryGroup.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
    });
    expect(prisma.diaryGroup.findMany).not.toHaveBeenCalledWith({
      where: { userId: USER_B },
    });
  });

  it('derives chatbox metadata from messages and order maps', async () => {
    prisma.diaryChatbox.findMany.mockResolvedValue([
      {
        id: 'cb:1',
        userId: USER_A,
        groupId: null,
        name: 'Notes',
        description: '',
        icon: 'Notebook',
        colorId: 'sage',
        pinned: false,
        archived: false,
        notificationEnabled: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: null,
      },
    ]);
    prisma.diaryMessage.findMany.mockResolvedValue([
      {
        id: 'ms:1',
        chatboxId: 'cb:1',
        sender: 'user',
        variant: 'text',
        content: { json: {}, preview: 'hi' },
        pinned: false,
        archived: false,
        replyToMessageId: null,
        sourceMessageId: null,
        reactions: [],
        attachments: [],
        decorators: [],
        edited: false,
        createdAt: new Date('2026-01-01T01:00:00.000Z'),
        updatedAt: null,
        messageTags: [{ tagId: 'tag:diary' }],
      },
      {
        id: 'ms:2',
        chatboxId: 'cb:1',
        sender: 'user',
        variant: 'text',
        content: { json: {}, preview: 'later' },
        pinned: false,
        archived: false,
        replyToMessageId: null,
        sourceMessageId: null,
        reactions: [],
        attachments: [],
        decorators: [],
        edited: false,
        createdAt: new Date('2026-01-01T02:00:00.000Z'),
        updatedAt: null,
        messageTags: [{ tagId: 'tag:diary' }, { tagId: 'tag:work' }],
      },
    ]);
    prisma.diaryOrder.findUnique.mockResolvedValue({
      userId: USER_A,
      rootOrders: ['cb:1'],
      groupChatboxOrders: {},
      chatboxMessageOrders: { 'cb:1': ['ms:1', 'ms:2'] },
    });

    const snapshot = await service.getSnapshot(USER_A);

    expect(snapshot.chatboxes[0]).toMatchObject({
      id: 'cb:1',
      hasUnread: false,
      totalMessage: 2,
      lastMessageId: 'ms:2',
      lastMessageAt: '2026-01-01T02:00:00.000Z',
      tags: [
        { tagId: 'tag:diary', count: 2 },
        { tagId: 'tag:work', count: 1 },
      ],
    });
    expect(snapshot.messages[0].tagIds).toEqual(['tag:diary']);
    expect(snapshot.orders.rootOrders).toEqual(['cb:1']);
  });

  describe('groups', () => {
    const createdGroup = {
      id: 'gr:personal',
      userId: USER_A,
      name: 'Personal',
      icon: 'Heart',
      colorId: 'rose',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    };

    it('creates a group for the authenticated user', async () => {
      prisma.diaryGroup.create.mockResolvedValue(createdGroup);

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:personal',
          name: 'Personal',
          icon: 'Heart',
          colorId: 'rose',
        }),
      ).resolves.toEqual({
        id: 'gr:personal',
        name: 'Personal',
        icon: 'Heart',
        colorId: 'rose',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
      });

      expect(prisma.diaryGroup.create).toHaveBeenCalledWith({
        data: {
          id: 'gr:personal',
          userId: USER_A,
          name: 'Personal',
          icon: 'Heart',
          colorId: 'rose',
          updatedAt: null,
        },
      });
      expect(prisma.diaryOrder.upsert).toHaveBeenCalledWith({
        where: { userId: USER_A },
        create: {
          userId: USER_A,
          rootOrders: ['gr:personal'],
          groupChatboxOrders: { 'gr:personal': [] },
          chatboxMessageOrders: {},
        },
        update: {
          rootOrders: ['gr:personal'],
          groupChatboxOrders: { 'gr:personal': [] },
          chatboxMessageOrders: {},
        },
      });
    });

    it('maps duplicate group ids to 409', async () => {
      prisma.diaryGroup.create.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:personal',
          name: 'Personal',
          colorId: 'rose',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates an owned group and sets updatedAt', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(createdGroup);
      prisma.diaryGroup.update.mockResolvedValue({
        ...createdGroup,
        name: 'Home',
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.updateGroup(USER_A, 'gr:personal', {
        name: 'Home',
      });

      expect(prisma.diaryGroup.findFirst).toHaveBeenCalledWith({
        where: { id: 'gr:personal', userId: USER_A },
      });
      const updateCalls = prisma.diaryGroup.update.mock.calls as Array<
        [{ where: { id: string }; data: { name?: string; updatedAt?: Date } }]
      >;
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0].where).toEqual({ id: 'gr:personal' });
      expect(updateCalls[0][0].data.name).toBe('Home');
      expect(updateCalls[0][0].data.updatedAt).toBeInstanceOf(Date);
      expect(result).toMatchObject({
        id: 'gr:personal',
        name: 'Home',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('cannot update another user group', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.updateGroup(USER_A, 'gr:b', { name: 'Stolen' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryGroup.update).not.toHaveBeenCalled();
    });

    it('deletes an owned group without manually nulling chatboxes', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(createdGroup);
      prisma.diaryChatbox.findMany.mockResolvedValue([]);
      prisma.diaryGroup.delete.mockResolvedValue(createdGroup);

      await service.deleteGroup(USER_A, 'gr:personal');

      expect(prisma.diaryGroup.findFirst).toHaveBeenCalledWith({
        where: { id: 'gr:personal', userId: USER_A },
      });
      expect(prisma.diaryChatbox.findMany).toHaveBeenCalledWith({
        where: { userId: USER_A, groupId: 'gr:personal' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, createdAt: true },
      });
      expect(prisma.diaryGroup.delete).toHaveBeenCalledWith({
        where: { id: 'gr:personal' },
      });
      expect(prisma.diaryChatbox.updateMany).not.toHaveBeenCalled();
      expect(prisma.diaryOrder.upsert).toHaveBeenCalled();
    });

    it('appends ordered children then leftovers when deleting a group', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(createdGroup);
      prisma.diaryOrder.findUnique.mockResolvedValue({
        userId: USER_A,
        rootOrders: ['gr:personal'],
        groupChatboxOrders: { 'gr:personal': ['cb:b', 'cb:a'] },
        chatboxMessageOrders: {},
      });
      prisma.diaryChatbox.findMany.mockResolvedValue([
        { id: 'cb:a', createdAt: new Date('2026-01-01T00:00:02.000Z') },
        { id: 'cb:b', createdAt: new Date('2026-01-01T00:00:01.000Z') },
        { id: 'cb:c', createdAt: new Date('2026-01-01T00:00:03.000Z') },
        { id: 'cb:d', createdAt: new Date('2026-01-01T00:00:03.000Z') },
      ]);
      prisma.diaryGroup.delete.mockResolvedValue(createdGroup);

      await service.deleteGroup(USER_A, 'gr:personal');

      const upsert = prisma.diaryOrder.upsert.mock.calls[0][0] as {
        update: { rootOrders: string[] };
      };
      expect(upsert.update.rootOrders).toEqual([
        'cb:b',
        'cb:a',
        'cb:c',
        'cb:d',
      ]);
    });

    it('returns 404 for a non-owned group delete', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(null);

      await expect(service.deleteGroup(USER_A, 'gr:b')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.diaryGroup.delete).not.toHaveBeenCalled();
    });
  });

  describe('chatboxes', () => {
    const ownedGroup = {
      id: 'gr:personal',
      userId: USER_A,
      name: 'Personal',
      icon: 'Heart',
      colorId: 'rose',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    };
    const createdChatbox = {
      id: 'cb:notes',
      userId: USER_A,
      groupId: null as string | null,
      name: 'Notes',
      description: '',
      icon: 'Notebook',
      colorId: 'sage',
      pinned: false,
      archived: false,
      notificationEnabled: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    };

    it('creates an ungrouped chatbox with derived defaults', async () => {
      prisma.diaryChatbox.create.mockResolvedValue(createdChatbox);

      await expect(
        service.createChatbox(USER_A, {
          id: 'cb:notes',
          name: 'Notes',
          colorId: 'sage',
        }),
      ).resolves.toMatchObject({
        id: 'cb:notes',
        groupId: null,
        hasUnread: false,
        tags: [],
        totalMessage: 0,
        lastMessageId: null,
        lastMessageAt: null,
        pinned: false,
        archived: false,
        notificationEnabled: false,
        updatedAt: null,
      });

      expect(prisma.diaryGroup.findFirst).not.toHaveBeenCalled();
      expect(prisma.diaryChatbox.create).toHaveBeenCalledWith({
        data: {
          id: 'cb:notes',
          userId: USER_A,
          groupId: null,
          name: 'Notes',
          description: '',
          icon: '',
          colorId: 'sage',
          pinned: false,
          archived: false,
          notificationEnabled: false,
          updatedAt: null,
        },
      });
      expect(prisma.diaryOrder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            rootOrders: ['cb:notes'],
            chatboxMessageOrders: { 'cb:notes': [] },
          }),
        }),
      );
    });

    it('creates a chatbox inside an owned group', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(ownedGroup);
      prisma.diaryChatbox.create.mockResolvedValue({
        ...createdChatbox,
        groupId: 'gr:personal',
      });

      await expect(
        service.createChatbox(USER_A, {
          id: 'cb:notes',
          name: 'Notes',
          colorId: 'sage',
          groupId: 'gr:personal',
        }),
      ).resolves.toMatchObject({
        id: 'cb:notes',
        groupId: 'gr:personal',
      });

      expect(prisma.diaryGroup.findFirst).toHaveBeenCalledWith({
        where: { id: 'gr:personal', userId: USER_A },
      });
    });

    it('cannot create a chatbox inside another user group', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.createChatbox(USER_A, {
          id: 'cb:notes',
          name: 'Notes',
          colorId: 'sage',
          groupId: 'gr:b',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryChatbox.create).not.toHaveBeenCalled();
    });

    it('maps a parent-group FK race to 404', async () => {
      prisma.diaryGroup.findFirst.mockResolvedValue(ownedGroup);
      prisma.diaryChatbox.create.mockRejectedValue(
        prismaError('P2003', { field_name: 'groupId' }),
      );

      await expect(
        service.createChatbox(USER_A, {
          id: 'cb:notes',
          name: 'Notes',
          colorId: 'sage',
          groupId: 'gr:personal',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates an owned chatbox', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(createdChatbox);
      prisma.diaryChatbox.update.mockResolvedValue({
        ...createdChatbox,
        name: 'Journal',
        notificationEnabled: true,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await expect(
        service.updateChatbox(USER_A, 'cb:notes', {
          name: 'Journal',
          notificationEnabled: true,
        }),
      ).resolves.toMatchObject({
        id: 'cb:notes',
        name: 'Journal',
        notificationEnabled: true,
        groupId: null,
      });

      expect(prisma.diaryChatbox.findFirst).toHaveBeenCalledWith({
        where: { id: 'cb:notes', userId: USER_A },
      });
    });

    it('moves an owned chatbox into an owned group', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(createdChatbox);
      prisma.diaryGroup.findFirst.mockResolvedValue(ownedGroup);
      prisma.diaryChatbox.update.mockResolvedValue({
        ...createdChatbox,
        groupId: 'gr:personal',
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await expect(
        service.moveChatbox(USER_A, 'cb:notes', { groupId: 'gr:personal' }),
      ).resolves.toMatchObject({ groupId: 'gr:personal' });
      expect(prisma.diaryOrder.upsert).toHaveBeenCalled();
    });

    it('does not write when moving a chatbox into the same group', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue({
        ...createdChatbox,
        groupId: 'gr:personal',
      });
      prisma.$transaction.mockClear();
      prisma.diaryChatbox.update.mockClear();
      prisma.diaryOrder.upsert.mockClear();

      await expect(
        service.moveChatbox(USER_A, 'cb:notes', { groupId: 'gr:personal' }),
      ).resolves.toMatchObject({ groupId: 'gr:personal' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.diaryChatbox.update).not.toHaveBeenCalled();
      expect(prisma.diaryOrder.upsert).not.toHaveBeenCalled();
    });

    it('moves an owned chatbox to ungrouped', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue({
        ...createdChatbox,
        groupId: 'gr:personal',
      });
      prisma.diaryChatbox.update.mockResolvedValue({
        ...createdChatbox,
        groupId: null,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await expect(
        service.moveChatbox(USER_A, 'cb:notes', { groupId: null }),
      ).resolves.toMatchObject({ groupId: null });
      expect(prisma.diaryGroup.findFirst).not.toHaveBeenCalled();
    });

    it('cannot move a chatbox into another user group', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(createdChatbox);
      prisma.diaryGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.moveChatbox(USER_A, 'cb:notes', { groupId: 'gr:b' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryChatbox.update).not.toHaveBeenCalled();
    });

    it('deletes an owned chatbox without manually deleting messages', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(createdChatbox);
      prisma.diaryChatbox.delete.mockResolvedValue(createdChatbox);

      await service.deleteChatbox(USER_A, 'cb:notes');

      expect(prisma.diaryChatbox.delete).toHaveBeenCalledWith({
        where: { id: 'cb:notes' },
      });
      expect(prisma.diaryMessage.deleteMany).not.toHaveBeenCalled();
      expect(prisma.diaryOrder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            chatboxMessageOrders: {},
          }),
        }),
      );
    });

    it('cannot modify another user chatbox', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(null);

      await expect(
        service.updateChatbox(USER_A, 'cb:b', { name: 'Stolen' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.deleteChatbox(USER_A, 'cb:b'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryChatbox.update).not.toHaveBeenCalled();
      expect(prisma.diaryChatbox.delete).not.toHaveBeenCalled();
    });
  });

  describe('sidebar orders', () => {
    it('appends sequential group creates instead of replacing', async () => {
      const stored: { current: ReturnType<typeof emptyOrders> | null } = {
        current: null,
      };

      prisma.diaryGroup.create.mockImplementation(
        ({ data }: { data: { id: string; name: string; colorId: string } }) =>
          Promise.resolve({
            id: data.id,
            userId: USER_A,
            name: data.name,
            icon: '',
            colorId: data.colorId,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: null,
          }),
      );
      prisma.diaryOrder.findUnique.mockImplementation(() =>
        Promise.resolve(stored.current),
      );
      prisma.diaryOrder.upsert.mockImplementation(
        (args: {
          create: ReturnType<typeof emptyOrders>;
          update: ReturnType<typeof emptyOrders>;
        }) => {
          stored.current = stored.current
            ? { ...stored.current, ...args.update }
            : args.create;
          return Promise.resolve(stored.current);
        },
      );

      await service.createGroup(USER_A, {
        id: 'gr:1',
        name: 'One',
        colorId: 'rose',
      });
      await service.createGroup(USER_A, {
        id: 'gr:2',
        name: 'Two',
        colorId: 'sage',
      });

      expect(stored.current?.rootOrders).toEqual(['gr:1', 'gr:2']);
      expect(stored.current?.groupChatboxOrders).toEqual({
        'gr:1': [],
        'gr:2': [],
      });
    });

    it('replaces sidebar layout, preserves message orders, and patches groupId', async () => {
      prisma.diaryGroup.findMany.mockResolvedValue([{ id: 'gr:personal' }]);
      prisma.diaryChatbox.findMany.mockResolvedValue([
        { id: 'cb:notes', groupId: null },
        { id: 'cb:inbox', groupId: 'gr:personal' },
      ]);
      prisma.diaryOrder.findUnique.mockResolvedValue({
        userId: USER_A,
        rootOrders: ['cb:notes'],
        groupChatboxOrders: {},
        chatboxMessageOrders: { 'cb:notes': ['ms:1'] },
      });
      prisma.diaryChatbox.update.mockResolvedValue({});

      await expect(
        service.syncSidebarLayout(USER_A, {
          rootOrders: ['gr:personal', 'cb:inbox'],
          groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
        }),
      ).resolves.toEqual({
        rootOrders: ['gr:personal', 'cb:inbox'],
        groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
        chatboxMessageOrders: { 'cb:notes': ['ms:1'] },
      });

      expect(prisma.diaryChatbox.update).toHaveBeenCalledWith({
        where: { id: 'cb:inbox' },
        data: expect.objectContaining({ groupId: null }),
      });
      expect(prisma.diaryChatbox.update).toHaveBeenCalledWith({
        where: { id: 'cb:notes' },
        data: expect.objectContaining({ groupId: 'gr:personal' }),
      });
    });

    it('rejects an orphan groupChatboxOrders key', async () => {
      prisma.diaryGroup.findMany.mockResolvedValue([{ id: 'gr:personal' }]);
      prisma.diaryChatbox.findMany.mockResolvedValue([
        { id: 'cb:notes', groupId: 'gr:personal' },
      ]);

      await expect(
        service.syncSidebarLayout(USER_A, {
          rootOrders: ['cb:notes'],
          groupChatboxOrders: { 'gr:personal': [] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.diaryOrder.upsert).not.toHaveBeenCalled();
    });

    it('retries P2034 then persists the group', async () => {
      prisma.$transaction
        .mockRejectedValueOnce(
          Object.assign(new Error('P2034'), { code: 'P2034' }),
        )
        .mockImplementation(
          async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
        );
      prisma.diaryGroup.create.mockResolvedValue({
        id: 'gr:personal',
        userId: USER_A,
        name: 'Personal',
        icon: '',
        colorId: 'rose',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: null,
      });

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:personal',
          name: 'Personal',
          colorId: 'rose',
        }),
      ).resolves.toMatchObject({ id: 'gr:personal' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('returns 503 after retry exhaustion', async () => {
      prisma.$transaction.mockRejectedValue(
        Object.assign(new Error('P2034'), { code: 'P2034' }),
      );

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:personal',
          name: 'Personal',
          colorId: 'rose',
        }),
      ).rejects.toMatchObject({
        response: { message: DIARY_ORDER_RETRY_MESSAGE },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(prisma.diaryGroup.create).not.toHaveBeenCalled();
    });

    it('lets a later PUT replace an earlier layout instead of merging', async () => {
      prisma.diaryGroup.findMany.mockResolvedValue([{ id: 'gr:personal' }]);
      prisma.diaryChatbox.findMany.mockResolvedValue([
        { id: 'cb:a', groupId: null },
        { id: 'cb:b', groupId: null },
      ]);
      let stored = {
        userId: USER_A,
        rootOrders: ['cb:a', 'cb:b'],
        groupChatboxOrders: {},
        chatboxMessageOrders: { 'cb:a': ['ms:1'] },
      };
      prisma.diaryOrder.findUnique.mockImplementation(() =>
        Promise.resolve(stored),
      );
      prisma.diaryOrder.upsert.mockImplementation(
        ({ update }: { update: typeof stored }) => {
          stored = { ...stored, ...update };
          return Promise.resolve(stored);
        },
      );

      await service.syncSidebarLayout(USER_A, {
        rootOrders: ['cb:a'],
        groupChatboxOrders: {},
      });
      const second = await service.syncSidebarLayout(USER_A, {
        rootOrders: ['cb:b'],
        groupChatboxOrders: {},
      });

      expect(second.rootOrders).toEqual(['cb:b']);
      expect(second.chatboxMessageOrders).toEqual({ 'cb:a': ['ms:1'] });
    });
  });

  describe('tags', () => {
    const createdTag = {
      id: 'tag:diary',
      userId: USER_A,
      label: 'diary',
      colorId: 'lavender',
    };

    it('creates a tag', async () => {
      prisma.diaryTag.findFirst.mockResolvedValue(null);
      prisma.diaryTag.create.mockResolvedValue(createdTag);

      await expect(
        service.createTag(USER_A, {
          id: 'tag:diary',
          label: 'diary',
          colorId: 'lavender',
        }),
      ).resolves.toEqual({
        id: 'tag:diary',
        label: 'diary',
        colorId: 'lavender',
      });
    });

    it('rejects a duplicate label case-insensitively', async () => {
      prisma.diaryTag.findFirst.mockResolvedValue(createdTag);

      await expect(
        service.createTag(USER_A, {
          id: 'tag:other',
          label: 'Diary',
          colorId: 'rose',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.diaryTag.create).not.toHaveBeenCalled();
    });

    it('updates an owned tag', async () => {
      prisma.diaryTag.findFirst
        .mockResolvedValueOnce(createdTag)
        .mockResolvedValueOnce(null);
      prisma.diaryTag.update.mockResolvedValue({
        ...createdTag,
        label: 'journal',
      });

      await expect(
        service.updateTag(USER_A, 'tag:diary', { label: 'journal' }),
      ).resolves.toEqual({
        id: 'tag:diary',
        label: 'journal',
        colorId: 'lavender',
      });
    });

    it('cannot modify another user tag', async () => {
      prisma.diaryTag.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTag(USER_A, 'tag:b', { label: 'Stolen' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryTag.update).not.toHaveBeenCalled();
    });

    it('deletes an owned tag without manually deleting join rows', async () => {
      prisma.diaryTag.findFirst.mockResolvedValue(createdTag);
      prisma.diaryTag.delete.mockResolvedValue(createdTag);

      await service.deleteTag(USER_A, 'tag:diary');

      expect(prisma.diaryTag.delete).toHaveBeenCalledWith({
        where: { id: 'tag:diary' },
      });
      expect(prisma.diaryMessageTag.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('messages', () => {
    const doc = {
      json: { type: 'doc', content: [{ type: 'paragraph' }] },
      preview: 'hello',
    };
    const ownedChatbox = {
      id: 'cb:notes',
      userId: USER_A,
      groupId: null,
      name: 'Notes',
      description: '',
      icon: '',
      colorId: 'sage',
      pinned: false,
      archived: false,
      notificationEnabled: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    };
    const createdMessage = {
      id: 'ms:1',
      userId: USER_A,
      chatboxId: 'cb:notes',
      sender: 'user',
      variant: 'text',
      content: doc,
      pinned: false,
      archived: false,
      replyToMessageId: null,
      sourceMessageId: null,
      reactions: [],
      attachments: [],
      decorators: [],
      edited: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
      messageTags: [],
    };

    it('creates a text message and appends it to chatboxMessageOrders', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(ownedChatbox);
      prisma.diaryMessage.create.mockResolvedValue(createdMessage);

      await expect(
        service.createMessage(USER_A, {
          id: 'ms:1',
          chatboxId: 'cb:notes',
          sender: 'user',
          variant: 'text',
          content: doc,
        }),
      ).resolves.toMatchObject({
        id: 'ms:1',
        chatboxId: 'cb:notes',
        edited: false,
        updatedAt: null,
        tagIds: [],
      });

      expect(prisma.diaryOrder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            chatboxMessageOrders: { 'cb:notes': ['ms:1'] },
          }),
        }),
      );
    });

    it('allows a dangling sourceMessageId after the origin is gone', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(ownedChatbox);
      prisma.diaryMessage.findUnique.mockResolvedValue(null);
      prisma.diaryMessage.create.mockResolvedValue({
        ...createdMessage,
        id: 'ms:forward',
        sourceMessageId: 'ms:gone',
      });

      await expect(
        service.createMessage(USER_A, {
          id: 'ms:forward',
          chatboxId: 'cb:notes',
          sender: 'user',
          variant: 'text',
          content: doc,
          sourceMessageId: 'ms:gone',
        }),
      ).resolves.toMatchObject({ sourceMessageId: 'ms:gone' });
    });

    it('rejects another user live sourceMessageId', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(ownedChatbox);
      prisma.diaryMessage.findUnique.mockResolvedValue({
        id: 'ms:b',
        userId: USER_B,
      });

      await expect(
        service.createMessage(USER_A, {
          id: 'ms:forward',
          chatboxId: 'cb:notes',
          sender: 'user',
          variant: 'text',
          content: doc,
          sourceMessageId: 'ms:b',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryMessage.create).not.toHaveBeenCalled();
    });

    it('requires replyToMessageId to exist at write time', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(ownedChatbox);
      prisma.diaryMessage.findFirst.mockResolvedValue(null);

      await expect(
        service.createMessage(USER_A, {
          id: 'ms:reply',
          chatboxId: 'cb:notes',
          sender: 'user',
          variant: 'text',
          content: doc,
          replyToMessageId: 'ms:missing',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('patches todo content without setting edited, and rejects text content', async () => {
      prisma.diaryMessage.findFirst.mockResolvedValue({
        ...createdMessage,
        variant: 'todo',
      });
      prisma.diaryMessage.update.mockResolvedValue({
        ...createdMessage,
        variant: 'todo',
        edited: false,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        content: {
          items: [
            { id: 'todo:1', completed: true, content: doc, attachments: [] },
          ],
        },
      });

      await expect(
        service.patchMessage(USER_A, 'ms:1', {
          content: {
            items: [
              { id: 'todo:1', completed: true, content: doc, attachments: [] },
            ],
          },
        }),
      ).resolves.toMatchObject({ edited: false });

      prisma.diaryMessage.findFirst.mockResolvedValue(createdMessage);
      await expect(
        service.patchMessage(USER_A, 'ms:1', {
          content: {
            items: [
              { id: 'todo:1', completed: true, content: doc, attachments: [] },
            ],
          },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets edited true on PUT edit', async () => {
      prisma.diaryMessage.findFirst.mockResolvedValue(createdMessage);
      prisma.diaryMessage.update.mockResolvedValue({
        ...createdMessage,
        edited: true,
        preview: undefined,
        content: doc,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await expect(
        service.editMessage(USER_A, 'ms:1', {
          variant: 'text',
          content: doc,
        }),
      ).resolves.toMatchObject({ edited: true });
    });

    it('deletes a message and strips it from chatboxMessageOrders', async () => {
      prisma.diaryMessage.findFirst.mockResolvedValue(createdMessage);
      prisma.diaryOrder.findUnique.mockResolvedValue({
        userId: USER_A,
        rootOrders: ['cb:notes'],
        groupChatboxOrders: {},
        chatboxMessageOrders: { 'cb:notes': ['ms:1', 'ms:2'] },
      });
      prisma.diaryMessage.delete.mockResolvedValue(createdMessage);

      await service.deleteMessage(USER_A, 'ms:1');

      expect(prisma.diaryMessage.delete).toHaveBeenCalledWith({
        where: { id: 'ms:1' },
      });
      expect(prisma.diaryMessageTag.deleteMany).not.toHaveBeenCalled();
      expect(prisma.diaryOrder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            chatboxMessageOrders: { 'cb:notes': ['ms:2'] },
          }),
        }),
      );
    });

    it('replaces message tags without setting edited', async () => {
      prisma.diaryMessage.findFirst.mockResolvedValue(createdMessage);
      prisma.diaryTag.findMany.mockResolvedValue([{ id: 'tag:diary' }]);
      prisma.diaryMessage.update.mockResolvedValue({
        ...createdMessage,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        messageTags: [{ tagId: 'tag:diary' }],
      });

      await expect(
        service.setMessageTags(USER_A, 'ms:1', { tagIds: ['tag:diary'] }),
      ).resolves.toMatchObject({
        tagIds: ['tag:diary'],
        edited: false,
      });

      expect(prisma.diaryMessageTag.deleteMany).toHaveBeenCalledWith({
        where: { messageId: 'ms:1' },
      });
      expect(prisma.diaryMessageTag.createMany).toHaveBeenCalled();
    });

    it('returns 404 when attaching another user tag', async () => {
      prisma.diaryMessage.findFirst.mockResolvedValue(createdMessage);
      prisma.diaryTag.findMany.mockResolvedValue([]);

      await expect(
        service.setMessageTags(USER_A, 'ms:1', { tagIds: ['tag:other'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryMessageTag.createMany).not.toHaveBeenCalled();
    });

    it('strips a tag from every chatbox message including hidden rows', async () => {
      prisma.diaryChatbox.findFirst.mockResolvedValue(ownedChatbox);
      prisma.diaryTag.findFirst.mockResolvedValue({
        id: 'tag:diary',
        userId: USER_A,
      });
      prisma.diaryMessageTag.findMany.mockResolvedValue([
        { messageId: 'ms:1' },
        { messageId: 'ms:hidden' },
      ]);

      await service.removeTagFromChatbox(USER_A, 'cb:notes', {
        tagId: 'tag:diary',
      });

      expect(prisma.diaryMessageTag.deleteMany).toHaveBeenCalled();
      expect(prisma.diaryMessage.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ms:1', 'ms:hidden'] }, userId: USER_A },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      });
    });
  });

  describe('palettes', () => {
    const paletteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const shades = {
      soft: '#FFE5EC',
      main: '#F3A3B5',
      strong: '#D56B85',
    };
    const createdPalette = {
      id: paletteId,
      userId: USER_A,
      name: 'Dream',
      description: 'Soft',
      baseColor: '#B69DF7',
      light: shades,
      dark: shades,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('creates a palette and returns the GET mapper shape', async () => {
      prisma.diaryCustomPalette.create.mockResolvedValue(createdPalette);

      await expect(
        service.createPalette(USER_A, {
          id: paletteId,
          name: 'Dream',
          description: 'Soft',
          baseColor: '#b69df7',
          light: { soft: '#ffe5ec', main: '#F3A3B5', strong: 'd56b85' },
          dark: shades,
        }),
      ).resolves.toMatchObject({
        id: paletteId,
        name: 'Dream',
        description: 'Soft',
        baseColor: '#B69DF7',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    const customColorId = `custom:${paletteId}`;
    const ownedGroup = {
      id: 'gr:custom',
      userId: USER_A,
      name: 'Custom',
      icon: '',
      colorId: customColorId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    };
    const ownedChatbox = {
      id: 'cb:custom',
      userId: USER_A,
      groupId: null as string | null,
      name: 'Custom',
      description: '',
      icon: '',
      colorId: customColorId,
      pinned: false,
      archived: false,
      notificationEnabled: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
    };
    const ownedTag = {
      id: 'tag:custom',
      userId: USER_A,
      label: 'custom',
      colorId: customColorId,
    };

    it('creates a group with an owned custom palette', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryGroup.create.mockResolvedValue(ownedGroup);

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:custom',
          name: 'Custom',
          colorId: customColorId,
        }),
      ).resolves.toMatchObject({ colorId: customColorId });
      expect(prisma.diaryCustomPalette.findFirst).toHaveBeenCalledWith({
        where: { id: paletteId, userId: USER_A },
      });
    });

    it('patches a group to an owned custom palette', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryGroup.findFirst.mockResolvedValue({
        ...ownedGroup,
        colorId: 'rose',
      });
      prisma.diaryGroup.update.mockResolvedValue(ownedGroup);

      await expect(
        service.updateGroup(USER_A, 'gr:custom', { colorId: customColorId }),
      ).resolves.toMatchObject({ colorId: customColorId });
      expect(prisma.diaryGroup.update).toHaveBeenCalled();
    });

    it('creates a chatbox with an owned custom palette', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryChatbox.create.mockResolvedValue(ownedChatbox);

      await expect(
        service.createChatbox(USER_A, {
          id: 'cb:custom',
          name: 'Custom',
          colorId: customColorId,
        }),
      ).resolves.toMatchObject({ colorId: customColorId });
      expect(prisma.diaryCustomPalette.findFirst).toHaveBeenCalledWith({
        where: { id: paletteId, userId: USER_A },
      });
    });

    it('patches a chatbox to an owned custom palette', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryChatbox.findFirst.mockResolvedValue({
        ...ownedChatbox,
        colorId: 'sage',
      });
      prisma.diaryChatbox.update.mockResolvedValue(ownedChatbox);

      await expect(
        service.updateChatbox(USER_A, 'cb:custom', { colorId: customColorId }),
      ).resolves.toMatchObject({ colorId: customColorId });
    });

    it('creates a tag with an owned custom palette', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryTag.findFirst.mockResolvedValue(null);
      prisma.diaryTag.create.mockResolvedValue(ownedTag);

      await expect(
        service.createTag(USER_A, {
          id: 'tag:custom',
          label: 'custom',
          colorId: customColorId,
        }),
      ).resolves.toMatchObject({ colorId: customColorId });
    });

    it('patches a tag to an owned custom palette', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryTag.findFirst.mockResolvedValue({
        ...ownedTag,
        colorId: 'lavender',
      });
      prisma.diaryTag.update.mockResolvedValue(ownedTag);

      await expect(
        service.updateTag(USER_A, 'tag:custom', { colorId: customColorId }),
      ).resolves.toMatchObject({ colorId: customColorId });
    });

    it('returns 404 for a missing or non-owned custom palette on every write path', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(null);

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:custom',
          name: 'Custom',
          colorId: customColorId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateGroup(USER_A, 'gr:custom', { colorId: customColorId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createChatbox(USER_A, {
          id: 'cb:custom',
          name: 'Custom',
          colorId: customColorId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateChatbox(USER_A, 'cb:custom', { colorId: customColorId }),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.diaryTag.findFirst.mockResolvedValue(null);
      await expect(
        service.createTag(USER_A, {
          id: 'tag:custom',
          label: 'custom',
          colorId: customColorId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.diaryTag.findFirst.mockResolvedValue({
        ...ownedTag,
        colorId: 'lavender',
      });
      await expect(
        service.updateTag(USER_A, 'tag:custom', { colorId: customColorId }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.diaryGroup.create).not.toHaveBeenCalled();
      expect(prisma.diaryGroup.update).not.toHaveBeenCalled();
      expect(prisma.diaryChatbox.create).not.toHaveBeenCalled();
      expect(prisma.diaryChatbox.update).not.toHaveBeenCalled();
      expect(prisma.diaryTag.create).not.toHaveBeenCalled();
      expect(prisma.diaryTag.update).not.toHaveBeenCalled();
    });

    it('accepts presets without looking up a palette row', async () => {
      prisma.diaryGroup.create.mockResolvedValue({
        ...ownedGroup,
        colorId: 'rose',
      });

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:preset',
          name: 'Preset',
          colorId: 'rose',
        }),
      ).resolves.toMatchObject({ colorId: 'rose' });
      expect(prisma.diaryCustomPalette.findFirst).not.toHaveBeenCalled();
    });

    it('rejects deleting a palette referenced by a group, chatbox, or tag', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryChatbox.findFirst.mockResolvedValue(null);
      prisma.diaryTag.findFirst.mockResolvedValue(null);
      prisma.diaryGroup.findFirst.mockResolvedValue({ id: 'gr:custom' });

      await expect(
        service.deletePalette(USER_A, paletteId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.diaryCustomPalette.delete).not.toHaveBeenCalled();

      prisma.diaryGroup.findFirst.mockResolvedValue(null);
      prisma.diaryChatbox.findFirst.mockResolvedValue({ id: 'cb:custom' });

      await expect(
        service.deletePalette(USER_A, paletteId),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.diaryChatbox.findFirst.mockResolvedValue(null);
      prisma.diaryTag.findFirst.mockResolvedValue({ id: 'tag:custom' });

      await expect(
        service.deletePalette(USER_A, paletteId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.diaryCustomPalette.delete).not.toHaveBeenCalled();
    });

    it('deletes an unused owned palette', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryGroup.findFirst.mockResolvedValue(null);
      prisma.diaryChatbox.findFirst.mockResolvedValue(null);
      prisma.diaryTag.findFirst.mockResolvedValue(null);

      await service.deletePalette(USER_A, paletteId);
      expect(prisma.diaryCustomPalette.delete).toHaveBeenCalledWith({
        where: { id: paletteId },
      });
    });

    it('never leaves a dangling custom ColorId after sequential assign vs delete', async () => {
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryGroup.create.mockResolvedValue(ownedGroup);

      await service.createGroup(USER_A, {
        id: 'gr:custom',
        name: 'Custom',
        colorId: customColorId,
      });

      prisma.diaryGroup.findFirst.mockResolvedValue({ id: 'gr:custom' });
      prisma.diaryChatbox.findFirst.mockResolvedValue(null);
      prisma.diaryTag.findFirst.mockResolvedValue(null);

      await expect(
        service.deletePalette(USER_A, paletteId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.diaryCustomPalette.delete).not.toHaveBeenCalled();

      prisma.diaryCustomPalette.findFirst.mockResolvedValue(null);
      prisma.diaryGroup.create.mockClear();

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:after-delete',
          name: 'After',
          colorId: customColorId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.diaryGroup.create).not.toHaveBeenCalled();
    });

    it('re-checks palette ownership after a serialization retry on custom assignment', async () => {
      let attempt = 0;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => {
          attempt += 1;
          if (attempt === 1) {
            throw prismaError('P2034');
          }
          prisma.diaryCustomPalette.findFirst.mockResolvedValue(null);
          return fn(prisma);
        },
      );

      await expect(
        service.createGroup(USER_A, {
          id: 'gr:custom',
          name: 'Custom',
          colorId: customColorId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(attempt).toBe(2);
      expect(prisma.diaryGroup.create).not.toHaveBeenCalled();
    });

    it('re-checks usage after a serialization retry on palette delete', async () => {
      let attempt = 0;
      prisma.diaryCustomPalette.findFirst.mockResolvedValue(createdPalette);
      prisma.diaryChatbox.findFirst.mockResolvedValue(null);
      prisma.diaryTag.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => {
          attempt += 1;
          if (attempt === 1) {
            throw prismaError('P2034');
          }
          prisma.diaryGroup.findFirst.mockResolvedValue({
            id: 'gr:now-uses-it',
          });
          return fn(prisma);
        },
      );

      await expect(
        service.deletePalette(USER_A, paletteId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(attempt).toBe(2);
      expect(prisma.diaryCustomPalette.delete).not.toHaveBeenCalled();
    });
  });
});
