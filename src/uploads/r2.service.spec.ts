import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { R2Service } from './r2.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const config = {
  R2_ACCOUNT_ID: 'dummy-account',
  R2_ACCESS_KEY_ID: 'dummy-access-key',
  R2_SECRET_ACCESS_KEY: 'dummy-secret-key',
  R2_BUCKET_NAME: 'dummy-bucket',
  R2_ENDPOINT: 'https://dummy-account.r2.cloudflarestorage.com',
};

describe('R2Service', () => {
  let service: R2Service;

  beforeEach(() => {
    jest.mocked(getSignedUrl).mockReset();
    jest
      .mocked(getSignedUrl)
      .mockResolvedValue('https://signed.example/upload');
    service = new R2Service(new ConfigService(config));
  });

  afterEach(() => service.onModuleDestroy());

  it('creates a user-scoped signed PutObject request', async () => {
    const before = Date.now();
    const result = await service.createPresignedUpload('user/a', {
      fileName: 'Photo.JPEG',
      mimeType: 'image/jpeg',
      size: 1024,
    });
    const after = Date.now();

    expect(result).toMatchObject({
      uploadUrl: 'https://signed.example/upload',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(result.objectKey).toMatch(
      /^users\/user%2Fa\/attachments\/[0-9a-f-]{36}\.jpeg$/,
    );
    expect(Date.parse(result.expiresAt)).toBeGreaterThanOrEqual(
      before + 600_000,
    );
    expect(Date.parse(result.expiresAt)).toBeLessThanOrEqual(after + 600_000);

    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const command = jest.mocked(getSignedUrl).mock.calls[0][1];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: 'dummy-bucket',
      Key: result.objectKey,
      ContentType: 'image/jpeg',
    });
    expect(jest.mocked(getSignedUrl).mock.calls[0][2]).toEqual({
      expiresIn: 600,
    });
  });

  it('fails clearly when required configuration is missing', () => {
    expect(() => new R2Service(new ConfigService({}))).toThrow(/R2_ACCOUNT_ID/);
  });

  it('fails clearly when required configuration is empty', () => {
    expect(
      () => new R2Service(new ConfigService({ R2_ACCOUNT_ID: '   ' })),
    ).toThrow(/R2_ACCOUNT_ID/);
  });
});
