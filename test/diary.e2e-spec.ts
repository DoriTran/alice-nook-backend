import { Test, TestingModule } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { createParamDecorator } = jest.requireActual(
    '@nestjs/common',
  ) as typeof import('@nestjs/common');

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

describe('DiaryController (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = {
    diaryGroup: { findMany: jest.fn().mockResolvedValue([]) },
    diaryChatbox: { findMany: jest.fn().mockResolvedValue([]) },
    diaryMessage: { findMany: jest.fn().mockResolvedValue([]) },
    diaryTag: { findMany: jest.fn().mockResolvedValue([]) },
    diaryCustomPalette: { findMany: jest.fn().mockResolvedValue([]) },
    diaryOrder: { findUnique: jest.fn().mockResolvedValue(null) },
  };

  beforeEach(async () => {
    Object.values(prisma).forEach((delegate) => {
      Object.values(delegate).forEach((fn) => {
        (fn as jest.Mock).mockClear();
      });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [{ provide: APP_GUARD, useClass: TestAuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects anonymous GET /api/diary', async () => {
    await request(app.getHttpServer()).get('/api/diary').expect(401);
  });

  it('returns 200 and an empty snapshot for an authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/diary')
      .set('x-test-user-id', 'user-a')
      .expect(200);

    expect(response.body).toEqual(emptySnapshot);
    expect(prisma.diaryGroup.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
    });
  });
});
