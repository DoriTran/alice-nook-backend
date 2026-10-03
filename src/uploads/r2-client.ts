import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

export type R2RuntimeConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
};

function getRequiredR2Value(configService: ConfigService, key: string): string {
  const value = configService.getOrThrow<string>(key).trim();
  if (!value) {
    throw new Error(`${key} must not be empty`);
  }

  return value;
}

export function getR2RuntimeConfig(
  configService: ConfigService,
): R2RuntimeConfig {
  return {
    accountId: getRequiredR2Value(configService, 'R2_ACCOUNT_ID'),
    accessKeyId: getRequiredR2Value(configService, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: getRequiredR2Value(configService, 'R2_SECRET_ACCESS_KEY'),
    bucketName: getRequiredR2Value(configService, 'R2_BUCKET_NAME'),
    endpoint: getRequiredR2Value(configService, 'R2_ENDPOINT'),
  };
}

export function createR2Client(config: R2RuntimeConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
