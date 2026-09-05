import { Test, TestingModule } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { createParamDecorator } =
    jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common');

  return {
    AllowAnonymous: () => () => undefined,
    Session: createParamDecorator(
      (_data: unknown, context: ExecutionContext) => {
        return context.switchToHttp().getRequest<{
          session?: { user: { id: string } };
        }>().session;
      },
    ),
    AuthModule: {
      forRootAsync: () => ({ module: class MockAuthModule {} }),
    },
  };
});
jest.mock('better-auth', () => ({ betterAuth: jest.fn() }));
jest.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: jest.fn(),
}));
jest.mock('./../src/auth/create-auth', () => ({
  createAuth: jest.fn(),
}));
jest.mock('./../src/prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      session?: { user: { id: string } };
    }>();
    const userId = request.headers['x-test-user-id'];

    if (typeof userId !== 'string' || userId.length === 0) {
      throw new UnauthorizedException();
    }

    request.session = { user: { id: userId } };
    return true;
  }
}

const USER_A = 'user-a';
const USER_B = 'user-b';

const emptySnapshot = {
  groups: [],
  chatboxes: [],
  messages: [],
  tags: [],
  palettes: [],
  orders: {
    rootOrders: [],
    groupChatboxOrders: {},
    chatboxMessageOrders: {},
  },
};

function asRecord(body: unknown): Record<string, unknown> {
  return body as Record<string, unknown>;
}

type GroupRow = {
  id: string;
  userId: string;
  name: string;
  icon: string;
  colorId: string;
  createdAt: Date;
  updatedAt: Date | null;
};

type ChatboxRow = {
  id: string;
  userId: string;
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

type MessageRow = {
  id: string;
  userId: string;
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
};

type TagRow = {
  id: string;
  userId: string;
  label: string;
  colorId: string;
};

type MessageTagRow = {
  messageId: string;
  tagId: string;
  userId: string;
};

type PaletteRow = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  baseColor: string;
  light: unknown;
  dark: unknown;
  createdAt: Date;
};

type OrderRow = {
  userId: string;
  rootOrders: string[];
  groupChatboxOrders: Record<string, string[]>;
  chatboxMessageOrders: Record<string, string[]>;
};

function cloneOrders(row: OrderRow): OrderRow {
  return {
    userId: row.userId,
    rootOrders: [...row.rootOrders],
    groupChatboxOrders: Object.fromEntries(
      Object.entries(row.groupChatboxOrders).map(([key, ids]) => [
        key,
        [...ids],
      ]),
    ),
    chatboxMessageOrders: Object.fromEntries(
      Object.entries(row.chatboxMessageOrders).map(([key, ids]) => [
        key,
        [...ids],
      ]),
    ),
  };
}

