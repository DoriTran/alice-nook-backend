import type {
  DiaryChatboxSnapshot,
  DiaryChatboxTagStatistic,
  DiaryGroupSnapshot,
  DiaryMessageSnapshot,
  DiaryOrdersSnapshot,
  DiaryPaletteSnapshot,
  DiaryTagSnapshot,
} from './dto/diary-snapshot';

export const EMPTY_ORDERS: DiaryOrdersSnapshot = {
  rootOrders: [],
  groupChatboxOrders: {},
  chatboxMessageOrders: {},
};

export type DiaryGroupRow = {
  id: string;
  name: string;
  icon: string;
  colorId: string;
  createdAt: Date;
  updatedAt: Date | null;
};

export type DiaryChatboxRow = {
  id: string;
  groupId: string | null;
  name: string;
  description: string;
  icon: string;
  colorId: string;
  pinned: boolean;
  archived: boolean;
  notificationEnabled: boolean;
  createdAt: Date;
  updatedAt: Date | null;
};

export type DiaryTagRow = {
  id: string;
  label: string;
  colorId: string;
};

export type DiaryMessageRow = {
  id: string;
  chatboxId: string;
  sender: string;
  variant: string;
  content: unknown;
  pinned: boolean;
  archived: boolean;
  replyToMessageId: string | null;
  sourceMessageId: string | null;
  reactions: unknown;
  attachments: unknown;
  decorators: unknown;
  edited: boolean;
  createdAt: Date;
  updatedAt: Date | null;
  messageTags: { tagId: string }[];
};

export type DiaryPaletteRow = {
  id: string;
  name: string;
  description: string | null;
  baseColor: string;
  light: unknown;
  dark: unknown;
  createdAt: Date;
};

export type DiaryOrderRow = {
  rootOrders: unknown;
  groupChatboxOrders: unknown;
  chatboxMessageOrders: unknown;
} | null;

export function mapGroup(group: DiaryGroupRow): DiaryGroupSnapshot {
  return {
    id: group.id,
    name: group.name,
    icon: group.icon,
    colorId: group.colorId,
    createdAt: group.createdAt.toISOString(),
    updatedAt: toIso(group.updatedAt),
  };
}

export function mapTag(tag: DiaryTagRow): DiaryTagSnapshot {
  return {
    id: tag.id,
    label: tag.label,
    colorId: tag.colorId,
  };
}

export function mapPalette(palette: DiaryPaletteRow): DiaryPaletteSnapshot {
  return {
    id: palette.id,
    name: palette.name,
    ...(palette.description != null && palette.description !== ''
      ? { description: palette.description }
      : {}),
    baseColor: palette.baseColor,
    light: palette.light,
    dark: palette.dark,
    createdAt: palette.createdAt.toISOString(),
  };
}

export function mapOrders(orderRow: DiaryOrderRow): DiaryOrdersSnapshot {
  if (!orderRow) {
    return {
      rootOrders: [...EMPTY_ORDERS.rootOrders],
      groupChatboxOrders: {},
      chatboxMessageOrders: {},
    };
  }

  return {
    rootOrders: asStringArray(orderRow.rootOrders),
    groupChatboxOrders: asStringArrayMap(orderRow.groupChatboxOrders),
    chatboxMessageOrders: asStringArrayMap(orderRow.chatboxMessageOrders),
  };
}

export function mapMessage(message: DiaryMessageRow): DiaryMessageSnapshot {
  return {
    id: message.id,
    chatboxId: message.chatboxId,
    sender: message.sender,
    variant: message.variant,
    content: message.content,
    tagIds: message.messageTags.map((join) => join.tagId),
    pinned: message.pinned,
    archived: message.archived,
    replyToMessageId: message.replyToMessageId,
    sourceMessageId: message.sourceMessageId,
    reactions: asJsonArray(message.reactions),
    edited: message.edited,
    attachments: asJsonArray(message.attachments),
    decorators: asJsonArray(message.decorators),
    createdAt: message.createdAt.toISOString(),
    updatedAt: toIso(message.updatedAt),
  };
}

export function mapChatbox(
  chatbox: DiaryChatboxRow,
  messages: DiaryMessageSnapshot[],
  messagesById: Map<string, DiaryMessageSnapshot>,
  orders: DiaryOrdersSnapshot,
): DiaryChatboxSnapshot {
  const derived = deriveChatboxFields(
    chatbox.id,
    messages,
    messagesById,
    orders,
  );

  return {
    id: chatbox.id,
    groupId: chatbox.groupId,
    name: chatbox.name,
    description: chatbox.description,
    icon: chatbox.icon,
    colorId: chatbox.colorId,
    pinned: chatbox.pinned,
    archived: chatbox.archived,
    hasUnread: false,
    notificationEnabled: chatbox.notificationEnabled,
    tags: derived.tags,
    totalMessage: derived.totalMessage,
    lastMessageId: derived.lastMessageId,
    lastMessageAt: derived.lastMessageAt,
    createdAt: chatbox.createdAt.toISOString(),
    updatedAt: toIso(chatbox.updatedAt),
  };
}

export function deriveChatboxFields(
  chatboxId: string,
  messages: DiaryMessageSnapshot[],
  messagesById: Map<string, DiaryMessageSnapshot>,
  orders: DiaryOrdersSnapshot,
): {
  totalMessage: number;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  tags: DiaryChatboxTagStatistic[];
} {
  const orderedIds = orders.chatboxMessageOrders[chatboxId];
  const messageIds =
    orderedIds ??
    messages
      .filter((message) => message.chatboxId === chatboxId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((message) => message.id);

  const totalMessage = messageIds.length;
  const lastMessageId = messageIds.at(-1) ?? null;
  const lastMessageAt = lastMessageId
    ? (messagesById.get(lastMessageId)?.createdAt ?? null)
    : null;

  const counts = new Map<string, number>();

  for (const messageId of messageIds) {
    const message = messagesById.get(messageId);

    if (!message) {
      continue;
    }

    for (const tagId of message.tagIds) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
  }

  const tags = Array.from(counts.entries()).map(([tagId, count]) => ({
    tagId,
    count,
  }));

  return {
    totalMessage,
    lastMessageId,
    lastMessageAt,
    tags,
  };
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function asStringArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string[]> = {};

  for (const [key, ids] of Object.entries(value)) {
    result[key] = asStringArray(ids);
  }

  return result;
}
