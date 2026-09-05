export type DiarySnapshot = {
  groups: DiaryGroupSnapshot[];
  chatboxes: DiaryChatboxSnapshot[];
  messages: DiaryMessageSnapshot[];
  tags: DiaryTagSnapshot[];
  palettes: DiaryPaletteSnapshot[];
  orders: DiaryOrdersSnapshot;
};

export type DiaryOrdersSnapshot = {
  rootOrders: string[];
  groupChatboxOrders: Record<string, string[]>;
  chatboxMessageOrders: Record<string, string[]>;
};

export type DiaryGroupSnapshot = {
  id: string;
  name: string;
  icon: string;
  colorId: string;
  createdAt: string;
  updatedAt: string | null;
};

export type DiaryChatboxTagStatistic = {
  tagId: string;
  count: number;
};

export type DiaryChatboxSnapshot = {
  id: string;
  groupId: string | null;
  name: string;
  description: string;
  icon: string;
  colorId: string;
  pinned: boolean;
  archived: boolean;
  hasUnread: boolean;
  notificationEnabled: boolean;
  tags: DiaryChatboxTagStatistic[];
  totalMessage: number;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type DiaryTagSnapshot = {
  id: string;
  label: string;
  colorId: string;
};

export type DiaryPaletteSnapshot = {
  id: string;
  name: string;
  description?: string;
  baseColor: string;
  light: unknown;
  dark: unknown;
  createdAt: string;
};

export type DiaryMessageSnapshot = {
  id: string;
  chatboxId: string;
  sender: string;
  variant: string;
  content: unknown;
  tagIds: string[];
  pinned: boolean;
  archived: boolean;
  replyToMessageId: string | null;
  sourceMessageId: string | null;
  reactions: unknown;
  edited: boolean;
  attachments: unknown;
  decorators: unknown;
  createdAt: string;
  updatedAt: string | null;
};