function prismaError(code: string) {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function createDiaryMemory() {
  const groups: GroupRow[] = [];
  const chatboxes: ChatboxRow[] = [];
  const messages: MessageRow[] = [];
  const tags: TagRow[] = [];
  const messageTags: MessageTagRow[] = [];
  const palettes: PaletteRow[] = [];
  const orders: OrderRow[] = [];

  const restore = (snapshot: {
    groups: GroupRow[];
    chatboxes: ChatboxRow[];
    messages: MessageRow[];
    tags: TagRow[];
    messageTags: MessageTagRow[];
    palettes: PaletteRow[];
    orders: OrderRow[];
  }) => {
    groups.splice(
      0,
      groups.length,
      ...snapshot.groups.map((row) => ({ ...row })),
    );
    chatboxes.splice(
      0,
      chatboxes.length,
      ...snapshot.chatboxes.map((row) => ({ ...row })),
    );
    messages.splice(
      0,
      messages.length,
      ...snapshot.messages.map((row) => ({ ...row })),
    );
    tags.splice(0, tags.length, ...snapshot.tags.map((row) => ({ ...row })));
    messageTags.splice(
      0,
      messageTags.length,
      ...snapshot.messageTags.map((row) => ({ ...row })),
    );
    palettes.splice(
      0,
      palettes.length,
      ...snapshot.palettes.map((row) => ({ ...row })),
    );
    orders.splice(0, orders.length, ...snapshot.orders.map(cloneOrders));
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = {
        groups: groups.map((row) => ({ ...row })),
        chatboxes: chatboxes.map((row) => ({ ...row })),
        messages: messages.map((row) => ({ ...row })),
        tags: tags.map((row) => ({ ...row })),
        messageTags: messageTags.map((row) => ({ ...row })),
        palettes: palettes.map((row) => ({ ...row })),
        orders: orders.map(cloneOrders),
      };

      try {
        return await fn(prisma);
      } catch (error) {
        restore(snapshot);
        throw error;
      }
    }),
    diaryGroup: {
      findMany: jest.fn(
        ({
          where,
          select,
        }: {
          where: { userId: string };
          select?: { id?: true };
        }) => {
          const rows = groups.filter((row) => row.userId === where.userId);
          if (select?.id) {
            return rows.map((row) => ({ id: row.id }));
          }
          return rows;
        },
      ),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { id?: string; userId: string; colorId?: string };
        }) =>
          groups.find((row) => {
            if (row.userId !== where.userId) {
              return false;
            }
            if (where.id && row.id !== where.id) {
              return false;
            }
            if (where.colorId && row.colorId !== where.colorId) {
              return false;
            }
            return true;
          }) ?? null,
      ),
      create: jest.fn(({ data }: { data: Omit<GroupRow, 'createdAt'> }) => {
        if (groups.some((row) => row.id === data.id)) {
          throw prismaError('P2002');
        }

        const row: GroupRow = {
          ...data,
          icon: data.icon ?? '',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: data.updatedAt ?? null,
        };
        groups.push(row);
        return row;
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<GroupRow>;
        }) => {
          const index = groups.findIndex((row) => row.id === where.id);
          if (index < 0) {
            throw prismaError('P2025');
          }
          groups[index] = { ...groups[index], ...data };
          return groups[index];
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const index = groups.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw prismaError('P2025');
        }
        const [removed] = groups.splice(index, 1);
        chatboxes.forEach((chatbox) => {
          if (chatbox.groupId === removed.id) {
            chatbox.groupId = null;
          }
        });
        return removed;
      }),
    },
    diaryChatbox: {
      findMany: jest.fn(
        ({
          where,
          orderBy,
          select,
        }: {
          where: { userId: string; groupId?: string | null };
          orderBy?: Array<Record<string, 'asc' | 'desc'>>;
          select?: { id?: true; createdAt?: true; groupId?: true };
        }) => {
          let rows = chatboxes.filter((row) => row.userId === where.userId);
          if (Object.prototype.hasOwnProperty.call(where, 'groupId')) {
            rows = rows.filter((row) => row.groupId === where.groupId);
          }

          if (orderBy) {
            rows = [...rows].sort((left, right) => {
              for (const clause of orderBy) {
                for (const [field, direction] of Object.entries(clause)) {
                  const av = left[field as keyof ChatboxRow];
                  const bv = right[field as keyof ChatboxRow];
                  let cmp = 0;
                  if (av instanceof Date && bv instanceof Date) {
                    cmp = av.getTime() - bv.getTime();
                  } else {
                    cmp = String(av).localeCompare(String(bv));
                  }
                  if (cmp !== 0) {
                    return direction === 'desc' ? -cmp : cmp;
                  }
                }
              }
              return 0;
            });
          }

          if (select) {
            return rows.map((row) => {
              const picked: Record<string, unknown> = {};
              if (select.id) {
                picked.id = row.id;
              }
              if (select.createdAt) {
                picked.createdAt = row.createdAt;
              }
              if (select.groupId) {
                picked.groupId = row.groupId;
              }
              return picked;
            });
          }

          return rows;
        },
      ),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { id?: string; userId: string; colorId?: string };
        }) =>
          chatboxes.find((row) => {
            if (row.userId !== where.userId) {
              return false;
            }
            if (where.id && row.id !== where.id) {
              return false;
            }
            if (where.colorId && row.colorId !== where.colorId) {
              return false;
            }
            return true;
          }) ?? null,
      ),
      create: jest.fn(({ data }: { data: Omit<ChatboxRow, 'createdAt'> }) => {
        if (chatboxes.some((row) => row.id === data.id)) {
          throw prismaError('P2002');
        }
        if (
          data.groupId &&
          !groups.some((group) => group.id === data.groupId)
        ) {
          throw prismaError('P2003');
        }

        const row: ChatboxRow = {
          ...data,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: data.updatedAt ?? null,
        };
        chatboxes.push(row);
        return row;
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ChatboxRow>;
        }) => {
          const index = chatboxes.findIndex((row) => row.id === where.id);
          if (index < 0) {
            throw prismaError('P2025');
          }
          if (
            data.groupId &&
            !groups.some((group) => group.id === data.groupId)
          ) {
            throw prismaError('P2003');
          }
          chatboxes[index] = { ...chatboxes[index], ...data };
          return chatboxes[index];
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const index = chatboxes.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw prismaError('P2025');
        }
        const [removed] = chatboxes.splice(index, 1);
        const removedMessageIds = messages
          .filter((message) => message.chatboxId === removed.id)
          .map((message) => message.id);
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          if (messages[i].chatboxId === removed.id) {
            messages.splice(i, 1);
          }
        }
        for (let i = messageTags.length - 1; i >= 0; i -= 1) {
          if (removedMessageIds.includes(messageTags[i].messageId)) {
            messageTags.splice(i, 1);
          }
        }
        return removed;
      }),
    },
    diaryMessage: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { userId: string; chatboxId?: string; id?: { in: string[] } };
        }) =>
          messages
            .filter((row) => {
              if (row.userId !== where.userId) {
                return false;
              }
              if (where.chatboxId && row.chatboxId !== where.chatboxId) {
                return false;
              }
              if (where.id?.in && !where.id.in.includes(row.id)) {
                return false;
              }
              return true;
            })
            .map((row) => ({
              ...row,
              messageTags: messageTags
                .filter((join) => join.messageId === row.id)
                .map((join) => ({ tagId: join.tagId })),
            })),
      ),
      findFirst: jest.fn(
        ({
          where,
          include,
        }: {
          where: { id: string; userId: string };
          include?: { messageTags?: unknown };
        }) => {
          const row = messages.find(
            (message) =>
              message.id === where.id && message.userId === where.userId,
          );
          if (!row) {
            return null;
          }
          if (!include?.messageTags) {
            return row;
          }
          return {
            ...row,
            messageTags: messageTags
              .filter((join) => join.messageId === row.id)
              .map((join) => ({ tagId: join.tagId })),
          };
        },
      ),
      findUnique: jest.fn(
        ({ where }: { where: { id: string } }) =>
          messages.find((row) => row.id === where.id) ?? null,
      ),
      create: jest.fn(({ data }: { data: Omit<MessageRow, 'createdAt'> }) => {
        if (messages.some((row) => row.id === data.id)) {
          throw prismaError('P2002');
        }
        if (!chatboxes.some((chatbox) => chatbox.id === data.chatboxId)) {
          throw prismaError('P2003');
        }
        const row: MessageRow = {
          ...data,
          createdAt: new Date('2026-01-01T03:00:00.000Z'),
          updatedAt: data.updatedAt ?? null,
        };
        messages.push(row);
        return row;
      }),
      update: jest.fn(
        ({
          where,
          data,
          include,
        }: {
          where: { id: string };
          data: Partial<MessageRow>;
          include?: { messageTags?: unknown };
        }) => {
          const index = messages.findIndex((row) => row.id === where.id);
          if (index < 0) {
            throw prismaError('P2025');
          }
          messages[index] = { ...messages[index], ...data };
          const row = messages[index];
          if (!include?.messageTags) {
            return row;
          }
          return {
            ...row,
            messageTags: messageTags
              .filter((join) => join.messageId === row.id)
              .map((join) => ({ tagId: join.tagId })),
          };
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id?: { in: string[] }; userId: string };
          data: Partial<MessageRow>;
        }) => {
          let count = 0;
          messages.forEach((row, index) => {
            if (row.userId !== where.userId) {
              return;
            }
            if (where.id?.in && !where.id.in.includes(row.id)) {
              return;
            }
            messages[index] = { ...row, ...data };
            count += 1;
          });
          return { count };
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const index = messages.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw prismaError('P2025');
        }
        const [removed] = messages.splice(index, 1);
        for (let i = messageTags.length - 1; i >= 0; i -= 1) {
          if (messageTags[i].messageId === removed.id) {
            messageTags.splice(i, 1);
          }
        }
        return removed;
      }),
    },
    diaryMessageTag: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: {
            tagId?: string;
            userId?: string;
            messageId?: string | { in: string[] };
            message?: { chatboxId?: string; userId?: string };
          };
        }) =>
          messageTags.filter((join) => {
            if (where.tagId && join.tagId !== where.tagId) {
              return false;
            }
            if (where.userId && join.userId !== where.userId) {
              return false;
            }
            if (
              typeof where.messageId === 'string' &&
              join.messageId !== where.messageId
            ) {
              return false;
            }
            if (
              where.messageId &&
              typeof where.messageId === 'object' &&
              !where.messageId.in.includes(join.messageId)
            ) {
              return false;
            }
            if (where.message) {
              const message = messages.find((row) => row.id === join.messageId);
              if (!message) {
                return false;
              }
              if (
                where.message.chatboxId &&
                message.chatboxId !== where.message.chatboxId
              ) {
                return false;
              }
              if (
                where.message.userId &&
                message.userId !== where.message.userId
              ) {
                return false;
              }
            }
            return true;
          }),
      ),
      createMany: jest.fn(({ data }: { data: MessageTagRow[] }) => {
        data.forEach((row) => messageTags.push({ ...row }));
        return { count: data.length };
      }),
      deleteMany: jest.fn(
        ({
          where,
        }: {
          where: { messageId?: string | { in: string[] }; tagId?: string };
        }) => {
          let count = 0;
          for (let i = messageTags.length - 1; i >= 0; i -= 1) {
            const join = messageTags[i];
            if (where.tagId && join.tagId !== where.tagId) {
              continue;
            }
            if (
              typeof where.messageId === 'string' &&
              join.messageId !== where.messageId
            ) {
              continue;
            }
            if (
              where.messageId &&
              typeof where.messageId === 'object' &&
              !where.messageId.in.includes(join.messageId)
            ) {
              continue;
            }
            messageTags.splice(i, 1);
            count += 1;
          }
          return { count };
        },
      ),
    },
    diaryTag: {
      findMany: jest.fn(
        ({ where }: { where: { userId: string; id?: { in: string[] } } }) =>
          tags.filter((row) => {
            if (row.userId !== where.userId) {
              return false;
            }
            if (where.id?.in && !where.id.in.includes(row.id)) {
              return false;
            }
            return true;
          }),
      ),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: {
            id?: string;
            userId: string;
            colorId?: string;
            label?: { equals: string; mode?: string };
            NOT?: { id: string };
          };
        }) =>
          tags.find((row) => {
            if (row.userId !== where.userId) {
              return false;
            }
            if (where.id && row.id !== where.id) {
              return false;
            }
            if (where.NOT?.id && row.id === where.NOT.id) {
              return false;
            }
            if (where.label?.equals) {
              const left = row.label;
              const right = where.label.equals;
              if (where.label.mode === 'insensitive') {
                if (left.toLowerCase() !== right.toLowerCase()) {
                  return false;
                }
              } else if (left !== right) {
                return false;
              }
            }
            if (where.colorId && row.colorId !== where.colorId) {
              return false;
            }
            return true;
          }) ?? null,
      ),
      create: jest.fn(({ data }: { data: TagRow }) => {
        if (tags.some((row) => row.id === data.id)) {
          throw prismaError('P2002');
        }
        tags.push(data);
        return data;
      }),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<TagRow> }) => {
          const index = tags.findIndex((row) => row.id === where.id);
          if (index < 0) {
            throw prismaError('P2025');
          }
          tags[index] = { ...tags[index], ...data };
          return tags[index];
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const index = tags.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw prismaError('P2025');
        }
        const [removed] = tags.splice(index, 1);
        for (let i = messageTags.length - 1; i >= 0; i -= 1) {
          if (messageTags[i].tagId === removed.id) {
            messageTags.splice(i, 1);
          }
        }
        return removed;
      }),
    },
    diaryCustomPalette: {
      findMany: jest.fn(({ where }: { where: { userId: string } }) =>
        palettes.filter((row) => row.userId === where.userId),
      ),
      findFirst: jest.fn(
        ({ where }: { where: { id: string; userId: string } }) =>
          palettes.find(
            (row) => row.id === where.id && row.userId === where.userId,
          ) ?? null,
      ),
      create: jest.fn(({ data }: { data: Omit<PaletteRow, 'createdAt'> }) => {
        if (palettes.some((row) => row.id === data.id)) {
          throw prismaError('P2002');
        }
        const row: PaletteRow = {
          ...data,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        };
        palettes.push(row);
        return row;
      }),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const index = palettes.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw prismaError('P2025');
        }
        const [removed] = palettes.splice(index, 1);
        return removed;
      }),
    },
    diaryOrder: {
      findUnique: jest.fn(({ where }: { where: { userId: string } }) => {
        const row = orders.find((entry) => entry.userId === where.userId);
        return row ? cloneOrders(row) : null;
      }),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: OrderRow;
          update: Omit<OrderRow, 'userId'>;
        }) => {
          const index = orders.findIndex((row) => row.userId === where.userId);
          if (index < 0) {
            const created = cloneOrders(create);
            orders.push(created);
            return cloneOrders(created);
          }

          orders[index] = cloneOrders({
            userId: where.userId,
            ...update,
          });
          return cloneOrders(orders[index]);
        },
      ),
    },
  };

  return {
    prisma,
    groups,
    chatboxes,
    messages,
    tags,
    messageTags,
    palettes,
    orders,
  };
}

