import { DiaryDb, PrismaService } from '../prisma/prisma.service';
import { isPrismaKnownError } from './diary-prisma-errors';
import {
  SERIALIZABLE_TX_MAX_ATTEMPTS,
  withSerializableTransaction,
} from './diary-serializable-tx';

export const DIARY_ORDER_TX_MAX_ATTEMPTS = SERIALIZABLE_TX_MAX_ATTEMPTS;
export const DIARY_ORDER_RETRY_MESSAGE =
  'Diary order could not be updated. Please retry.';

export async function withDiaryOrderTransaction<T>(
  prisma: PrismaService,
  fn: (tx: DiaryDb) => Promise<T>,
): Promise<T> {
  return withSerializableTransaction(prisma, fn, {
    isRetryable: isRetryableDiaryOrderConflict,
    message: DIARY_ORDER_RETRY_MESSAGE,
  });
}

export function isRetryableDiaryOrderConflict(error: unknown): boolean {
  if (!isPrismaKnownError(error)) {
    return false;
  }

  if (error.code === 'P2034') {
    return true;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  const meta = error.meta ?? {};
  const modelName = typeof meta.modelName === 'string' ? meta.modelName : '';
  if (modelName === 'DiaryOrder') {
    return true;
  }

  const target = meta.target;
  const targets = Array.isArray(target)
    ? target.map(String)
    : typeof target === 'string'
      ? [target]
      : [];
  const looksLikeDiaryOrder = JSON.stringify(meta)
    .toLowerCase()
    .includes('diary_order');
  const isUserIdTarget = targets.some((value) => value.includes('userId'));

  return looksLikeDiaryOrder && isUserIdTarget;
}
