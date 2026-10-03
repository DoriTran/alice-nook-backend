import { BadRequestException } from '@nestjs/common';

export const MAX_ATTACHMENT_SIZE_BYTES = 200 * 1000 * 1000;

export function assertUploadSize(_mimeType: string, size: number): void {
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
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
