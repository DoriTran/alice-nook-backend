import type { DiaryOrdersSnapshot } from './dto/diary-snapshot';

export class InvalidSidebarLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSidebarLayoutError';
  }
}

export type SidebarLayout = {
  rootOrders: string[];
  groupChatboxOrders: Record<string, string[]>;
};

export type OrderedChild = {
  id: string;
  createdAt: Date;
};

export function cloneOrders(orders: DiaryOrdersSnapshot): DiaryOrdersSnapshot {
  return {
    rootOrders: [...orders.rootOrders],
    groupChatboxOrders: cloneStringArrayMap(orders.groupChatboxOrders),
    chatboxMessageOrders: cloneStringArrayMap(orders.chatboxMessageOrders),
  };
}

export function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export function appendGroup(
  orders: DiaryOrdersSnapshot,
  groupId: string,
): DiaryOrdersSnapshot {
  const next = cloneOrders(orders);
  next.rootOrders = uniqueIds([...next.rootOrders, groupId]);
  next.groupChatboxOrders[groupId] = [];
  return next;
}

export function appendChatbox(
  orders: DiaryOrdersSnapshot,
  chatboxId: string,
  groupId: string | null,
): DiaryOrdersSnapshot {
  const next = cloneOrders(orders);

  if (groupId) {
    next.groupChatboxOrders[groupId] = uniqueIds([
      ...(next.groupChatboxOrders[groupId] ?? []),
      chatboxId,
    ]);
  } else {
    next.rootOrders = uniqueIds([...next.rootOrders, chatboxId]);
  }

  next.chatboxMessageOrders[chatboxId] = [];
  return next;
}

export function appendMessage(
  orders: DiaryOrdersSnapshot,
  chatboxId: string,
  messageId: string,
): DiaryOrdersSnapshot {
  const next = cloneOrders(orders);
  next.chatboxMessageOrders[chatboxId] = uniqueIds([
    ...(next.chatboxMessageOrders[chatboxId] ?? []),
    messageId,
  ]);
  return next;
}

export function deleteMessageOrders(
  orders: DiaryOrdersSnapshot,
  chatboxId: string,
  messageId: string,
): DiaryOrdersSnapshot {
  const next = cloneOrders(orders);
  next.chatboxMessageOrders[chatboxId] = (
    next.chatboxMessageOrders[chatboxId] ?? []
  ).filter((id) => id !== messageId);
  return next;
}

export function moveChatboxOrders(
  orders: DiaryOrdersSnapshot,
  chatboxId: string,
  sourceGroupId: string | null,
  targetGroupId: string | null,
): DiaryOrdersSnapshot {
  const next = cloneOrders(orders);

  if (sourceGroupId) {
    next.groupChatboxOrders[sourceGroupId] = (
      next.groupChatboxOrders[sourceGroupId] ?? []
    ).filter((id) => id !== chatboxId);
  } else {
    next.rootOrders = next.rootOrders.filter((id) => id !== chatboxId);
  }

  if (targetGroupId) {
    next.groupChatboxOrders[targetGroupId] = uniqueIds([
      ...(next.groupChatboxOrders[targetGroupId] ?? []),
      chatboxId,
    ]);
  } else {
    next.rootOrders = uniqueIds([...next.rootOrders, chatboxId]);
  }

  return next;
}

export function deleteChatboxOrders(
  orders: DiaryOrdersSnapshot,
  chatboxId: string,
  groupId: string | null,
): DiaryOrdersSnapshot {
  const next = cloneOrders(orders);
  next.rootOrders = next.rootOrders.filter((id) => id !== chatboxId);

  if (groupId && next.groupChatboxOrders[groupId]) {
    next.groupChatboxOrders[groupId] = next.groupChatboxOrders[groupId].filter(
      (id) => id !== chatboxId,
    );
  }

  delete next.chatboxMessageOrders[chatboxId];
  return next;
}

