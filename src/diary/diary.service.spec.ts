import { DiaryService } from './diary.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

const USER_A = 'user-a';
const USER_B = 'user-b';

function emptyOrders() {
  return {
    rootOrders: [],
    groupChatboxOrders: {},
    chatboxMessageOrders: {},
  };
}

function createPrismaMock() {
  return {
    diaryGroup: { findMany: jest.fn() },
    diaryChatbox: { findMany: jest.fn() },
    diaryMessage: { findMany: jest.fn() },
    diaryTag: { findMany: jest.fn() },
    diaryCustomPalette: { findMany: jest.fn() },
    diaryOrder: { findUnique: jest.fn() },
  };
}

function scopedEmpty(prisma: ReturnType<typeof createPrismaMock>) {
  prisma.diaryGroup.findMany.mockResolvedValue([]);
  prisma.diaryChatbox.findMany.mockResolvedValue([]);
  prisma.diaryMessage.findMany.mockResolvedValue([]);
  prisma.diaryTag.findMany.mockResolvedValue([]);
  prisma.diaryCustomPalette.findMany.mockResolvedValue([]);
  prisma.diaryOrder.findUnique.mockResolvedValue(null);
}

describe('DiaryService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: DiaryService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DiaryService(prisma as unknown as PrismaService);
  });

  it('returns an empty valid snapshot with default orders for a user with no data', async () => {
    scopedEmpty(prisma);

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
    prisma.diaryChatbox.findMany.mockResolvedValue([]);
    prisma.diaryMessage.findMany.mockResolvedValue([]);
    prisma.diaryTag.findMany.mockResolvedValue([]);
    prisma.diaryCustomPalette.findMany.mockResolvedValue([]);
    prisma.diaryOrder.findUnique.mockResolvedValue(null);

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
    scopedEmpty(prisma);

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
});
