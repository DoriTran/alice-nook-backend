import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiaryDb, PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
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
  preserveProcessedTimers,
  processOverdueTimers,
  type TimerReconciliationResponse,
} from './diary-timers';
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
import {
  collectContentTagIds,
  isDurableAttachmentId,
} from './diary-message-content';
import { UploadsService } from '../uploads/uploads.service';
import {
  containsSecretContent,
  hydrateSecrets,
  materializeSecrets,
} from './secret-content';
import { SecretCryptoService } from './secret-crypto.service';

const MESSAGE_TAG_INCLUDE = {
  messageTags: { select: { tagId: true } },
} as const;

const toLinkPreviewJson = (value: unknown): object =>
  value === null ? {} : (value as object);

@Injectable()
export class DiaryService {
  private readonly durableWritesEnabled: boolean;
  private readonly secretCrypto: SecretCryptoService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    config?: ConfigService,
    secretCrypto?: SecretCryptoService,
  ) {
    this.durableWritesEnabled =
      config?.get('DIARY_DURABLE_ATTACHMENTS_WRITE_ENABLED') === 'true';
    this.secretCrypto =
      secretCrypto ?? new SecretCryptoService(config ?? new ConfigService());
  }

  private withSecretHydration(
    message: DiaryMessageSnapshot,
  ): DiaryMessageSnapshot {
    return {
      ...message,
      secretHydrations: hydrateSecrets(message.content, this.secretCrypto),
    };
  }

  async reconcileTimers(userId: string): Promise<TimerReconciliationResponse> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "diary_message"
        WHERE "userId" = ${userId}
          AND jsonb_typeof("decorators") = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("decorators") AS item(value)
            WHERE item.value->>'type' = 'timer'
              AND item.value->>'mode' IN ('timer', 'datetime')
              AND item.value->>'deadlineAt' IS NOT NULL
              AND COALESCE(item.value->>'alertedAt', '') = ''
          )
        FOR UPDATE SKIP LOCKED
      `;
      if (candidates.length === 0) {
        return {
          affectedChatboxIds: [],
          ringingChatboxIds: [],
          affectedMessages: [],
        };
      }

      const messages = await tx.diaryMessage.findMany({
        where: { userId, id: { in: candidates.map(({ id }) => id) } },
        select: { id: true, chatboxId: true, decorators: true },
      });
      const affectedMessages: TimerReconciliationResponse['affectedMessages'] =
        [];

      for (const message of messages) {
        const result = processOverdueTimers(message.decorators, now);
        if (result.processedTimers.length === 0) continue;

        await tx.diaryMessage.update({
          where: { id: message.id },
          // Prisma requires a JSON input cast for this validated decorator array.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          data: { decorators: result.decorators as object, updatedAt: now },
        });
        affectedMessages.push({
          messageId: message.id,
          chatboxId: message.chatboxId,
          ...result,
        });
      }

      const affectedChatboxIds = [
        ...new Set(affectedMessages.map(({ chatboxId }) => chatboxId)),
      ];
      const enabledChatboxes = affectedChatboxIds.length
        ? await tx.diaryChatbox.findMany({
            where: {
              userId,
              id: { in: affectedChatboxIds },
              notificationEnabled: true,
            },
            select: { id: true },
          })
        : [];

      return {
        affectedChatboxIds,
        ringingChatboxIds: enabledChatboxes.map(({ id }) => id),
        affectedMessages,
      };
    });
  }

  private async lockOwnedMessage(tx: DiaryDb, userId: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "diary_message"
      WHERE "userId" = ${userId} AND "id" = ${id}
      FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException('Message not found');
    return this.requireOwnedMessage(tx, userId, id);
  }

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
      capabilities: { cloudSecret: this.secretCrypto.enabled },
      secretHydrations: mappedMessages.reduce<Record<string, unknown>>(
        (all, message) => ({
          ...all,
          ...hydrateSecrets(message.content, this.secretCrypto),
        }),
        {},
      ),
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

  async getMessage(userId: string, id: string): Promise<DiaryMessageSnapshot> {
    return this.withSecretHydration(
      mapMessage(await this.requireOwnedMessage(this.prisma, userId, id)),
    );
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
          notificationEnabled: true,
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
    const cleanupIds = await withDiaryOrderTransaction(
      this.prisma,
      async (tx) => {
        const chatbox = await this.requireOwnedChatbox(tx, userId, id);
        const orders = await this.loadOrders(tx, userId);
        const next = deleteChatboxOrders(orders, id, chatbox.groupId);
        const messages = await tx.diaryMessage.findMany({
          where: { userId, chatboxId: id },
          select: { attachments: true, content: true },
        });
        const attachmentIds = [
          ...new Set(
            messages.flatMap((message) =>
              this.collectAttachmentIds(message.attachments, message.content),
            ),
          ),
        ];
        await this.lockAttachmentObjects(tx, userId, attachmentIds);

        await tx.diaryChatbox.delete({ where: { id } });
        const pendingIds = await this.markUnreferencedForCleanup(
          tx,
          userId,
          attachmentIds,
        );
        await this.saveOrders(tx, userId, next);
        return pendingIds;
      },
    );
    await this.uploads.cleanupPendingAttachments(userId, cleanupIds);
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
    const requestedTagIds = dto.tagIds ?? [];
    if (
      dto.variant !== 'text' &&
      dto.variant !== 'column' &&
      (dto.secretPayloads?.length || containsSecretContent(dto.content))
    )
      throw new BadRequestException('Secret Content requires a Normal message');
    const content = materializeSecrets(
      dto.content,
      dto.secretPayloads,
      this.secretCrypto,
    );
    this.assertDurableWrite(dto.attachments, content);

    return withDiaryOrderTransaction(this.prisma, async (tx) => {
      await this.requireOwnedChatbox(tx, userId, dto.chatboxId);
      await this.requireOwnedTags(tx, userId, requestedTagIds);
      const inlineTagIds = await this.resolveLiveInlineTagIds(
        tx,
        userId,
        content,
      );
      const tagIds = [...new Set([...requestedTagIds, ...inlineTagIds])];
      await this.requireLiveReply(tx, userId, dto.replyToMessageId);
      await this.requireSourceLineage(tx, userId, dto.sourceMessageId);

      const message = await tx.diaryMessage.create({
        data: {
          id: dto.id,
          userId,
          chatboxId: dto.chatboxId,
          sender: dto.sender,
          variant: dto.variant,
          content: content as object,
          pinned: dto.pinned ?? false,
          archived: dto.archived ?? false,
          replyToMessageId: dto.replyToMessageId ?? null,
          sourceMessageId: dto.sourceMessageId ?? null,
          reactions: dto.reactions ?? [],
          attachments: dto.attachments ?? [],
          decorators: dto.decorators ?? [],
          ...(dto.linkPreview !== undefined
            ? { linkPreview: toLinkPreviewJson(dto.linkPreview) }
            : {}),
          edited: false,
          updatedAt: null,
        },
      });

      await this.syncAttachmentReferences(
        tx,
        userId,
        message.id,
        [],
        this.collectAttachmentIds(dto.attachments, content),
      );

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

      return this.withSecretHydration(
        mapMessage({
          ...message,
          messageTags: tagIds.map((tagId) => ({ tagId })),
        }),
      );
    });
  }

  async patchMessage(
    userId: string,
    id: string,
    dto: PatchMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    if (dto.content !== undefined) {
      if (containsSecretContent(dto.content))
        throw new BadRequestException(
          'Secret Content requires a Normal message',
        );
      this.assertDurableWrite(undefined, dto.content);
    }
    try {
      const write = async (db: DiaryDb, locked: boolean) => {
        const current = locked
          ? await this.lockOwnedMessage(db, userId, id)
          : await this.requireOwnedMessage(db, userId, id);
        if (dto.content !== undefined && current.variant !== 'todo') {
          throw new BadRequestException(
            'PATCH content is only allowed on todo messages',
          );
        }

        const message = await db.diaryMessage.update({
          where: { id },
          data: {
            ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
            ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
            ...(dto.reactions !== undefined
              ? { reactions: dto.reactions as object }
              : {}),
            ...(dto.decorators !== undefined
              ? {
                  decorators: preserveProcessedTimers(
                    dto.decorators,
                    current.decorators,
                  ) as object,
                }
              : {}),
            ...(dto.content !== undefined
              ? { content: dto.content as object }
              : {}),
            ...(dto.linkPreview !== undefined
              ? { linkPreview: toLinkPreviewJson(dto.linkPreview) }
              : {}),
            updatedAt: new Date(),
          },
          include: MESSAGE_TAG_INCLUDE,
        });
        const cleanupIds =
          dto.content !== undefined
            ? await this.syncAttachmentReferences(
                db,
                userId,
                id,
                this.collectAttachmentIds(current.attachments, current.content),
                this.collectAttachmentIds(current.attachments, dto.content),
              )
            : [];
        return { message: mapMessage(message), cleanupIds };
      };

      const result =
        dto.decorators !== undefined || dto.content !== undefined
          ? await this.prisma.$transaction((tx) => write(tx, true))
          : await write(this.prisma, false);
      await this.uploads.cleanupPendingAttachments(userId, result.cleanupIds);
      return result.message;
    } catch (error) {
      return mapPrismaDiaryWriteError(error);
    }
  }

  async editMessage(
    userId: string,
    id: string,
    dto: EditMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    try {
      const write = async (db: DiaryDb) => {
        const current = await this.lockOwnedMessage(db, userId, id);
        if (
          dto.variant !== 'text' &&
          dto.variant !== 'column' &&
          (dto.secretPayloads?.length || containsSecretContent(dto.content))
        )
          throw new BadRequestException(
            'Secret Content requires a Normal message',
          );
        const content = materializeSecrets(
          dto.content,
          dto.secretPayloads,
          this.secretCrypto,
          current.content,
        );
        this.assertDurableWrite(dto.attachments, content);
        await this.requireLiveReply(db, userId, dto.replyToMessageId);
        const inlineTagIds = await this.resolveLiveInlineTagIds(
          db,
          userId,
          content,
        );
        if (inlineTagIds.length > 0) {
          await db.diaryMessageTag.createMany({
            data: inlineTagIds.map((tagId) => ({
              messageId: id,
              tagId,
              userId,
            })),
            skipDuplicates: true,
          });
        }
        const message = await db.diaryMessage.update({
          where: { id },
          data: {
            variant: dto.variant,
            content: content as object,
            ...(dto.attachments !== undefined
              ? { attachments: dto.attachments as object }
              : {}),
            ...(dto.decorators !== undefined
              ? {
                  decorators: preserveProcessedTimers(
                    dto.decorators,
                    current.decorators,
                  ) as object,
                }
              : {}),
            ...(dto.linkPreview !== undefined
              ? { linkPreview: toLinkPreviewJson(dto.linkPreview) }
              : {}),
            ...(dto.replyToMessageId !== undefined
              ? { replyToMessageId: dto.replyToMessageId }
              : {}),
            edited: true,
            updatedAt: new Date(),
          },
          include: MESSAGE_TAG_INCLUDE,
        });
        const cleanupIds = await this.syncAttachmentReferences(
          db,
          userId,
          id,
          this.collectAttachmentIds(current.attachments, current.content),
          this.collectAttachmentIds(
            dto.attachments ?? current.attachments,
            content,
          ),
        );
        return { message: mapMessage(message), cleanupIds };
      };

      const result = await this.prisma.$transaction((tx) => write(tx));
      await this.uploads.cleanupPendingAttachments(userId, result.cleanupIds);
      return this.withSecretHydration(result.message);
    } catch (error) {
      return mapPrismaDiaryWriteError(error);
    }
  }

  async deleteMessage(userId: string, id: string): Promise<void> {
    const cleanupIds = await withDiaryOrderTransaction(
      this.prisma,
      async (tx) => {
        const message = await this.requireOwnedMessage(tx, userId, id);
        const orders = await this.loadOrders(tx, userId);
        const next = deleteMessageOrders(orders, message.chatboxId, id);

        const attachmentIds = this.collectAttachmentIds(
          message.attachments,
          message.content,
        );
        await this.lockAttachmentObjects(tx, userId, attachmentIds);

        await tx.diaryMessage.delete({ where: { id } });
        const pendingIds = await this.markUnreferencedForCleanup(
          tx,
          userId,
          attachmentIds,
        );
        await this.saveOrders(tx, userId, next);
        return pendingIds;
      },
    );
    await this.uploads.cleanupPendingAttachments(userId, cleanupIds);
  }

  async setMessageTags(
    userId: string,
    id: string,
    dto: SetMessageTagsDto,
  ): Promise<DiaryMessageSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireOwnedMessage(tx, userId, id);
      await this.requireOwnedTags(tx, userId, dto.tagIds);
      const inlineTagIds = await this.resolveLiveInlineTagIds(
        tx,
        userId,
        current.content,
      );
      const tagIds = [...new Set([...dto.tagIds, ...inlineTagIds])];

      await tx.diaryMessageTag.deleteMany({ where: { messageId: id } });

      if (tagIds.length > 0) {
        await tx.diaryMessageTag.createMany({
          data: tagIds.map((tagId) => ({
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
        messageTags: tagIds.map((tagId) => ({ tagId })),
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

  private async resolveLiveInlineTagIds(
    db: Pick<DiaryDb, 'diaryTag'>,
    userId: string,
    content: unknown,
  ): Promise<string[]> {
    const ids = collectContentTagIds(content);
    if (ids.length === 0) return [];

    const tags = await db.diaryTag.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });
    if (tags.some((tag) => tag.userId !== userId)) {
      throw new NotFoundException();
    }
    const live = new Set(tags.map((tag) => tag.id));
    return ids.filter((id) => live.has(id));
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

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
  private collectAttachmentIds(
    attachments: unknown,
    content: unknown,
  ): string[] {
    const values: unknown[] = Array.isArray(attachments)
      ? [...attachments]
      : [];
    if (
      content &&
      typeof content === 'object' &&
      !Array.isArray(content) &&
      'items' in content &&
      Array.isArray(content.items)
    ) {
      for (const item of content.items) {
        if (
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          'attachments' in item &&
          Array.isArray(item.attachments)
        )
          values.push(...item.attachments);
      }
    }
    const ids = values.flatMap((value) =>
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'id' in value &&
      isDurableAttachmentId(value.id)
        ? [value.id]
        : [],
    );
    if (ids.length !== new Set(ids).size)
      throw new BadRequestException('Duplicate durable attachment reference');
    return ids;
  }

  private assertDurableWrite(attachments: unknown, content: unknown): void {
    const values: unknown[] = Array.isArray(attachments)
      ? [...attachments]
      : [];
    if (
      content &&
      typeof content === 'object' &&
      !Array.isArray(content) &&
      'items' in content &&
      Array.isArray(content.items)
    ) {
      for (const item of content.items)
        if (
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          'attachments' in item &&
          Array.isArray(item.attachments)
        )
          values.push(...item.attachments);
    }
    const binaryValues = values.filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        'type' in value &&
        value.type !== 'link',
    ) as Array<Record<string, unknown>>;
    const isDurableReference = (value: Record<string, unknown>) =>
      isDurableAttachmentId(value.id) && !('url' in value);

    if (!this.durableWritesEnabled && binaryValues.some(isDurableReference)) {
      throw new BadRequestException('Durable attachment writes are disabled');
    }

    if (
      this.durableWritesEnabled &&
      binaryValues.some((value) => !isDurableReference(value))
    ) {
      throw new BadRequestException(
        'Cloud binary attachments must use durable attachment IDs',
      );
    }
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

  private async syncAttachmentReferences(
    db: DiaryDb,
    userId: string,
    messageId: string,
    previous: string[],
    next: string[],
  ) {
    const added = next.filter((id) => !previous.includes(id));
    const removed = previous.filter((id) => !next.includes(id));
    const locked = await this.lockAttachmentObjects(db, userId, [
      ...added,
      ...removed,
    ]);
    if (added.length) {
      const eligible = locked.filter(
        (row) =>
          added.includes(row.id) &&
          (row.status === 'uploaded' || row.status === 'committed'),
      );
      if (eligible.length !== added.length) throw new NotFoundException();
      await db.diaryMessageAttachment.createMany({
        data: added.map((attachmentId) => ({ messageId, attachmentId })),
        skipDuplicates: true,
      });
      await db.diaryAttachmentObject.updateMany({
        where: { id: { in: added }, userId, status: 'uploaded' },
        data: { status: 'committed', committedAt: new Date() },
      });
    }
    if (removed.length) {
      await db.diaryMessageAttachment.deleteMany({
        where: { messageId, attachmentId: { in: removed } },
      });
      return this.markUnreferencedForCleanup(db, userId, removed);
    }
    return [];
  }

  private async lockAttachmentObjects(
    db: DiaryDb,
    userId: string,
    ids: string[],
  ): Promise<Array<{ id: string; status: string }>> {
    const rows: Array<{ id: string; status: string }> = [];
    for (const id of [...new Set(ids)].sort()) {
      rows.push(
        ...(await db.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT "id", "status" FROM "diary_attachment_object"
          WHERE "id" = ${id} AND "userId" = ${userId}
          FOR UPDATE
        `),
      );
    }
    return rows;
  }

  private async markUnreferencedForCleanup(
    db: DiaryDb,
    userId: string,
    ids: string[],
  ): Promise<string[]> {
    const pendingIds: string[] = [];
    for (const id of ids) {
      const referenced = await db.diaryMessageAttachment.findFirst({
        where: { attachmentId: id },
        select: { attachmentId: true },
      });
      if (!referenced) {
        const updated = await db.diaryAttachmentObject.updateMany({
          where: { id, userId, status: 'committed' },
          data: { status: 'cleanup_pending', cleanupRequestedAt: new Date() },
        });
        if (updated.count === 1) pendingIds.push(id);
      }
    }
    return pendingIds;
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
