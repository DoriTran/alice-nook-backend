import { BadRequestException } from '@nestjs/common';

export const MEBIBYTE = 1024 * 1024;

export const UPLOAD_SIZE_LIMITS = {
  image: 20 * MEBIBYTE,
  video: 250 * MEBIBYTE,
  other: 100 * MEBIBYTE,
} as const;

export function getUploadSizeLimit(mimeType: string): number {
  if (mimeType.startsWith('image/')) {
    return UPLOAD_SIZE_LIMITS.image;
  }

  if (mimeType.startsWith('video/')) {
    return UPLOAD_SIZE_LIMITS.video;
  }

  return UPLOAD_SIZE_LIMITS.other;
}

export function assertUploadSize(mimeType: string, size: number): void {
  if (size > getUploadSizeLimit(mimeType)) {
    throw new BadRequestException('File exceeds the allowed size');
  }
}

export function getSafeFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return '';
  }

  const extension = fileName.slice(dotIndex + 1);
  return /^[a-z0-9]{1,10}$/i.test(extension)
    ? `.${extension.toLowerCase()}`
    : '';
}
