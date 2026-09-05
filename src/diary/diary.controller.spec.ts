import { Test, TestingModule } from '@nestjs/testing';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => undefined,
}));
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

describe('DiaryController', () => {
  let controller: DiaryController;
  const diaryService = {
    getSnapshot: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
    createChatbox: jest.fn(),
    updateChatbox: jest.fn(),
    moveChatbox: jest.fn(),
    deleteChatbox: jest.fn(),
    createTag: jest.fn(),
    updateTag: jest.fn(),
    deleteTag: jest.fn(),
    createPalette: jest.fn(),
    deletePalette: jest.fn(),
    syncSidebarLayout: jest.fn(),
    createMessage: jest.fn(),
    patchMessage: jest.fn(),
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
    setMessageTags: jest.fn(),
    removeTagFromChatbox: jest.fn(),
  };

  beforeEach(async () => {
    Object.values(diaryService).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiaryController],
      providers: [{ provide: DiaryService, useValue: diaryService }],
    }).compile();

    controller = module.get<DiaryController>(DiaryController);
  });

  it('reads the snapshot for the session user', async () => {
    const snapshot = {
      groups: [],
      chatboxes: [],
      messages: [],
      tags: [],
      palettes: [],
      orders: {
        rootOrders: [],
        groupChatboxOrders: {},
        chatboxMessageOrders: {},
      },
    };
    diaryService.getSnapshot.mockResolvedValue(snapshot);

    await expect(
      controller.getDiary({ user: { id: 'user-a' } } as never),
    ).resolves.toEqual(snapshot);
    expect(diaryService.getSnapshot).toHaveBeenCalledWith('user-a');
  });

  it('scopes group writes to the session user', async () => {
    const session = { user: { id: 'user-a' } } as never;
    const dto = { id: 'gr:1', name: 'Personal', colorId: 'rose' };

    diaryService.createGroup.mockResolvedValue(dto);
    await controller.createGroup(session, dto);
    expect(diaryService.createGroup).toHaveBeenCalledWith('user-a', dto);

    await controller.updateGroup(session, 'gr:1', { name: 'Home' });
    expect(diaryService.updateGroup).toHaveBeenCalledWith('user-a', 'gr:1', {
      name: 'Home',
    });

    await controller.deleteGroup(session, 'gr:1');
    expect(diaryService.deleteGroup).toHaveBeenCalledWith('user-a', 'gr:1');
  });

  it('scopes chatbox writes to the session user', async () => {
    const session = { user: { id: 'user-a' } } as never;

    await controller.createChatbox(session, {
      id: 'cb:1',
      name: 'Notes',
      colorId: 'sage',
    });
    await controller.updateChatbox(session, 'cb:1', { pinned: true });
    await controller.moveChatbox(session, 'cb:1', { groupId: null });
    await controller.deleteChatbox(session, 'cb:1');

    expect(diaryService.createChatbox).toHaveBeenCalledWith('user-a', {
      id: 'cb:1',
      name: 'Notes',
      colorId: 'sage',
    });
    expect(diaryService.updateChatbox).toHaveBeenCalledWith('user-a', 'cb:1', {
      pinned: true,
    });
    expect(diaryService.moveChatbox).toHaveBeenCalledWith('user-a', 'cb:1', {
      groupId: null,
    });
    expect(diaryService.deleteChatbox).toHaveBeenCalledWith('user-a', 'cb:1');
  });

  it('scopes tag writes to the session user', async () => {
    const session = { user: { id: 'user-a' } } as never;

    await controller.createTag(session, {
      id: 'tag:1',
      label: 'diary',
      colorId: 'lavender',
    });
    await controller.updateTag(session, 'tag:1', { label: 'journal' });
    await controller.deleteTag(session, 'tag:1');

    expect(diaryService.createTag).toHaveBeenCalledWith('user-a', {
      id: 'tag:1',
      label: 'diary',
      colorId: 'lavender',
    });
    expect(diaryService.updateTag).toHaveBeenCalledWith('user-a', 'tag:1', {
      label: 'journal',
    });
    expect(diaryService.deleteTag).toHaveBeenCalledWith('user-a', 'tag:1');
  });

  it('scopes palette writes to the session user', async () => {
    const session = { user: { id: 'user-a' } } as never;
    const dto = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Dream',
      baseColor: '#B69DF7',
      light: { soft: '#FFE5EC', main: '#F3A3B5', strong: '#D56B85' },
      dark: { soft: '#FFE5EC', main: '#F3A3B5', strong: '#D56B85' },
    };

    await controller.createPalette(session, dto);
    await controller.deletePalette(session, dto.id);

    expect(diaryService.createPalette).toHaveBeenCalledWith('user-a', dto);
    expect(diaryService.deletePalette).toHaveBeenCalledWith('user-a', dto.id);
  });

  it('scopes sidebar order writes to the session user', async () => {
    const session = { user: { id: 'user-a' } } as never;
    const dto = { rootOrders: ['cb:1'], groupChatboxOrders: {} };

    await controller.syncSidebarLayout(session, dto);
    expect(diaryService.syncSidebarLayout).toHaveBeenCalledWith('user-a', dto);
  });

  it('scopes message writes to the session user', async () => {
    const session = { user: { id: 'user-a' } } as never;
    const dto = {
      id: 'ms:1',
      chatboxId: 'cb:1',
      sender: 'user' as const,
      variant: 'text' as const,
      content: { json: { type: 'doc' }, preview: 'hi' },
    };

    await controller.createMessage(session, dto);
    await controller.patchMessage(session, 'ms:1', { pinned: true });
    await controller.editMessage(session, 'ms:1', {
      variant: 'text',
      content: dto.content,
    });
    await controller.setMessageTags(session, 'ms:1', { tagIds: [] });
    await controller.deleteMessage(session, 'ms:1');
    await controller.removeTagFromChatbox(session, 'cb:1', {
      tagId: 'tag:1',
    });

    expect(diaryService.createMessage).toHaveBeenCalledWith('user-a', dto);
    expect(diaryService.patchMessage).toHaveBeenCalledWith('user-a', 'ms:1', {
      pinned: true,
    });
    expect(diaryService.editMessage).toHaveBeenCalledWith('user-a', 'ms:1', {
      variant: 'text',
      content: dto.content,
    });
    expect(diaryService.setMessageTags).toHaveBeenCalledWith('user-a', 'ms:1', {
      tagIds: [],
    });
    expect(diaryService.deleteMessage).toHaveBeenCalledWith('user-a', 'ms:1');
    expect(diaryService.removeTagFromChatbox).toHaveBeenCalledWith(
      'user-a',
      'cb:1',
      { tagId: 'tag:1' },
    );
  });
});
