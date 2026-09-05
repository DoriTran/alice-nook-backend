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
  };

  beforeEach(async () => {
    diaryService.getSnapshot.mockReset();

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
});
