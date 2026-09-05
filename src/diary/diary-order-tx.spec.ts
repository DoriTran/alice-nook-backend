import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  isRetryableDiaryOrderConflict,
  withDiaryOrderTransaction,
} from './diary-order-tx';
import { PrismaService } from '../prisma/prisma.service';

function prismaError(code: string, meta?: Record<string, unknown>) {
  const error = new Error(code) as Error & {
    code: string;
    meta?: Record<string, unknown>;
  };
  error.code = code;
  error.meta = meta;
  return error;
}

describe('withDiaryOrderTransaction', () => {
  it('retries P2034 then succeeds', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(prismaError('P2034'))
        .mockResolvedValueOnce('ok'),
    };

    await expect(
      withDiaryOrderTransaction(prisma as unknown as PrismaService, () =>
        Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retries first-write DiaryOrder P2002 then succeeds', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(
          prismaError('P2002', { modelName: 'DiaryOrder', target: ['userId'] }),
        )
        .mockResolvedValueOnce('ok'),
    };

    await expect(
      withDiaryOrderTransaction(prisma as unknown as PrismaService, () =>
        Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry Group duplicate P2002', async () => {
    const error = prismaError('P2002', {
      modelName: 'DiaryGroup',
      target: ['id'],
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(error),
    };

    await expect(
      withDiaryOrderTransaction(prisma as unknown as PrismaService, () =>
        Promise.resolve('ok'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns 503 after three serialization failures', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(prismaError('P2034')),
    };

    await expect(
      withDiaryOrderTransaction(prisma as unknown as PrismaService, () =>
        Promise.resolve('ok'),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('identifies retryable order conflicts', () => {
    expect(isRetryableDiaryOrderConflict(prismaError('P2034'))).toBe(true);
    expect(
      isRetryableDiaryOrderConflict(
        prismaError('P2002', { modelName: 'DiaryOrder', target: ['userId'] }),
      ),
    ).toBe(true);
    expect(
      isRetryableDiaryOrderConflict(
        prismaError('P2002', { modelName: 'DiaryChatbox', target: ['id'] }),
      ),
    ).toBe(false);
  });
});
