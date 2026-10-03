import { createR2Client, type R2RuntimeConfig } from './r2-client';

describe('R2 client configuration', () => {
  it('uses the configured endpoint and the R2 auto region', async () => {
    const config: R2RuntimeConfig = {
      accountId: 'dummy-account',
      accessKeyId: 'dummy-access-key',
      secretAccessKey: 'dummy-secret-key',
      bucketName: 'dummy-bucket',
      endpoint: 'https://dummy-account.r2.cloudflarestorage.com',
    };
    const client = createR2Client(config);

    await expect(client.config.region()).resolves.toBe('auto');
    await expect(client.config.endpoint()).resolves.toMatchObject({
      protocol: 'https:',
      hostname: 'dummy-account.r2.cloudflarestorage.com',
    });

    client.destroy();
  });
});
