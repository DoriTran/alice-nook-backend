import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { UploadsModule } from './../src/uploads/uploads.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { MAX_ATTACHMENT_SIZE_BYTES } from './../src/uploads/upload-validation';

jest.mock('./../src/prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { createParamDecorator } =
    jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common');

  return {
    Session: createParamDecorator(
      (_data: unknown, context: ExecutionContext) =>
        context.switchToHttp().getRequest<{ session?: unknown }>().session,
    ),
  };
});

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestContext = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      session?: { user: { id: string } };
    }>();
    const userId = requestContext.headers['x-test-user-id'];
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new UnauthorizedException();
    }

    requestContext.session = { user: { id: userId } };
    return true;
  }
}

const MEBIBYTE = 1024 * 1024;
const validBody = {
  fileName: 'photo.png',
  mimeType: 'image/png',
  size: MEBIBYTE,
};

describe('UploadsController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    jest
      .mocked(getSignedUrl)
      .mockResolvedValue('https://signed.example/upload');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              R2_ACCOUNT_ID: 'dummy-account',
              R2_ACCESS_KEY_ID: 'dummy-access-key',
              R2_SECRET_ACCESS_KEY: 'dummy-secret-key',
              R2_BUCKET_NAME: 'dummy-bucket',
              R2_ENDPOINT: 'https://dummy-account.r2.cloudflarestorage.com',
            }),
          ],
        }),
        UploadsModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: TestAuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue({
        diaryAttachmentObject: {
          create: jest.fn(({ data }: { data: unknown }) => data),
          deleteMany: jest.fn(),
        },
      })
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

  afterAll(async () => app.close());

  const postPresign = (body: Record<string, unknown>, authenticated = true) => {
    const pending = request(app.getHttpServer())
      .post('/api/uploads/presign')
      .send(body);
    return authenticated ? pending.set('x-test-user-id', 'user-a') : pending;
  };

  it('returns the authenticated presigned upload contract', async () => {
    const response = await postPresign(validBody).expect(201);
    expect(response.body).toMatchObject({
      uploadUrl: 'https://signed.example/upload',
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
    });
    expect(response.body.attachmentId).toMatch(/^att:[0-9a-f-]{36}$/);
    expect(response.body.objectKey).toBeUndefined();
    expect(response.body.expiresAt).toEqual(expect.any(String));
  });

  it('rejects anonymous requests', () =>
    postPresign(validBody, false).expect(401));

  it.each(['userId', 'objectKey'])(
    'rejects the client-controlled %s field',
    (field) => postPresign({ ...validBody, [field]: 'forged' }).expect(400),
  );

  it.each([
    'image/png',
    'video/mp4',
    'audio/mpeg',
    'application/pdf',
    'application/zip',
    'application/javascript',
    'application/octet-stream',
  ])('accepts %s at exactly 200 MiB', (mimeType) =>
    postPresign({
      ...validBody,
      mimeType,
      size: MAX_ATTACHMENT_SIZE_BYTES,
    }).expect(201),
  );

  it.each([
    'image/png',
    'video/mp4',
    'audio/mpeg',
    'application/pdf',
    'application/zip',
    'application/javascript',
    'application/octet-stream',
  ])('rejects %s at 200 MiB plus one byte', (mimeType) =>
    postPresign({
      ...validBody,
      mimeType,
      size: MAX_ATTACHMENT_SIZE_BYTES + 1,
    }).expect(400),
  );

  it.each([0, -1, 1.5])('rejects invalid size %s', (size) =>
    postPresign({ ...validBody, size }).expect(400),
  );

  it.each([undefined, '', 'not-a-mime', 'image/*'])(
    'rejects MIME %s',
    (mimeType) => {
      const body: Record<string, unknown> = { ...validBody, mimeType };
      if (mimeType === undefined) {
        delete body.mimeType;
      }
      return postPresign(body).expect(400);
    },
  );

  it.each(['../secret.png', '..\\secret.png', '/absolute.png', 'C:\\file.png'])(
    'rejects path-like filename %s',
    (fileName) => postPresign({ ...validBody, fileName }).expect(400),
  );
});