describe('DiaryController (e2e)', () => {
  let app: INestApplication<App>;
  let memory: ReturnType<typeof createDiaryMemory>;

  const asUser = (userId: string) =>
    request(app.getHttpServer())
      .get('/api/diary')
      .set('x-test-user-id', userId);

  beforeEach(async () => {
    memory = createDiaryMemory();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [{ provide: APP_GUARD, useClass: TestAuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue(memory.prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects anonymous GET /api/diary', async () => {
    await request(app.getHttpServer()).get('/api/diary').expect(401);
  });

  it('returns 200 and an empty snapshot for an authenticated user', async () => {
    const response = await asUser(USER_A).expect(200);

    expect(response.body).toEqual(emptySnapshot);
    expect(memory.prisma.diaryGroup.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A },
    });
  });

  it('rejects anonymous writes', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .send({ id: 'gr:1', name: 'Personal', colorId: 'rose' })
      .expect(401);
  });

  it('rejects extra DTO properties', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'gr:1',
        name: 'Personal',
        colorId: 'rose',
        userId: USER_B,
      })
      .expect(400);
  });

  it('creates, updates, and deletes an owned group', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'gr:personal',
        name: 'Personal',
        icon: 'Heart',
        colorId: 'rose',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      id: 'gr:personal',
      name: 'Personal',
      icon: 'Heart',
      colorId: 'rose',
      updatedAt: null,
    });
    expect(created.body).not.toHaveProperty('userId');

    const updated = await request(app.getHttpServer())
      .patch('/api/diary/groups/gr:personal')
      .set('x-test-user-id', USER_A)
      .send({ name: 'Home' })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: 'gr:personal',
      name: 'Home',
      createdAt: asRecord(created.body).createdAt,
    });
    expect(asRecord(updated.body).updatedAt).toBeTruthy();

    await request(app.getHttpServer())
      .delete('/api/diary/groups/gr:personal')
      .set('x-test-user-id', USER_A)
      .expect(204);
  });

  it('cannot update or delete another user group', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_B)
      .send({ id: 'gr:b', name: 'Bob', colorId: 'violet' })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/diary/groups/gr:b')
      .set('x-test-user-id', USER_A)
      .send({ name: 'Stolen' })
      .expect(404);

    await request(app.getHttpServer())
      .delete('/api/diary/groups/gr:b')
      .set('x-test-user-id', USER_A)
      .expect(404);
  });

  it('sets owned chatbox groupId to null when a group is deleted', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:personal', name: 'Personal', colorId: 'rose' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'cb:notes',
        name: 'Notes',
        colorId: 'sage',
        groupId: 'gr:personal',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/api/diary/groups/gr:personal')
      .set('x-test-user-id', USER_A)
      .expect(204);

    expect(memory.chatboxes[0].groupId).toBeNull();
  });

  it('creates ungrouped and grouped chatboxes and rejects another user group', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:personal', name: 'Personal', colorId: 'rose' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_B)
      .send({ id: 'gr:b', name: 'Bob', colorId: 'violet' })
      .expect(201);

    const ungrouped = await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:inbox', name: 'Inbox', colorId: 'sage' })
      .expect(201);

    expect(ungrouped.body).toMatchObject({
      id: 'cb:inbox',
      groupId: null,
      hasUnread: false,
      totalMessage: 0,
      lastMessageId: null,
      lastMessageAt: null,
      tags: [],
    });

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'cb:notes',
        name: 'Notes',
        colorId: 'sage',
        groupId: 'gr:personal',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'cb:stolen',
        name: 'Stolen',
        colorId: 'sage',
        groupId: 'gr:b',
      })
      .expect(404);
  });

  it('updates, moves, and deletes owned chatboxes with cascade', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:personal', name: 'Personal', colorId: 'rose' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:notes', name: 'Notes', colorId: 'sage' })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/diary/chatboxes/cb:notes')
      .set('x-test-user-id', USER_A)
      .send({ name: 'Journal', notificationEnabled: true })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes/cb:notes/move')
      .set('x-test-user-id', USER_A)
      .send({ groupId: 'gr:personal' })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).groupId).toBe('gr:personal');
      });

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes/cb:notes/move')
      .set('x-test-user-id', USER_A)
      .send({ groupId: null })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).groupId).toBeNull();
      });

    memory.messages.push({
      id: 'ms:1',
      userId: USER_A,
      chatboxId: 'cb:notes',
      sender: 'user',
      variant: 'text',
      content: {},
      pinned: false,
      archived: false,
      replyToMessageId: null,
      sourceMessageId: null,
      reactions: [],
      attachments: [],
      decorators: [],
      edited: false,
      createdAt: new Date('2026-01-01T01:00:00.000Z'),
      updatedAt: null,
    });

    await request(app.getHttpServer())
      .delete('/api/diary/chatboxes/cb:notes')
      .set('x-test-user-id', USER_A)
      .expect(204);

    expect(memory.chatboxes).toHaveLength(0);
    expect(memory.messages).toHaveLength(0);
  });

  it('cannot move a chatbox into another user group or modify another user chatbox', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_B)
      .send({ id: 'gr:b', name: 'Bob', colorId: 'violet' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_B)
      .send({ id: 'cb:b', name: 'Bob notes', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:a', name: 'Alice notes', colorId: 'sage' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes/cb:a/move')
      .set('x-test-user-id', USER_A)
      .send({ groupId: 'gr:b' })
      .expect(404);

    await request(app.getHttpServer())
      .patch('/api/diary/chatboxes/cb:b')
      .set('x-test-user-id', USER_A)
      .send({ name: 'Stolen' })
      .expect(404);

    await request(app.getHttpServer())
      .delete('/api/diary/chatboxes/cb:b')
      .set('x-test-user-id', USER_A)
      .expect(404);
  });

  it('creates, updates, and deletes tags with duplicate-label and cascade behavior', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:diary', label: 'diary', colorId: 'lavender' })
      .expect(201);

    expect(created.body).toEqual({
      id: 'tag:diary',
      label: 'diary',
      colorId: 'lavender',
    });

    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:other', label: 'Diary', colorId: 'rose' })
      .expect(409);

    await request(app.getHttpServer())
      .patch('/api/diary/tags/tag:diary')
      .set('x-test-user-id', USER_A)
      .send({ label: 'journal' })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).label).toBe('journal');
      });

    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_B)
      .send({ id: 'tag:b', label: 'bob', colorId: 'violet' })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/diary/tags/tag:b')
      .set('x-test-user-id', USER_A)
      .send({ label: 'stolen' })
      .expect(404);

    memory.messageTags.push({
      messageId: 'ms:1',
      tagId: 'tag:diary',
      userId: USER_A,
    });

    await request(app.getHttpServer())
      .delete('/api/diary/tags/tag:diary')
      .set('x-test-user-id', USER_A)
      .expect(204);

    expect(memory.tags.find((tag) => tag.id === 'tag:diary')).toBeUndefined();
    expect(memory.messageTags).toHaveLength(0);
  });

  it('does not insert DiaryOrder on GET for a never-written user', async () => {
    await asUser(USER_A).expect(200);
    expect(memory.orders).toHaveLength(0);
  });

  it('appends created groups and chatboxes onto DiaryOrder', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:personal', name: 'Personal', colorId: 'rose' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:inbox', name: 'Inbox', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'cb:notes',
        name: 'Notes',
        colorId: 'sage',
        groupId: 'gr:personal',
      })
      .expect(201);

    const snapshot = await asUser(USER_A).expect(200);
    expect(asRecord(snapshot.body).orders).toEqual({
      rootOrders: ['gr:personal', 'cb:inbox'],
      groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      chatboxMessageOrders: { 'cb:inbox': [], 'cb:notes': [] },
    });
  });

  it('moves chatboxes between root and group lists and no-ops same-group moves', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:personal', name: 'Personal', colorId: 'rose' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:notes', name: 'Notes', colorId: 'sage' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes/cb:notes/move')
      .set('x-test-user-id', USER_A)
      .send({ groupId: 'gr:personal' })
      .expect(200);

    let snapshot = await asUser(USER_A).expect(200);
    expect(asRecord(snapshot.body).orders).toEqual({
      rootOrders: ['gr:personal'],
      groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      chatboxMessageOrders: { 'cb:notes': [] },
    });

    const before = memory.chatboxes[0].updatedAt;
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes/cb:notes/move')
      .set('x-test-user-id', USER_A)
      .send({ groupId: 'gr:personal' })
      .expect(200);
    expect(memory.chatboxes[0].updatedAt).toEqual(before);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes/cb:notes/move')
      .set('x-test-user-id', USER_A)
      .send({ groupId: null })
      .expect(200);

    snapshot = await asUser(USER_A).expect(200);
    expect(asRecord(snapshot.body).orders).toEqual({
      rootOrders: ['gr:personal', 'cb:notes'],
      groupChatboxOrders: { 'gr:personal': [] },
      chatboxMessageOrders: { 'cb:notes': [] },
    });
  });

  it('drops chatbox message-order keys on delete and recovers leftovers on group delete', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:personal', name: 'Personal', colorId: 'rose' })
      .expect(201);

    for (const id of ['cb:c', 'cb:d', 'cb:a', 'cb:b']) {
      await request(app.getHttpServer())
        .post('/api/diary/chatboxes')
        .set('x-test-user-id', USER_A)
        .send({
          id,
          name: id,
          colorId: 'sage',
          groupId: 'gr:personal',
        })
        .expect(201);
    }

    const createdAt = {
      'cb:a': new Date('2026-01-01T00:00:02.000Z'),
      'cb:b': new Date('2026-01-01T00:00:01.000Z'),
      'cb:c': new Date('2026-01-01T00:00:03.000Z'),
      'cb:d': new Date('2026-01-01T00:00:03.000Z'),
    };
    for (const chatbox of memory.chatboxes) {
      chatbox.createdAt = createdAt[chatbox.id as keyof typeof createdAt];
    }

    await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .set('x-test-user-id', USER_A)
      .send({
        rootOrders: ['gr:personal'],
        groupChatboxOrders: { 'gr:personal': ['cb:b', 'cb:a'] },
      })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/api/diary/groups/gr:personal')
      .set('x-test-user-id', USER_A)
      .expect(204);

    const snapshot = await asUser(USER_A).expect(200);
    expect(asRecord(snapshot.body).orders).toEqual({
      rootOrders: ['cb:b', 'cb:a', 'cb:c', 'cb:d'],
      groupChatboxOrders: {},
      chatboxMessageOrders: {
        'cb:c': [],
        'cb:d': [],
        'cb:a': [],
        'cb:b': [],
      },
    });

    await request(app.getHttpServer())
      .delete('/api/diary/chatboxes/cb:a')
      .set('x-test-user-id', USER_A)
      .expect(204);

    const afterDelete = await asUser(USER_A).expect(200);
    const orders = asRecord(asRecord(afterDelete.body).orders);
    expect(orders.rootOrders).toEqual(['cb:b', 'cb:c', 'cb:d']);
    expect(asRecord(orders.chatboxMessageOrders)).not.toHaveProperty('cb:a');
  });

  it('replaces sidebar layout, preserves message orders, and rejects invalid layouts', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:personal', name: 'Personal', colorId: 'rose' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:notes', name: 'Notes', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:inbox', name: 'Inbox', colorId: 'sage' })
      .expect(201);

    memory.orders[0].chatboxMessageOrders['cb:notes'] = ['ms:1'];

    const replaced = await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .set('x-test-user-id', USER_A)
      .send({
        rootOrders: ['gr:personal', 'cb:inbox'],
        groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      })
      .expect(200);

    expect(replaced.body).toEqual({
      rootOrders: ['gr:personal', 'cb:inbox'],
      groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      chatboxMessageOrders: { 'cb:notes': ['ms:1'], 'cb:inbox': [] },
    });
    expect(memory.chatboxes.find((row) => row.id === 'cb:notes')?.groupId).toBe(
      'gr:personal',
    );
    expect(
      memory.chatboxes.find((row) => row.id === 'cb:inbox')?.groupId,
    ).toBeNull();

    await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .set('x-test-user-id', USER_A)
      .send({
        rootOrders: ['cb:inbox'],
        groupChatboxOrders: { 'gr:personal': ['cb:notes'] },
      })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .set('x-test-user-id', USER_A)
      .send({
        rootOrders: ['cb:notes', 'cb:notes'],
        groupChatboxOrders: {},
      })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .set('x-test-user-id', USER_A)
      .send({
        rootOrders: ['cb:foreign'],
        groupChatboxOrders: {},
      })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .send({
        rootOrders: [],
        groupChatboxOrders: {},
      })
      .expect(401);

    await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .set('x-test-user-id', USER_A)
      .send({
        rootOrders: ['cb:inbox'],
        groupChatboxOrders: {},
        chatboxMessageOrders: { 'cb:notes': [] },
      })
      .expect(400);

    const later = await request(app.getHttpServer())
      .put('/api/diary/orders/sidebar')
      .set('x-test-user-id', USER_A)
      .send({
        rootOrders: ['cb:inbox'],
        groupChatboxOrders: {},
      })
      .expect(200);
    expect(asRecord(later.body).rootOrders).toEqual(['cb:inbox']);
  });

  it('creates text, todo, and ai messages and appends chatboxMessageOrders', async () => {
    const doc = {
      json: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { ext: true } }],
      },
      preview: 'hello',
    };

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:notes', name: 'Notes', colorId: 'sage' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:text',
        chatboxId: 'cb:notes',
        sender: 'user',
        variant: 'text',
        content: doc,
      })
      .expect(201)
      .expect((response) => {
        expect(asRecord(response.body).edited).toBe(false);
        expect(response.body).not.toHaveProperty('userId');
      });

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:todo',
        chatboxId: 'cb:notes',
        sender: 'user',
        variant: 'todo',
        content: {
          items: [
            {
              id: 'todo:1',
              completed: false,
              content: doc,
              attachments: [],
            },
          ],
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:ai',
        chatboxId: 'cb:notes',
        sender: 'user',
        variant: 'ai',
        content: doc,
      })
      .expect(201);

    const snapshot = await asUser(USER_A).expect(200);
    const orders = asRecord(asRecord(snapshot.body).orders);
    expect(asRecord(orders.chatboxMessageOrders)['cb:notes']).toEqual([
      'ms:text',
      'ms:todo',
      'ms:ai',
    ]);
    const chatbox = (
      snapshot.body as {
        chatboxes: Array<{ totalMessage: number; lastMessageId: string }>;
      }
    ).chatboxes[0];
    expect(chatbox.totalMessage).toBe(3);
    expect(chatbox.lastMessageId).toBe('ms:ai');
  });

  it('forwards with lineage after the origin is deleted', async () => {
    const doc = {
      json: { type: 'doc', content: [{ type: 'paragraph' }] },
      preview: 'caption',
    };

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:a', name: 'A', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:b', name: 'B', colorId: 'rose' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:origin',
        chatboxId: 'cb:a',
        sender: 'user',
        variant: 'text',
        content: doc,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:fwd1',
        chatboxId: 'cb:b',
        sender: 'user',
        variant: 'text',
        content: doc,
        sourceMessageId: 'ms:origin',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:fwd2',
        chatboxId: 'cb:b',
        sender: 'user',
        variant: 'text',
        content: doc,
        sourceMessageId: 'ms:origin',
      })
      .expect(201)
      .expect((response) => {
        expect(asRecord(response.body).sourceMessageId).toBe('ms:origin');
      });

    await request(app.getHttpServer())
      .delete('/api/diary/messages/ms:origin')
      .set('x-test-user-id', USER_A)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:fwd3',
        chatboxId: 'cb:b',
        sender: 'user',
        variant: 'text',
        content: doc,
        sourceMessageId: 'ms:origin',
      })
      .expect(201)
      .expect((response) => {
        expect(asRecord(response.body).sourceMessageId).toBe('ms:origin');
      });

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:reply-missing',
        chatboxId: 'cb:b',
        sender: 'user',
        variant: 'text',
        content: doc,
        replyToMessageId: 'ms:origin',
      })
      .expect(404);
  });

  it('patches todo checkboxes, rejects text PATCH content, and edits with edited=true', async () => {
    const doc = {
      json: { type: 'doc', content: [{ type: 'paragraph' }] },
      preview: 'item',
    };

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:notes', name: 'Notes', colorId: 'sage' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:todo',
        chatboxId: 'cb:notes',
        sender: 'user',
        variant: 'todo',
        content: {
          items: [
            { id: 'todo:1', completed: false, content: doc, attachments: [] },
          ],
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:text',
        chatboxId: 'cb:notes',
        sender: 'user',
        variant: 'text',
        content: doc,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/diary/messages/ms:todo')
      .set('x-test-user-id', USER_A)
      .send({
        content: {
          items: [
            { id: 'todo:1', completed: true, content: doc, attachments: [] },
          ],
        },
      })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).edited).toBe(false);
      });

    await request(app.getHttpServer())
      .patch('/api/diary/messages/ms:text')
      .set('x-test-user-id', USER_A)
      .send({
        content: {
          items: [
            { id: 'todo:1', completed: true, content: doc, attachments: [] },
          ],
        },
      })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/diary/messages/ms:text')
      .set('x-test-user-id', USER_A)
      .send({ replyToMessageId: 'ms:todo' })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/diary/messages/ms:text/edit')
      .set('x-test-user-id', USER_A)
      .send({
        variant: 'text',
        content: { ...doc, preview: 'edited' },
      })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).edited).toBe(true);
      });

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:empty-todo',
        chatboxId: 'cb:notes',
        sender: 'user',
        variant: 'todo',
        content: { items: [] },
      })
      .expect(400);
  });

  it('replaces tags and removes a tag from every message in a chatbox including hidden rows', async () => {
    const doc = {
      json: { type: 'doc', content: [{ type: 'paragraph' }] },
      preview: 'hi',
    };

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:notes', name: 'Notes', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:diary', label: 'diary', colorId: 'lavender' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/messages')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'ms:visible',
        chatboxId: 'cb:notes',
        sender: 'user',
        variant: 'text',
        content: doc,
        tagIds: ['tag:diary'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .put('/api/diary/messages/ms:visible/tags')
      .set('x-test-user-id', USER_A)
      .send({ tagIds: ['tag:diary'] })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).tagIds).toEqual(['tag:diary']);
        expect(asRecord(response.body).edited).toBe(false);
      });

    await request(app.getHttpServer())
      .put('/api/diary/messages/ms:visible/tags')
      .set('x-test-user-id', USER_A)
      .send({ tagIds: ['tag:diary', 'tag:diary'] })
      .expect(400);

    memory.messages.push({
      id: 'ms:hidden',
      userId: USER_A,
      chatboxId: 'cb:notes',
      sender: 'user',
      variant: 'text',
      content: doc,
      pinned: false,
      archived: false,
      replyToMessageId: null,
      sourceMessageId: null,
      reactions: [],
      attachments: [],
      decorators: [],
      edited: false,
      createdAt: new Date('2026-01-01T04:00:00.000Z'),
      updatedAt: null,
    });
    memory.messageTags.push({
      messageId: 'ms:hidden',
      tagId: 'tag:diary',
      userId: USER_A,
    });

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes/cb:notes/remove-tag')
      .set('x-test-user-id', USER_A)
      .send({ tagId: 'tag:diary' })
      .expect(204)
      .expect((response) => {
        expect(response.body).toEqual({});
      });

    expect(
      memory.messageTags.find((join) => join.tagId === 'tag:diary'),
    ).toBeUndefined();
    expect(memory.tags.find((tag) => tag.id === 'tag:diary')).toBeTruthy();
    expect(
      memory.messages.find((row) => row.id === 'ms:hidden')?.updatedAt,
    ).toBeTruthy();
  });

  const paletteShades = {
    soft: '#ffe5ec',
    main: '#F3A3B5',
    strong: 'd56b85',
  };

  const postPalette = (userId: string, id: string) =>
    request(app.getHttpServer())
      .post('/api/diary/palettes')
      .set('x-test-user-id', userId)
      .send({
        id,
        name: 'Verify',
        baseColor: '#b69df7',
        light: paletteShades,
        dark: paletteShades,
      });

  it('accepts owned custom ColorId on Group, Chatbox, and Tag create and update', async () => {
    const paletteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const colorId = `custom:${paletteId}`;

    await postPalette(USER_A, paletteId)
      .expect(201)
      .expect((response) => {
        expect(asRecord(response.body).id).toBe(paletteId);
        expect(asRecord(response.body).baseColor).toBe('#B69DF7');
        expect(asRecord(asRecord(response.body).light).soft).toBe('#FFE5EC');
        expect(response.body).not.toHaveProperty('userId');
      });

    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:preset', name: 'Preset', colorId: 'rose' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/diary/groups/gr:preset')
      .set('x-test-user-id', USER_A)
      .send({ colorId })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).colorId).toBe(colorId);
      });

    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:custom', name: 'Custom', colorId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:preset', name: 'Preset', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/diary/chatboxes/cb:preset')
      .set('x-test-user-id', USER_A)
      .send({ colorId })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).colorId).toBe(colorId);
      });
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:custom', name: 'Custom', colorId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:preset', label: 'preset', colorId: 'lavender' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/diary/tags/tag:preset')
      .set('x-test-user-id', USER_A)
      .send({ colorId })
      .expect(200)
      .expect((response) => {
        expect(asRecord(response.body).colorId).toBe(colorId);
      });
    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:custom', label: 'custom', colorId })
      .expect(201);
  });

  it('accepts preset ColorIds without any palette row', async () => {
    expect(memory.palettes).toEqual([]);

    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:preset-only', name: 'Preset', colorId: 'rose' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:preset-only', name: 'Preset', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'tag:preset-only',
        label: 'preset-only',
        colorId: 'lavender',
      })
      .expect(201);
  });

  it('returns 404 for missing and other-user custom ColorIds on every write path', async () => {
    const missing = 'custom:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const otherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const stolen = `custom:${otherId}`;

    await postPalette(USER_B, otherId).expect(201);

    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:preset', name: 'Preset', colorId: 'rose' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:preset', name: 'Preset', colorId: 'sage' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:preset', label: 'preset', colorId: 'lavender' })
      .expect(201);

    for (const colorId of [missing, stolen]) {
      await request(app.getHttpServer())
        .post('/api/diary/groups')
        .set('x-test-user-id', USER_A)
        .send({ id: `gr:${colorId.slice(-4)}`, name: 'X', colorId })
        .expect(404);
      await request(app.getHttpServer())
        .patch('/api/diary/groups/gr:preset')
        .set('x-test-user-id', USER_A)
        .send({ colorId })
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/diary/chatboxes')
        .set('x-test-user-id', USER_A)
        .send({ id: `cb:${colorId.slice(-4)}`, name: 'X', colorId })
        .expect(404);
      await request(app.getHttpServer())
        .patch('/api/diary/chatboxes/cb:preset')
        .set('x-test-user-id', USER_A)
        .send({ colorId })
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/diary/tags')
        .set('x-test-user-id', USER_A)
        .send({
          id: `tag:${colorId.slice(-4)}`,
          label: colorId.slice(-6),
          colorId,
        })
        .expect(404);
      await request(app.getHttpServer())
        .patch('/api/diary/tags/tag:preset')
        .set('x-test-user-id', USER_A)
        .send({ colorId })
        .expect(404);
    }
  });

  it('rejects malformed custom ColorIds and unknown presets', async () => {
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:bad', name: 'Bad', colorId: 'custom:not-a-uuid' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:bad', name: 'Bad', colorId: 'custom:not-a-uuid' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:bad', label: 'bad', colorId: 'custom:not-a-uuid' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({ id: 'gr:unknown', name: 'Unknown', colorId: 'chartreuse' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/diary/chatboxes')
      .set('x-test-user-id', USER_A)
      .send({ id: 'cb:unknown', name: 'Unknown', colorId: 'chartreuse' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/diary/tags')
      .set('x-test-user-id', USER_A)
      .send({ id: 'tag:unknown', label: 'unknown', colorId: 'chartreuse' })
      .expect(400);
  });

  it('rejects in-use palette delete independently for Group, Chatbox, and Tag', async () => {
    const cases = [
      {
        paletteId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        create: () =>
          request(app.getHttpServer())
            .post('/api/diary/groups')
            .set('x-test-user-id', USER_A)
            .send({
              id: 'gr:inuse',
              name: 'In use',
              colorId: 'custom:dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            }),
        assertUnchanged: () => {
          expect(
            memory.groups.find((row) => row.id === 'gr:inuse')?.colorId,
          ).toBe('custom:dddddddd-dddd-4ddd-8ddd-dddddddddddd');
        },
      },
      {
        paletteId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        create: () =>
          request(app.getHttpServer())
            .post('/api/diary/chatboxes')
            .set('x-test-user-id', USER_A)
            .send({
              id: 'cb:inuse',
              name: 'In use',
              colorId: 'custom:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            }),
        assertUnchanged: () => {
          expect(
            memory.chatboxes.find((row) => row.id === 'cb:inuse')?.colorId,
          ).toBe('custom:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        },
      },
      {
        paletteId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        create: () =>
          request(app.getHttpServer())
            .post('/api/diary/tags')
            .set('x-test-user-id', USER_A)
            .send({
              id: 'tag:inuse',
              label: 'inuse',
              colorId: 'custom:ffffffff-ffff-4fff-8fff-ffffffffffff',
            }),
        assertUnchanged: () => {
          expect(
            memory.tags.find((row) => row.id === 'tag:inuse')?.colorId,
          ).toBe('custom:ffffffff-ffff-4fff-8fff-ffffffffffff');
        },
      },
    ] as const;

    for (const testCase of cases) {
      memory.groups.splice(0, memory.groups.length);
      memory.chatboxes.splice(0, memory.chatboxes.length);
      memory.tags.splice(0, memory.tags.length);
      memory.palettes.splice(0, memory.palettes.length);
      memory.orders.splice(0, memory.orders.length);

      await postPalette(USER_A, testCase.paletteId).expect(201);
      await testCase.create().expect(201);

      await request(app.getHttpServer())
        .delete(`/api/diary/palettes/${testCase.paletteId}`)
        .set('x-test-user-id', USER_A)
        .expect(409)
        .expect((response) => {
          expect(asRecord(response.body).message).toBe('Palette is in use.');
        });

      expect(
        memory.palettes.find((row) => row.id === testCase.paletteId),
      ).toBeTruthy();
      testCase.assertUnchanged();
    }
  });

  it('deletes an unused palette and 404s missing or non-owned palettes', async () => {
    const paletteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    await postPalette(USER_A, paletteId).expect(201);
    await postPalette(USER_B, otherId).expect(201);

    await request(app.getHttpServer())
      .delete(`/api/diary/palettes/${paletteId}`)
      .set('x-test-user-id', USER_A)
      .expect(204)
      .expect((response) => {
        expect(response.body).toEqual({});
      });

    const snapshot = await asUser(USER_A).expect(200);
    expect(snapshot.body.palettes).toEqual([]);

    await request(app.getHttpServer())
      .delete(`/api/diary/palettes/${paletteId}`)
      .set('x-test-user-id', USER_A)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/diary/palettes/${otherId}`)
      .set('x-test-user-id', USER_A)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/diary/palettes/custom:${otherId}`)
      .set('x-test-user-id', USER_B)
      .expect(400);
  });

  it('never leaves a dangling custom ColorId after sequential assign vs delete', async () => {
    const assignFirst = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await postPalette(USER_A, assignFirst).expect(201);
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'gr:first',
        name: 'First',
        colorId: `custom:${assignFirst}`,
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/diary/palettes/${assignFirst}`)
      .set('x-test-user-id', USER_A)
      .expect(409);
    expect(memory.palettes.find((row) => row.id === assignFirst)).toBeTruthy();
    expect(memory.groups.find((row) => row.id === 'gr:first')?.colorId).toBe(
      `custom:${assignFirst}`,
    );

    const deleteFirst = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await postPalette(USER_A, deleteFirst).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/diary/palettes/${deleteFirst}`)
      .set('x-test-user-id', USER_A)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/diary/groups')
      .set('x-test-user-id', USER_A)
      .send({
        id: 'gr:second',
        name: 'Second',
        colorId: `custom:${deleteFirst}`,
      })
      .expect(404);
    expect(memory.groups.find((row) => row.id === 'gr:second')).toBeUndefined();
    expect(
      memory.palettes.find((row) => row.id === deleteFirst),
    ).toBeUndefined();
  });
});
