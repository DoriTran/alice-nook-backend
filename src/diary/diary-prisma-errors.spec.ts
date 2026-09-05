import { ConflictException, NotFoundException } from '@nestjs/common';
import { mapPrismaDiaryWriteError } from './diary-prisma-errors';

function prismaError(code: string, meta?: Record<string, unknown>) {
  const error = new Error(code) as Error & {
    code: string;
    meta?: Record<string, unknown>;
  };
  error.code = code;
  error.meta = meta;
  return error;
}

describe('mapPrismaDiaryWriteError', () => {
  it('maps P2002 to 409', () => {
    expect(() => mapPrismaDiaryWriteError(prismaError('P2002'))).toThrow(
      ConflictException,
    );
  });

  it('maps P2025 to 404', () => {
    expect(() => mapPrismaDiaryWriteError(prismaError('P2025'))).toThrow(
      NotFoundException,
    );
  });

  it('maps Chatbox groupId P2003 to 404', () => {
    expect(() =>
      mapPrismaDiaryWriteError(prismaError('P2003', { field_name: 'groupId' })),
    ).toThrow(NotFoundException);
  });

  it('rethrows unknown errors', () => {
    const error = new Error('boom');
    expect(() => mapPrismaDiaryWriteError(error)).toThrow(error);
  });
});
