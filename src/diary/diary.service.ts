import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiaryDb, PrismaService } from '../prisma/prisma.service';
import {
  assertOwnedColorId,
  assertPaletteUnused,
  isCustomColorId,
  normalizePaletteShades,
  parseDiaryHex,
  withDiaryColorTransaction,
} from './diary-color';
import { withDiaryOrderTransaction } from './diary-order-tx';
import { mapPrismaDiaryWriteError } from './diary-prisma-errors';
import {
  appendChatbox,
  appendGroup,
  appendMessage,
  applySidebarLayout,
  assertValidSidebarLayout,
  deleteChatboxOrders,
  deleteGroupOrders,
  deleteMessageOrders,
  InvalidSidebarLayoutError,
  moveChatboxOrders,
} from './diary-orders';
import {
  mapChatbox,
  mapGroup,
  mapMessage,
  mapOrders,
  mapPalette,
  mapTag,
  type DiaryChatboxRow,
  type DiaryMessageRow,
} from './diary.mapper';
import type { CreateChatboxDto } from './dto/create-chatbox.dto';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { CreateMessageDto } from './dto/create-message.dto';
import type { CreatePaletteDto } from './dto/create-palette.dto';
import type { CreateTagDto } from './dto/create-tag.dto';
import type {
  DiaryChatboxSnapshot,
  DiaryGroupSnapshot,
  DiaryMessageSnapshot,
  DiaryOrdersSnapshot,
  DiaryPaletteSnapshot,
  DiarySnapshot,
  DiaryTagSnapshot,
} from './dto/diary-snapshot';
import type { EditMessageDto } from './dto/edit-message.dto';
import type { MoveChatboxDto } from './dto/move-chatbox.dto';
import type { PatchMessageDto } from './dto/patch-message.dto';
import type { RemoveChatboxTagDto } from './dto/remove-chatbox-tag.dto';
import type { SetMessageTagsDto } from './dto/set-message-tags.dto';
import type { SyncSidebarLayoutDto } from './dto/sync-sidebar-layout.dto';
import type { UpdateChatboxDto } from './dto/update-chatbox.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';
import type { UpdateTagDto } from './dto/update-tag.dto';

const MESSAGE_TAG_INCLUDE = {
  messageTags: { select: { tagId: true } },
} as const;

@Injectable()
export class DiaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(userId: string): Promise<DiarySnapshot> {
    const [groups, chatboxes, messages, tags, palettes, orderRow] =
      await Promise.all([
        this.prisma.diaryGroup.findMany({ where: { userId } }),
        this.prisma.diaryChatbox.findMany({ where: { userId } }),
        this.prisma.diaryMessage.findMany({
          where: { userId },
          include: MESSAGE_TAG_INCLUDE,
        }),
        this.prisma.diaryTag.findMany({ where: { userId } }),
        this.prisma.diaryCustomPalette.findMany({ where: { userId } }),
        this.prisma.diaryOrder.findUnique({ where: { userId } }),
      ]);

    const mappedMessages = messages.map((message) => mapMessage(message));
    const messagesById = new Map(
      mappedMessages.map((message) => [message.id, message]),
    );
    const orders = mapOrders(orderRow);

