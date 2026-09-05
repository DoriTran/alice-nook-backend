import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaKnownError } from './diary-prisma-errors';
import { withSerializableTransaction } from './diary-serializable-tx';
import { PALETTE_ID_REGEX, PRESET_COLOR_IDS } from './dto/diary-constraints';

const PRESET_COLOR_ID_SET = new Set<string>(PRESET_COLOR_IDS);
const CUSTOM_COLOR_PREFIX = 'custom:';

export const DIARY_COLOR_RETRY_MESSAGE =
  'Diary color could not be updated. Please retry.';
export const PALETTE_IN_USE_MESSAGE = 'Palette is in use.';

export function isPresetColorId(colorId: string): boolean {
  return PRESET_COLOR_ID_SET.has(colorId);
}

export function isCustomColorId(colorId: string): boolean {
  return colorId.startsWith(CUSTOM_COLOR_PREFIX);
}

export function getCustomPaletteId(colorId: string): string | null {
  if (!isCustomColorId(colorId)) {
    return null;
  }

  return colorId.slice(CUSTOM_COLOR_PREFIX.length);
}

export function toCustomColorId(paletteId: string): string {
  return `${CUSTOM_COLOR_PREFIX}${paletteId}`;
}

export function parseDiaryHex(value: string): string | null {
  const cleaned = value.trim().replace(/^#/, '');

  if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
    return `#${cleaned
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toUpperCase()}`;
  }

  if (/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }

  return null;
}

export function normalizePaletteShades(shades: {
  soft: string;
  main: string;
  strong: string;
}): { soft: string; main: string; strong: string } {
  const soft = parseDiaryHex(shades.soft);
  const main = parseDiaryHex(shades.main);
  const strong = parseDiaryHex(shades.strong);

  if (!soft || !main || !strong) {
    throw new BadRequestException('Invalid palette color');
  }

  return { soft, main, strong };
}

export function isRetryableColorConflict(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === 'P2034';
}

export async function withDiaryColorTransaction<T>(
  prisma: PrismaService,
  fn: (tx: PrismaService) => Promise<T>,
): Promise<T> {
  return withSerializableTransaction(prisma, fn, {
    isRetryable: isRetryableColorConflict,
    message: DIARY_COLOR_RETRY_MESSAGE,
  });
}

export async function assertOwnedColorId(
  db: Pick<PrismaService, 'diaryCustomPalette'>,
  userId: string,
  colorId: string,
): Promise<void> {
  if (isPresetColorId(colorId)) {
    return;
  }

  const paletteId = getCustomPaletteId(colorId);
  if (!paletteId || !PALETTE_ID_REGEX.test(paletteId)) {
    throw new BadRequestException('Invalid colorId');
  }

  const palette = await db.diaryCustomPalette.findFirst({
    where: { id: paletteId, userId },
  });

  if (!palette) {
    throw new NotFoundException();
  }
}

export async function assertPaletteUnused(
  db: Pick<PrismaService, 'diaryGroup' | 'diaryChatbox' | 'diaryTag'>,
  userId: string,
  paletteId: string,
): Promise<void> {
  const colorId = toCustomColorId(paletteId);
  const [group, chatbox, tag] = await Promise.all([
    db.diaryGroup.findFirst({
      where: { userId, colorId },
      select: { id: true },
    }),
    db.diaryChatbox.findFirst({
      where: { userId, colorId },
      select: { id: true },
    }),
    db.diaryTag.findFirst({
      where: { userId, colorId },
      select: { id: true },
    }),
  ]);

  if (group || chatbox || tag) {
    throw new ConflictException(PALETTE_IN_USE_MESSAGE);
  }
}
