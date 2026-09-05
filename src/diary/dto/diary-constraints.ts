import { Transform } from 'class-transformer';

export const GROUP_ID_REGEX = /^gr:.+$/;
export const CHATBOX_ID_REGEX = /^cb:.+$/;
export const TAG_ID_REGEX = /^tag:.+$/;
export const MESSAGE_ID_REGEX = /^ms:.+$/;

export const PRESET_COLOR_IDS = [
  'rose',
  'raspberry',
  'coral',
  'peach',
  'tangerine',
  'honey',
  'sage',
  'mint',
  'moss',
  'matcha',
  'sky',
  'cyan',
  'azure',
  'navy',
  'lavender',
  'violet',
  'plum',
  'lilac',
  'ivory',
  'cocoa',
] as const;

export const UUID_V4_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

export const PALETTE_ID_REGEX = new RegExp(`^${UUID_V4_PATTERN}$`);

export const COLOR_ID_REGEX = new RegExp(
  `^(?:${PRESET_COLOR_IDS.join('|')}|custom:${UUID_V4_PATTERN})$`,
);

export const DIARY_ID_MAX_LENGTH = 128;
export const DIARY_NAME_MAX_LENGTH = 100;
export const DIARY_LABEL_MAX_LENGTH = 100;
export const DIARY_ICON_MAX_LENGTH = 64;
export const DIARY_COLOR_ID_MAX_LENGTH = 80;
export const DIARY_DESCRIPTION_MAX_LENGTH = 2000;
export const PALETTE_NAME_MAX_LENGTH = 20;
export const PALETTE_DESCRIPTION_MAX_LENGTH = 40;

export function Trim() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
