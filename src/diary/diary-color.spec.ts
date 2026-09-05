import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  assertOwnedColorId,
  assertPaletteUnused,
  isCustomColorId,
  isPresetColorId,
  parseDiaryHex,
  toCustomColorId,
} from './diary-color';

describe('diary-color', () => {
  it('parses #RGB and #RRGGBB and rejects invalid values', () => {
    expect(parseDiaryHex('#ffe')).toBe('#FFFFEE');
    expect(parseDiaryHex('B69DF7')).toBe('#B69DF7');
    expect(parseDiaryHex('not-a-color')).toBeNull();
    expect(parseDiaryHex('#C7B2FF00')).toBeNull();
  });

  it('classifies preset and custom color ids', () => {
    expect(isPresetColorId('rose')).toBe(true);
    expect(isPresetColorId('custom:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(
      false,
    );
    expect(isCustomColorId('custom:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(
      true,
    );
    expect(toCustomColorId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(
      'custom:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });

  it('allows presets without a palette lookup', async () => {
    const db = { diaryCustomPalette: { findFirst: jest.fn() } };

    await expect(
      assertOwnedColorId(db as never, 'user-a', 'lavender'),
    ).resolves.toBeUndefined();
    expect(db.diaryCustomPalette.findFirst).not.toHaveBeenCalled();
  });

  it('requires an owned palette for custom color ids', async () => {
    const db = {
      diaryCustomPalette: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(
      assertOwnedColorId(
        db as never,
        'user-a',
        'custom:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.diaryCustomPalette.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: 'user-a',
      },
    });
  });

  it('rejects malformed custom color ids', async () => {
    const db = { diaryCustomPalette: { findFirst: jest.fn() } };

    await expect(
      assertOwnedColorId(db as never, 'user-a', 'custom:not-a-uuid'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.diaryCustomPalette.findFirst).not.toHaveBeenCalled();
  });

  it('rejects deleting a palette that is still referenced by any entity type', async () => {
    const paletteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await expect(
      assertPaletteUnused(
        {
          diaryGroup: {
            findFirst: jest.fn().mockResolvedValue({ id: 'gr:1' }),
          },
          diaryChatbox: { findFirst: jest.fn().mockResolvedValue(null) },
          diaryTag: { findFirst: jest.fn().mockResolvedValue(null) },
        } as never,
        'user-a',
        paletteId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      assertPaletteUnused(
        {
          diaryGroup: { findFirst: jest.fn().mockResolvedValue(null) },
          diaryChatbox: {
            findFirst: jest.fn().mockResolvedValue({ id: 'cb:1' }),
          },
          diaryTag: { findFirst: jest.fn().mockResolvedValue(null) },
        } as never,
        'user-a',
        paletteId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      assertPaletteUnused(
        {
          diaryGroup: { findFirst: jest.fn().mockResolvedValue(null) },
          diaryChatbox: { findFirst: jest.fn().mockResolvedValue(null) },
          diaryTag: { findFirst: jest.fn().mockResolvedValue({ id: 'tag:1' }) },
        } as never,
        'user-a',
        paletteId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
