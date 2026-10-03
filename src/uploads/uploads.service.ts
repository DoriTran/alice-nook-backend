import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { R2Service } from './r2.service';
import { assertUploadSize, getSafeFileExtension } from './upload-validation';

const PUT_TTL_SECONDS = 600;
const GET_TTL_SECONDS = 600;

const kindFrom = (mime: string): string => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime === 'application/pdf' ||
    mime.includes('officedocument') ||
    mime.includes('msword')
  )
    return 'document';
  if (
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime === 'application/rtf'
  )
    return 'note';
  if (
    [
      'application/zip',
      'application/gzip',
      'application/x-tar',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
    ].includes(mime)
  )
    return 'archive';
  if (
    mime === 'application/json' ||
    mime.includes('javascript') ||
    mime.includes('xml') ||
    mime === 'text/css' ||
    mime === 'text/html'
  )
    return 'code';
  return 'file';
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  async presign(userId: string, dto: PresignUploadDto) {
    assertUploadSize(dto.mimeType, dto.size);
    const uuid = randomUUID();
    const id = `att:${uuid}`;
    const userSegment = encodeURIComponent(userId).replace(
      /[.!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const objectKey = `users/${userSegment}/attachments/${uuid}${getSafeFileExtension(dto.fileName)}`;
    const expiresAt = new Date(Date.now() + PUT_TTL_SECONDS * 1000);
    await this.prisma.diaryAttachmentObject.create({
      data: {
        id,
        userId,
        objectKey,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        size: dto.size,
        kind: kindFrom(dto.mimeType),
        status: 'pending',
        uploadExpiresAt: expiresAt,
      },
    });
    try {
      return {
        attachmentId: id,
        uploadUrl: await this.r2.presignPut(objectKey, dto.mimeType),
        expiresAt: expiresAt.toISOString(),
        method: 'PUT' as const,
        headers: { 'Content-Type': dto.mimeType },
      };
    } catch (error) {
      await this.prisma.diaryAttachmentObject.deleteMany({
        where: { id, userId, status: 'pending' },
      });
      throw error;
    }
  }

  async finalize(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (row.status === 'cleanup_pending') throw new NotFoundException();
    if (row.status === 'pending') {
      const head = await this.r2.head(row.objectKey);
      if (
        head.ContentLength !== row.size ||
        head.ContentType?.trim().toLowerCase() !== row.mimeType
      ) {
        throw new BadRequestException(
          'Uploaded object metadata does not match',
        );
      }
      await this.prisma.diaryAttachmentObject.updateMany({
        where: { id, userId, status: 'pending' },
        data: { status: 'uploaded', uploadedAt: new Date() },
      });
    }
    return this.metadata(await this.owned(userId, id));
  }

  async readUrl(userId: string, id: string) {
    const row = await this.owned(userId, id);
    if (
      row.status !== 'committed' ||
      !(await this.prisma.diaryMessageAttachment.findFirst({
        where: { attachmentId: id },
      }))
    )
      throw new NotFoundException();
    const expiresAt = new Date(Date.now() + GET_TTL_SECONDS * 1000);
    return {
      url: await this.r2.presignGet(row.objectKey, GET_TTL_SECONDS),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async cleanupPendingAttachments(
    userId: string,
    attachmentIds: string[],
  ): Promise<void> {
    for (const attachmentId of [...new Set(attachmentIds)]) {
      try {
        await this.cleanupPendingAttachment(userId, attachmentId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to clean up attachment ${attachmentId}: ${message}`,
        );
      }
    }
  }

  async cleanupPendingAttachment(
    userId: string,
    attachmentId: string,
  ): Promise<void> {
    const row = await this.prisma.diaryAttachmentObject.findFirst({
      where: { id: attachmentId, userId, status: 'cleanup_pending' },
      select: { id: true, objectKey: true },
    });
    if (!row) return;

    const referenced = await this.prisma.diaryMessageAttachment.findFirst({
      where: { attachmentId: row.id },
      select: { attachmentId: true },
    });
    if (referenced) return;

    await this.r2.delete(row.objectKey);
    await this.prisma.diaryAttachmentObject.deleteMany({
      where: { id: row.id, userId, status: 'cleanup_pending' },
    });
  }

  private async owned(userId: string, id: string) {
    const row = await this.prisma.diaryAttachmentObject.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private metadata(row: {
    id: string;
    kind: string;
    fileName: string;
    mimeType: string;
    size: number;
  }) {
    return {
      id: row.id,
      type: row.kind,
      name: row.fileName,
      mimeType: row.mimeType,
      size: row.size,
    };
  }
}
