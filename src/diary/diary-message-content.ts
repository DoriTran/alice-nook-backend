import {
  isJsonValue,
  isPlainObject,
  RICH_TEXT_PREVIEW_MAX_LENGTH,
} from './diary-json';
import { DIARY_ID_MAX_LENGTH } from './dto/diary-constraints';

const ATTACHMENT_TYPES = new Set([
  'image',
  'video',
  'audio',
  'document',
  'note',
  'archive',
  'code',
  'file',
  'link',
]);

const TICKET_STATES = new Set(['todo', 'doing', 'done']);
const TICKET_PLACEMENTS = new Set(['inside', 'outside']);
const TIMER_MODES = new Set(['timer', 'countup', 'datetime']);

export function assertRichTextContent(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return 'RichTextContent must be an object';
  }

  const keys = Object.keys(value);
  if (
    !keys.includes('json') ||
    !keys.includes('preview') ||
    keys.some((key) => key !== 'json' && key !== 'preview')
  ) {
    return 'RichTextContent must have only json and preview';
  }

  if (typeof value.preview !== 'string') {
    return 'preview must be a string';
  }

  if (value.preview.length > RICH_TEXT_PREVIEW_MAX_LENGTH) {
    return 'preview is too long';
  }

  if (!isPlainObject(value.json) || !isJsonValue(value.json)) {
    return 'json must be a plain JSON object';
  }

  if (value.json.type !== 'doc') {
    return 'json.type must be doc';
  }

  if (
    Object.prototype.hasOwnProperty.call(value.json, 'content') &&
    !Array.isArray(value.json.content)
  ) {
    return 'json.content must be an array';
  }

  return null;
}

export function assertTodoContent(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return 'Todo content must be an object';
  }

  if (!Array.isArray(value.items)) {
    return 'Todo content.items must be an array';
  }

  if (value.items.length < 1) {
    return 'Todo content.items must contain at least one item';
  }

  const ids = new Set<string>();

  for (const item of value.items) {
    if (!isPlainObject(item)) {
      return 'Todo item must be an object';
    }

    if (typeof item.id !== 'string' || item.id.length === 0) {
      return 'Todo item id is required';
    }

    if (item.id.length > DIARY_ID_MAX_LENGTH) {
      return 'Todo item id is too long';
    }

    if (ids.has(item.id)) {
      return 'Duplicate todo item id';
    }

    ids.add(item.id);

    if (typeof item.completed !== 'boolean') {
      return 'Todo item completed must be a boolean';
    }

    const contentError = assertRichTextContent(item.content);
    if (contentError) {
      return contentError;
    }

    const attachmentsError = assertAttachments(item.attachments);
    if (attachmentsError) {
      return attachmentsError;
    }
  }

  return null;
}

export function assertMessageContent(
  variant: string,
  content: unknown,
): string | null {
  if (variant === 'text' || variant === 'ai') {
    return assertRichTextContent(content);
  }

  if (variant === 'todo') {
    return assertTodoContent(content);
  }

  return 'variant is invalid';
}

export function assertAttachments(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return 'attachments must be an array';
  }

  for (const item of value) {
    if (!isPlainObject(item) || !isJsonValue(item)) {
      return 'attachment must be a JSON object';
    }

    if (typeof item.id !== 'string' || item.id.length === 0) {
      return 'attachment id is required';
    }

    if (typeof item.type !== 'string' || !ATTACHMENT_TYPES.has(item.type)) {
      return 'attachment type is invalid';
    }

    if (typeof item.url !== 'string' || item.url.length === 0) {
      return 'attachment url is required';
    }
  }

  return null;
}

export function assertDecorators(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return 'decorators must be an array';
  }

  for (const item of value) {
    if (!isPlainObject(item) || !isJsonValue(item)) {
      return 'decorator must be a JSON object';
    }

    if (item.type === 'ticket') {
      if (typeof item.ticked !== 'boolean') {
        return 'ticket ticked must be a boolean';
      }

      if (typeof item.state !== 'string' || !TICKET_STATES.has(item.state)) {
        return 'ticket state is invalid';
      }

      if (
        item.placement !== undefined &&
        (typeof item.placement !== 'string' ||
          !TICKET_PLACEMENTS.has(item.placement))
      ) {
        return 'ticket placement is invalid';
      }

      continue;
    }

    if (item.type === 'timer') {
      if (
        typeof item.mode !== 'string' ||
        !TIMER_MODES.has(item.mode) ||
        typeof item.pause !== 'boolean' ||
        typeof item.running !== 'boolean' ||
        typeof item.durationMs !== 'number' ||
        !Number.isFinite(item.durationMs) ||
        typeof item.initialDurationMs !== 'number' ||
        !Number.isFinite(item.initialDurationMs) ||
        typeof item.targetDate !== 'string' ||
        (item.startedAt !== null && typeof item.startedAt !== 'string') ||
        (item.deadlineAt !== null && typeof item.deadlineAt !== 'string')
      ) {
        return 'timer decorator is invalid';
      }

      continue;
    }

    return 'decorator type is invalid';
  }

  return null;
}

export function assertReactions(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return 'reactions must be an array';
  }

  const emojis = new Set<string>();

  for (const item of value) {
    if (!isPlainObject(item) || !isJsonValue(item)) {
      return 'reaction must be a JSON object';
    }

    if (typeof item.emoji !== 'string' || item.emoji.length === 0) {
      return 'reaction emoji is required';
    }

    if (typeof item.count !== 'number' || !Number.isFinite(item.count)) {
      return 'reaction count must be a finite number';
    }

    if (emojis.has(item.emoji)) {
      return 'Duplicate reaction emoji';
    }

    emojis.add(item.emoji);
  }

  return null;
}
