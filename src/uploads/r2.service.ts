import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import {
  createR2Client,
  getR2RuntimeConfig,
  type R2RuntimeConfig,
} from './r2-client';
import { assertUploadSize, getSafeFileExtension } from './upload-validation';

const PRESIGNED_UPLOAD_TTL_SECONDS = 10 * 60;

export type PresignedUpload = {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  method: 'PUT';
  headers: {
    'Content-Type': string;
  };
};

@Injectable()
export class R2Service implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly config: R2RuntimeConfig;

  constructor(configService: ConfigService) {
    this.config = getR2RuntimeConfig(configService);
    this.client = createR2Client(this.config);
  }

  async createPresignedUpload(
    userId: string,
    dto: PresignUploadDto,
  ): Promise<PresignedUpload> {
    assertUploadSize(dto.mimeType, dto.size);

    const objectKey = this.createObjectKey(userId, dto.fileName);
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: objectKey,
      ContentType: dto.mimeType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
    });

    return {
      objectKey,
      uploadUrl,
      expiresAt: new Date(
        Date.now() + PRESIGNED_UPLOAD_TTL_SECONDS * 1000,
      ).toISOString(),
      method: 'PUT',
      headers: { 'Content-Type': dto.mimeType },
    };
  }

  async presignPut(objectKey: string, mimeType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: objectKey,
        ContentType: mimeType,
      }),
      { expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS },
    );
  }

  async head(objectKey: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucketName, Key: objectKey }),
    );
  }

  async presignGet(objectKey: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: objectKey,
      }),
      { expiresIn },
    );
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: objectKey,
      }),
    );
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  private createObjectKey(userId: string, fileName: string): string {
    const userSegment = encodeURIComponent(userId).replace(
      /[.!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const extension = getSafeFileExtension(fileName);
    return `users/${userSegment}/attachments/${randomUUID()}${extension}`;
  }
}
