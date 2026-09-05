import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapPrismaDiaryWriteError } from './diary-prisma-errors';

export const SERIALIZABLE_TX_MAX_ATTEMPTS = 3;

export async function withSerializableTransaction<T>(
  prisma: PrismaService,
  fn: (tx: PrismaService) => Promise<T>,
  options: {
    isRetryable: (error: unknown) => boolean;
    message: string;
    maxAttempts?: number;
  },
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? SERIALIZABLE_TX_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      if (options.isRetryable(error) && attempt < maxAttempts) {
        continue;
      }

      if (options.isRetryable(error)) {
        throw new ServiceUnavailableException(options.message);
      }

      return mapPrismaDiaryWriteError(error);
    }
  }

  throw new ServiceUnavailableException(options.message);
}
