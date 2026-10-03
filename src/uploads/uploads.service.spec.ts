import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from './r2.service';
import { UploadsService } from './uploads.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

const USER_ID = 'user-a';
const ATTACHMENT_A = 'att:123e4567-e89b-42d3-a456-426614174000';
const ATTACHMENT_B = 'att:123e4567-e89b-42d3-a456-426614174001';

function createPrismaMock() {
  return {
    diaryAttachmentObject: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    diaryMessageAttachment: { findFirst: jest.fn() },
  };
}

describe('UploadsService attachment cleanup', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let r2: { delete: jest.Mock };
  let service: UploadsService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    prisma = createPrismaMock();
    r2 = { delete: jest.fn() };
    service = new UploadsService(
      prisma as unknown as PrismaService,
      r2 as unknown as R2Service,
    );
    prisma.diaryMessageAttachment.findFirst.mockResolvedValue(null);
    prisma.diaryAttachmentObject.deleteMany.mockResolvedValue({ count: 1 });
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('deletes R2 first and finalizes an eligible tracking row afterward', async () => {
    prisma.diaryAttachmentObject.findFirst.mockResolvedValue({
      id: ATTACHMENT_A,
      objectKey: 'users/user-a/attachments/a.png',
    });
    const order: string[] = [];
    r2.delete.mockImplementation(() => {
      order.push('r2');
      return Promise.resolve();
    });
    prisma.diaryAttachmentObject.deleteMany.mockImplementation(() => {
      order.push('db');
      return Promise.resolve({ count: 1 });
    });

    await service.cleanupPendingAttachment(USER_ID, ATTACHMENT_A);

    expect(order).toEqual(['r2', 'db']);
    expect(prisma.diaryAttachmentObject.findFirst).toHaveBeenCalledWith({
      where: {
        id: ATTACHMENT_A,
        userId: USER_ID,
        status: 'cleanup_pending',
      },
      select: { id: true, objectKey: true },
    });
  });

  it('does nothing for a non-owned or non-pending attachment', async () => {
    prisma.diaryAttachmentObject.findFirst.mockResolvedValue(null);

    await service.cleanupPendingAttachment(USER_ID, ATTACHMENT_A);

    expect(r2.delete).not.toHaveBeenCalled();
    expect(prisma.diaryAttachmentObject.deleteMany).not.toHaveBeenCalled();
  });

  it('rechecks references before deleting from R2', async () => {
    prisma.diaryAttachmentObject.findFirst.mockResolvedValue({
      id: ATTACHMENT_A,
      objectKey: 'users/user-a/attachments/a.png',
    });
    prisma.diaryMessageAttachment.findFirst.mockResolvedValue({
      attachmentId: ATTACHMENT_A,
    });

    await service.cleanupPendingAttachment(USER_ID, ATTACHMENT_A);

    expect(r2.delete).not.toHaveBeenCalled();
  });

  it('keeps cleanup retryable after R2 failure', async () => {
    prisma.diaryAttachmentObject.findFirst.mockResolvedValue({
      id: ATTACHMENT_A,
      objectKey: 'users/user-a/attachments/a.png',
    });
    r2.delete.mockRejectedValueOnce(new Error('temporary R2 failure'));

    await service.cleanupPendingAttachments(USER_ID, [ATTACHMENT_A]);

    expect(prisma.diaryAttachmentObject.deleteMany).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(ATTACHMENT_A),
    );
  });

  it('continues cleaning other attachments after one failure', async () => {
    prisma.diaryAttachmentObject.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({
        id: where.id,
        objectKey: `users/user-a/attachments/${where.id}.png`,
      }),
    );
    r2.delete
      .mockRejectedValueOnce(new Error('temporary R2 failure'))
      .mockResolvedValueOnce(undefined);

    await service.cleanupPendingAttachments(USER_ID, [
      ATTACHMENT_A,
      ATTACHMENT_B,
    ]);

    expect(r2.delete).toHaveBeenCalledTimes(2);
    expect(prisma.diaryAttachmentObject.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.diaryAttachmentObject.deleteMany).toHaveBeenCalledWith({
      where: {
        id: ATTACHMENT_B,
        userId: USER_ID,
        status: 'cleanup_pending',
      },
    });
  });

  it('is idempotent when the tracking row is already gone', async () => {
    prisma.diaryAttachmentObject.findFirst.mockResolvedValue(null);

    await service.cleanupPendingAttachments(USER_ID, [
      ATTACHMENT_A,
      ATTACHMENT_A,
    ]);

    expect(prisma.diaryAttachmentObject.findFirst).toHaveBeenCalledTimes(1);
    expect(r2.delete).not.toHaveBeenCalled();
  });
});
