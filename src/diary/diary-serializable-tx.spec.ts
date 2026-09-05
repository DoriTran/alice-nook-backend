import { ServiceUnavailableException } from '@nestjs/common';
import { withSerializableTransaction } from './diary-serializable-tx';
import { PrismaService } from '../prisma/prisma.service';
import { isRetryableColorConflict } from './diary-color';

function prismaError(code: string) {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

describe('withSerializableTransaction', () => {
  it('retries P2034 for color writes then succeeds', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(prismaError('P2034'))
        .mockResolvedValueOnce('ok'),
    };

    await expect(
      withSerializableTransaction(
        prisma as unknown as PrismaService,
        () => Promise.resolve('ok'),
        {
          isRetryable: isRetryableColorConflict,
          message: 'Diary color could not be updated. Please retry.',
        },
      ),
    ).resolves.toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry palette duplicate P2002', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { modelName: 'DiaryCustomPalette', target: ['id'] },
        }),
      ),
    };

    await expect(
      withSerializableTransaction(
        prisma as unknown as PrismaService,
        () => Promise.resolve('ok'),
        {
          isRetryable: isRetryableColorConflict,
          message: 'Diary color could not be updated. Please retry.',
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns 503 after three serialization failures', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(prismaError('P2034')),
    };

    await expect(
      withSerializableTransaction(
        prisma as unknown as PrismaService,
        () => Promise.resolve('ok'),
        {
          isRetryable: isRetryableColorConflict,
          message: 'Diary color could not be updated. Please retry.',
        },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
