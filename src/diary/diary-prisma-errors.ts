import { ConflictException, NotFoundException } from '@nestjs/common';

type PrismaKnownError = {
  code: string;
  meta?: Record<string, unknown>;
};

export function mapPrismaDiaryWriteError(error: unknown): never {
  if (isPrismaKnownError(error)) {
    if (error.code === 'P2002') {
      throw new ConflictException('Resource already exists');
    }

    if (error.code === 'P2025') {
      throw new NotFoundException();
    }

    if (error.code === 'P2003') {
      throw new NotFoundException();
    }
  }

  throw error;
}

export function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  );
}
