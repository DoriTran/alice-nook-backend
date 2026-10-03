import { BadRequestException } from '@nestjs/common';
import {
  assertUploadSize,
  getSafeFileExtension,
  MAX_ATTACHMENT_SIZE_BYTES,
} from './upload-validation';

describe('upload validation', () => {
  it.each([
    'image/png',
    'video/mp4',
    'audio/mpeg',
    'application/pdf',
    'application/zip',
    'application/javascript',
    'application/octet-stream',
  ])('accepts %s at exactly 200 MB', (mimeType) => {
    expect(() =>
      assertUploadSize(mimeType, MAX_ATTACHMENT_SIZE_BYTES),
    ).not.toThrow();
  });

  it.each([
    'image/png',
    'video/mp4',
    'audio/mpeg',
    'application/pdf',
    'application/zip',
    'application/javascript',
    'application/octet-stream',
  ])('rejects %s at 200 MB plus one byte', (mimeType) => {
    expect(() =>
      assertUploadSize(mimeType, MAX_ATTACHMENT_SIZE_BYTES + 1),
    ).toThrow(BadRequestException);
  });

  it('preserves only a safe final extension', () => {
    expect(getSafeFileExtension('Photo.JPEG')).toBe('.jpeg');
    expect(getSafeFileExtension('archive.tar.gz')).toBe('.gz');
    expect(getSafeFileExtension('name.very-long-extension')).toBe('');
    expect(getSafeFileExtension('.env')).toBe('');
  });
});