export function deleteGroupOrders(
  orders: DiaryOrdersSnapshot,
  groupId: string,
  leftoverChildren: ReadonlyArray<OrderedChild>,
): DiaryOrdersSnapshot {
  const next = cloneOrders(orders);
  const orderedChildren = next.groupChatboxOrders[groupId] ?? [];
  const orderedSet = new Set(orderedChildren);
  const leftovers = leftoverChildren
    .filter((child) => !orderedSet.has(child.id))
    .slice()
    .sort((left, right) => {
      const byTime = left.createdAt.getTime() - right.createdAt.getTime();
      if (byTime !== 0) {
        return byTime;
      }

      return left.id.localeCompare(right.id);
    })
    .map((child) => child.id);

  next.rootOrders = uniqueIds(
    next.rootOrders
      .filter((id) => id !== groupId)
      .concat(orderedChildren, leftovers),
  );
  delete next.groupChatboxOrders[groupId];
  return next;
}

export function applySidebarLayout(
  orders: DiaryOrdersSnapshot,
  layout: SidebarLayout,
): DiaryOrdersSnapshot {
  return {
    rootOrders: uniqueIds(layout.rootOrders),
    groupChatboxOrders: Object.fromEntries(
      Object.entries(layout.groupChatboxOrders).map(([groupId, chatboxIds]) => [
        groupId,
        uniqueIds(chatboxIds),
      ]),
    ),
    chatboxMessageOrders: cloneStringArrayMap(orders.chatboxMessageOrders),
  };
}

export function assertValidSidebarLayout(
  layout: SidebarLayout,
  ownedGroupIds: ReadonlySet<string>,
  ownedChatboxIds: ReadonlySet<string>,
): void {
  if (
    layout.groupChatboxOrders === null ||
    typeof layout.groupChatboxOrders !== 'object' ||
    Array.isArray(layout.groupChatboxOrders)
  ) {
    throw new InvalidSidebarLayoutError(
      'groupChatboxOrders must be an object of string arrays',
    );
  }

  if (hasDuplicate(layout.rootOrders)) {
    throw new InvalidSidebarLayoutError('Duplicate id in rootOrders');
  }

  for (const id of layout.rootOrders) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new InvalidSidebarLayoutError('Invalid id in rootOrders');
    }

    if (!ownedGroupIds.has(id) && !ownedChatboxIds.has(id)) {
      throw new InvalidSidebarLayoutError(
        'Unknown or unowned id in sidebar layout',
      );
    }
  }

  const chatboxesInGroups = new Set<string>();

  for (const [groupId, chatboxIds] of Object.entries(
    layout.groupChatboxOrders,
  )) {
    if (!ownedGroupIds.has(groupId)) {
      throw new InvalidSidebarLayoutError(
        'Unknown or unowned id in sidebar layout',
      );
    }

    const appearances = layout.rootOrders.filter((id) => id === groupId).length;
    if (appearances !== 1) {
      throw new InvalidSidebarLayoutError(
        'groupChatboxOrders key must appear exactly once in rootOrders',
      );
    }

    if (!Array.isArray(chatboxIds)) {
      throw new InvalidSidebarLayoutError(
        'groupChatboxOrders values must be string arrays',
      );
    }

    if (hasDuplicate(chatboxIds)) {
      throw new InvalidSidebarLayoutError('Duplicate id in groupChatboxOrders');
    }

    for (const chatboxId of chatboxIds) {
      if (typeof chatboxId !== 'string' || chatboxId.length === 0) {
        throw new InvalidSidebarLayoutError('Invalid id in groupChatboxOrders');
      }

      if (!ownedChatboxIds.has(chatboxId)) {
        throw new InvalidSidebarLayoutError(
          'Unknown or unowned id in sidebar layout',
        );
      }

      if (layout.rootOrders.includes(chatboxId)) {
        throw new InvalidSidebarLayoutError(
          'Chatbox cannot appear in both rootOrders and a group list',
        );
      }

      if (chatboxesInGroups.has(chatboxId)) {
        throw new InvalidSidebarLayoutError(
          'Chatbox cannot appear in more than one group list',
        );
      }

      chatboxesInGroups.add(chatboxId);
    }
  }
}

function cloneStringArrayMap(
  value: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(value).map(([key, ids]) => [key, [...ids]]),
  );
}

function hasDuplicate(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}