    return {
      groups: groups.map((group) => mapGroup(group)),
      chatboxes: chatboxes.map((chatbox) =>
        mapChatbox(chatbox, mappedMessages, messagesById, orders),
      ),
      messages: mappedMessages,
      tags: tags.map((tag) => mapTag(tag)),
      palettes: palettes.map((palette) => mapPalette(palette)),
      orders,
    };
  }

  async createGroup(
    userId: string,
    dto: CreateGroupDto,
  ): Promise<DiaryGroupSnapshot> {
    return withDiaryOrderTransaction(this.prisma, async (tx) => {
      await assertOwnedColorId(tx, userId, dto.colorId);
      const group = await tx.diaryGroup.create({
        data: {
          id: dto.id,
          userId,
          name: dto.name,
          icon: dto.icon ?? '',
          colorId: dto.colorId,
          updatedAt: null,
        },
      });

      const orders = await this.loadOrders(tx, userId);
      await this.saveOrders(tx, userId, appendGroup(orders, group.id));
      return mapGroup(group);
    });
  }

  async updateGroup(
    userId: string,
    id: string,
    dto: UpdateGroupDto,
  ): Promise<DiaryGroupSnapshot> {
    return this.writeWithColorId(userId, dto.colorId, async (db) => {
      await this.requireOwnedGroup(db, userId, id);

      try {
        const group = await db.diaryGroup.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
            ...(dto.colorId !== undefined ? { colorId: dto.colorId } : {}),
            updatedAt: new Date(),
          },
        });

        return mapGroup(group);
      } catch (error) {
        return mapPrismaDiaryWriteError(error);
      }
    });
  }

  async deleteGroup(userId: string, id: string): Promise<void> {
    await withDiaryOrderTransaction(this.prisma, async (tx) => {
      await this.requireOwnedGroup(tx, userId, id);
      const orders = await this.loadOrders(tx, userId);
      const children = await tx.diaryChatbox.findMany({
        where: { userId, groupId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, createdAt: true },
      });
      const next = deleteGroupOrders(orders, id, children);

      await tx.diaryGroup.delete({ where: { id } });
      await this.saveOrders(tx, userId, next);
    });
  }

  async createChatbox(
    userId: string,
    dto: CreateChatboxDto,
  ): Promise<DiaryChatboxSnapshot> {
    const groupId = dto.groupId ?? null;

    return withDiaryOrderTransaction(this.prisma, async (tx) => {
      if (groupId) {
        await this.requireOwnedGroup(tx, userId, groupId);
      }
      await assertOwnedColorId(tx, userId, dto.colorId);

      const chatbox = await tx.diaryChatbox.create({
        data: {
          id: dto.id,
          userId,
          groupId,
          name: dto.name,
          description: dto.description ?? '',
          icon: dto.icon ?? '',
          colorId: dto.colorId,
          pinned: false,
          archived: false,
          notificationEnabled: false,
          updatedAt: null,
        },
      });

      const orders = await this.loadOrders(tx, userId);
      await this.saveOrders(
        tx,
        userId,
        appendChatbox(orders, chatbox.id, groupId),
      );
      return this.toChatboxSnapshot(tx, userId, chatbox);
    });
  }

  async updateChatbox(
    userId: string,
    id: string,
    dto: UpdateChatboxDto,
  ): Promise<DiaryChatboxSnapshot> {
    return this.writeWithColorId(userId, dto.colorId, async (db) => {
      await this.requireOwnedChatbox(db, userId, id);

      try {
        const chatbox = await db.diaryChatbox.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description }
              : {}),
            ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
            ...(dto.colorId !== undefined ? { colorId: dto.colorId } : {}),
            ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
            ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
            ...(dto.notificationEnabled !== undefined
              ? { notificationEnabled: dto.notificationEnabled }
              : {}),
            updatedAt: new Date(),
          },
        });

        return this.toChatboxSnapshot(db, userId, chatbox);
      } catch (error) {
        return mapPrismaDiaryWriteError(error);
      }
    });
  }

  async moveChatbox(
    userId: string,
    id: string,
    dto: MoveChatboxDto,
  ): Promise<DiaryChatboxSnapshot> {
    const chatbox = await this.requireOwnedChatbox(this.prisma, userId, id);

    if (chatbox.groupId === dto.groupId) {
      return this.toChatboxSnapshot(this.prisma, userId, chatbox);
    }

    return withDiaryOrderTransaction(this.prisma, async (tx) => {
      const current = await this.requireOwnedChatbox(tx, userId, id);

      if (current.groupId === dto.groupId) {
        return this.toChatboxSnapshot(tx, userId, current);
      }

      if (dto.groupId) {
        await this.requireOwnedGroup(tx, userId, dto.groupId);
      }

      const updated = await tx.diaryChatbox.update({
        where: { id },
        data: {
          groupId: dto.groupId,
          updatedAt: new Date(),
        },
      });

      const orders = await this.loadOrders(tx, userId);
      await this.saveOrders(
        tx,
        userId,
        moveChatboxOrders(orders, id, current.groupId, dto.groupId),
      );
      return this.toChatboxSnapshot(tx, userId, updated);
    });
  }

  async deleteChatbox(userId: string, id: string): Promise<void> {
    await withDiaryOrderTransaction(this.prisma, async (tx) => {
      const chatbox = await this.requireOwnedChatbox(tx, userId, id);
      const orders = await this.loadOrders(tx, userId);
      const next = deleteChatboxOrders(orders, id, chatbox.groupId);

      await tx.diaryChatbox.delete({ where: { id } });
      await this.saveOrders(tx, userId, next);
    });
  }

  async syncSidebarLayout(
    userId: string,
    dto: SyncSidebarLayoutDto,
  ): Promise<DiaryOrdersSnapshot> {
    return withDiaryOrderTransaction(this.prisma, async (tx) => {
      const [groups, chatboxes, orders] = await Promise.all([
        tx.diaryGroup.findMany({
          where: { userId },
          select: { id: true },
        }),
        tx.diaryChatbox.findMany({
          where: { userId },
          select: { id: true, groupId: true },
        }),
        this.loadOrders(tx, userId),
      ]);

      try {
        assertValidSidebarLayout(
          dto,
          new Set(groups.map((group) => group.id)),
          new Set(chatboxes.map((chatbox) => chatbox.id)),
        );
      } catch (error) {
        if (error instanceof InvalidSidebarLayoutError) {
          throw new BadRequestException(error.message);
        }

        throw error;
      }

      const next = applySidebarLayout(orders, dto);
      const chatboxById = new Map(
        chatboxes.map((chatbox) => [chatbox.id, chatbox]),
      );
      const groupedChatboxIds = new Set(
        Object.values(dto.groupChatboxOrders).flat(),
      );

      for (const id of dto.rootOrders) {
        const chatbox = chatboxById.get(id);
        if (!chatbox || groupedChatboxIds.has(id) || chatbox.groupId === null) {
          continue;
        }

        await tx.diaryChatbox.update({
          where: { id },
          data: { groupId: null, updatedAt: new Date() },
        });
      }

      for (const [groupId, chatboxIds] of Object.entries(
        dto.groupChatboxOrders,
      )) {
        for (const chatboxId of chatboxIds) {
          const chatbox = chatboxById.get(chatboxId);
          if (!chatbox || chatbox.groupId === groupId) {
            continue;
          }

          await tx.diaryChatbox.update({
            where: { id: chatboxId },
            data: { groupId, updatedAt: new Date() },
          });
        }
      }

      await this.saveOrders(tx, userId, next);
      return next;
    });
  }

  async createMessage(
    userId: string,
    dto: CreateMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    const tagIds = dto.tagIds ?? [];

    return withDiaryOrderTransaction(this.prisma, async (tx) => {
      await this.requireOwnedChatbox(tx, userId, dto.chatboxId);
      await this.requireOwnedTags(tx, userId, tagIds);
      await this.requireLiveReply(tx, userId, dto.replyToMessageId);
      await this.requireSourceLineage(tx, userId, dto.sourceMessageId);

      const message = await tx.diaryMessage.create({
        data: {
          id: dto.id,
          userId,
          chatboxId: dto.chatboxId,
          sender: dto.sender,
          variant: dto.variant,
          content: dto.content as object,
          pinned: dto.pinned ?? false,
          archived: dto.archived ?? false,
          replyToMessageId: dto.replyToMessageId ?? null,
          sourceMessageId: dto.sourceMessageId ?? null,
          reactions: dto.reactions ?? [],
          attachments: dto.attachments ?? [],
          decorators: dto.decorators ?? [],
          edited: false,
          updatedAt: null,
        },
      });

      if (tagIds.length > 0) {
        await tx.diaryMessageTag.createMany({
          data: tagIds.map((tagId) => ({
            messageId: message.id,
            tagId,
            userId,
          })),
        });
      }

      const orders = await this.loadOrders(tx, userId);
      await this.saveOrders(
        tx,
        userId,
        appendMessage(orders, dto.chatboxId, message.id),
      );

      return mapMessage({
        ...message,
        messageTags: tagIds.map((tagId) => ({ tagId })),
      });
    });
  }

  async patchMessage(
    userId: string,
    id: string,
    dto: PatchMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    const current = await this.requireOwnedMessage(this.prisma, userId, id);

    if (dto.content !== undefined && current.variant !== 'todo') {
      throw new BadRequestException(
        'PATCH content is only allowed on todo messages',
      );
    }

    try {
      const message = await this.prisma.diaryMessage.update({
        where: { id },
        data: {
          ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
          ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
          ...(dto.reactions !== undefined
            ? { reactions: dto.reactions as object }
            : {}),
          ...(dto.decorators !== undefined
            ? { decorators: dto.decorators as object }
            : {}),
          ...(dto.content !== undefined
            ? { content: dto.content as object }
            : {}),
          updatedAt: new Date(),
        },
        include: MESSAGE_TAG_INCLUDE,
      });

      return mapMessage(message);
    } catch (error) {
      return mapPrismaDiaryWriteError(error);
    }
  }

  async editMessage(
    userId: string,
    id: string,
    dto: EditMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    await this.requireOwnedMessage(this.prisma, userId, id);
    await this.requireLiveReply(this.prisma, userId, dto.replyToMessageId);

    try {
      const message = await this.prisma.diaryMessage.update({
        where: { id },
        data: {
          variant: dto.variant,
          content: dto.content as object,
          ...(dto.attachments !== undefined
            ? { attachments: dto.attachments as object }
            : {}),
          ...(dto.decorators !== undefined
            ? { decorators: dto.decorators as object }
            : {}),
          ...(dto.replyToMessageId !== undefined
            ? { replyToMessageId: dto.replyToMessageId }
            : {}),
          edited: true,
          updatedAt: new Date(),
        },
        include: MESSAGE_TAG_INCLUDE,
      });

      return mapMessage(message);
    } catch (error) {
      return mapPrismaDiaryWriteError(error);
    }
  }

  async deleteMessage(userId: string, id: string): Promise<void> {
    await withDiaryOrderTransaction(this.prisma, async (tx) => {
      const message = await this.requireOwnedMessage(tx, userId, id);
      const orders = await this.loadOrders(tx, userId);
      const next = deleteMessageOrders(orders, message.chatboxId, id);

      await tx.diaryMessage.delete({ where: { id } });
      await this.saveOrders(tx, userId, next);
    });
  }

  async setMessageTags(
    userId: string,
    id: string,
    dto: SetMessageTagsDto,
  ): Promise<DiaryMessageSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      await this.requireOwnedMessage(tx, userId, id);
      await this.requireOwnedTags(tx, userId, dto.tagIds);

      await tx.diaryMessageTag.deleteMany({ where: { messageId: id } });

      if (dto.tagIds.length > 0) {
        await tx.diaryMessageTag.createMany({
          data: dto.tagIds.map((tagId) => ({
            messageId: id,
            tagId,
            userId,
          })),
        });
      }

      const message = await tx.diaryMessage.update({
        where: { id },
        data: { updatedAt: new Date() },
        include: MESSAGE_TAG_INCLUDE,
      });

      return mapMessage({
        ...message,
        messageTags: dto.tagIds.map((tagId) => ({ tagId })),
      });
    });
  }

  async removeTagFromChatbox(
    userId: string,
    chatboxId: string,
    dto: RemoveChatboxTagDto,
  ): Promise<void> {
    await this.requireOwnedChatbox(this.prisma, userId, chatboxId);
    await this.requireOwnedTag(this.prisma, userId, dto.tagId);

    await this.prisma.$transaction(async (tx) => {
      const joins = await tx.diaryMessageTag.findMany({
        where: {
          tagId: dto.tagId,
          userId,
          message: { chatboxId, userId },
        },
        select: { messageId: true },
      });
      const messageIds = Array.from(
        new Set(joins.map((join) => join.messageId)),
      );

      if (messageIds.length === 0) {
        return;
      }

      await tx.diaryMessageTag.deleteMany({
        where: { tagId: dto.tagId, messageId: { in: messageIds } },
      });
      await tx.diaryMessage.updateMany({
        where: { id: { in: messageIds }, userId },
        data: { updatedAt: new Date() },
      });
    });
  }

  async createTag(
    userId: string,
    dto: CreateTagDto,
  ): Promise<DiaryTagSnapshot> {
    await this.assertUniqueTagLabel(userId, dto.label);

    return this.writeWithColorId(userId, dto.colorId, async (db) => {
      try {
        const tag = await db.diaryTag.create({
          data: {
            id: dto.id,
            userId,
            label: dto.label,
            colorId: dto.colorId,
          },
        });

        return mapTag(tag);
      } catch (error) {
        return mapPrismaDiaryWriteError(error);
      }
    });
  }

  async updateTag(
    userId: string,
    id: string,
    dto: UpdateTagDto,
  ): Promise<DiaryTagSnapshot> {
    return this.writeWithColorId(userId, dto.colorId, async (db) => {
      await this.requireOwnedTag(db, userId, id);

      if (dto.label !== undefined) {
        await this.assertUniqueTagLabel(userId, dto.label, id);
      }

      try {
        const tag = await db.diaryTag.update({
          where: { id },
          data: {
            ...(dto.label !== undefined ? { label: dto.label } : {}),
            ...(dto.colorId !== undefined ? { colorId: dto.colorId } : {}),
          },
        });

        return mapTag(tag);
      } catch (error) {
        return mapPrismaDiaryWriteError(error);
      }
    });
  }

  async deleteTag(userId: string, id: string): Promise<void> {
    await this.requireOwnedTag(this.prisma, userId, id);

    try {
      await this.prisma.diaryTag.delete({ where: { id } });
    } catch (error) {
      return mapPrismaDiaryWriteError(error);
    }
  }

  async createPalette(
    userId: string,
    dto: CreatePaletteDto,
  ): Promise<DiaryPaletteSnapshot> {
    const baseColor = parseDiaryHex(dto.baseColor);
    if (!baseColor) {
      throw new BadRequestException('Invalid palette color');
    }

    try {
      const palette = await this.prisma.diaryCustomPalette.create({
        data: {
          id: dto.id,
          userId,
          name: dto.name,
          description: dto.description?.trim() ? dto.description.trim() : null,
          baseColor,
          light: normalizePaletteShades(dto.light),
          dark: normalizePaletteShades(dto.dark),
        },
      });

      return mapPalette(palette);
    } catch (error) {
      return mapPrismaDiaryWriteError(error);
    }
  }

  async deletePalette(userId: string, id: string): Promise<void> {
    await withDiaryColorTransaction(this.prisma, async (tx) => {
      const palette = await tx.diaryCustomPalette.findFirst({
        where: { id, userId },
      });

      if (!palette) {
        throw new NotFoundException();
      }

      await assertPaletteUnused(tx, userId, id);
      await tx.diaryCustomPalette.delete({ where: { id } });
    });
  }

  private async writeWithColorId<T>(
    userId: string,
    colorId: string | undefined,
    write: (db: DiaryDb) => Promise<T>,
  ): Promise<T> {
    if (colorId !== undefined && isCustomColorId(colorId)) {
      return withDiaryColorTransaction(this.prisma, async (tx) => {
        await assertOwnedColorId(tx, userId, colorId);
        return write(tx);
      });
    }

    if (colorId !== undefined) {
      await assertOwnedColorId(this.prisma, userId, colorId);
    }

    return write(this.prisma);
  }

  private async requireOwnedMessage(
    db: Pick<DiaryDb, 'diaryMessage'>,
    userId: string,
    id: string,
  ) {
    const message = await db.diaryMessage.findFirst({
      where: { id, userId },
      include: MESSAGE_TAG_INCLUDE,
    });

    if (!message) {
      throw new NotFoundException();
    }

    return message;
  }

  private async requireOwnedTags(
    db: Pick<DiaryDb, 'diaryTag'>,
    userId: string,
    tagIds: string[],
  ) {
    if (tagIds.length === 0) {
      return;
    }

    const tags = await db.diaryTag.findMany({
      where: { userId, id: { in: tagIds } },
      select: { id: true },
    });

    if (tags.length !== new Set(tagIds).size) {
      throw new NotFoundException();
    }
  }

  private async requireLiveReply(
    db: Pick<DiaryDb, 'diaryMessage'>,
    userId: string,
    replyToMessageId?: string | null,
  ) {
    if (!replyToMessageId) {
      return;
    }

    const reply = await db.diaryMessage.findFirst({
      where: { id: replyToMessageId, userId },
    });

    if (!reply) {
      throw new NotFoundException();
    }
  }

  private async requireSourceLineage(
    db: Pick<DiaryDb, 'diaryMessage'>,
    userId: string,
    sourceMessageId?: string | null,
  ) {
    if (!sourceMessageId) {
      return;
    }

    const source = await db.diaryMessage.findUnique({
      where: { id: sourceMessageId },
    });

    if (source && source.userId !== userId) {
      throw new NotFoundException();
    }
  }

  private async requireOwnedGroup(db: DiaryDb, userId: string, id: string) {
    const group = await db.diaryGroup.findFirst({
      where: { id, userId },
    });

    if (!group) {
      throw new NotFoundException();
    }

    return group;
  }

  private async requireOwnedChatbox(db: DiaryDb, userId: string, id: string) {
    const chatbox = await db.diaryChatbox.findFirst({
      where: { id, userId },
    });

    if (!chatbox) {
      throw new NotFoundException();
    }

    return chatbox;
  }

  private async requireOwnedTag(
    db: Pick<DiaryDb, 'diaryTag'>,
    userId: string,
    id: string,
  ) {
    const tag = await db.diaryTag.findFirst({
      where: { id, userId },
    });

    if (!tag) {
      throw new NotFoundException();
    }

    return tag;
  }

  private async assertUniqueTagLabel(
    userId: string,
    label: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.diaryTag.findFirst({
      where: {
        userId,
        label: { equals: label, mode: 'insensitive' },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    if (duplicate) {
      throw new ConflictException('A tag with this name already exists');
    }
  }

  private async loadOrders(
    tx: DiaryDb,
    userId: string,
  ): Promise<DiaryOrdersSnapshot> {
    const orderRow = await tx.diaryOrder.findUnique({ where: { userId } });
    return mapOrders(orderRow);
  }

  private async saveOrders(
    tx: DiaryDb,
    userId: string,
    orders: DiaryOrdersSnapshot,
  ) {
    await tx.diaryOrder.upsert({
      where: { userId },
      create: {
        userId,
        rootOrders: orders.rootOrders,
        groupChatboxOrders: orders.groupChatboxOrders,
        chatboxMessageOrders: orders.chatboxMessageOrders,
      },
      update: {
        rootOrders: orders.rootOrders,
        groupChatboxOrders: orders.groupChatboxOrders,
        chatboxMessageOrders: orders.chatboxMessageOrders,
      },
    });
  }

  private async toChatboxSnapshot(
    db: DiaryDb,
    userId: string,
    chatbox: DiaryChatboxRow,
  ): Promise<DiaryChatboxSnapshot> {
    const [messages, orderRow] = await Promise.all([
      db.diaryMessage.findMany({
        where: { userId, chatboxId: chatbox.id },
        include: MESSAGE_TAG_INCLUDE,
      }),
      db.diaryOrder.findUnique({ where: { userId } }),
    ]);

    const mappedMessages = (messages as DiaryMessageRow[]).map((message) =>
      mapMessage(message),
    );
    const messagesById = new Map(
      mappedMessages.map((message) => [message.id, message]),
    );

    return mapChatbox(
      chatbox,
      mappedMessages,
      messagesById,
      mapOrders(orderRow),
    );
  }
}
