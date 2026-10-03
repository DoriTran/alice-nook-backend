import { BadRequestException } from '@nestjs/common';
import {
  assertUploadSize,
  getSafeFileExtension,
  MEBIBYTE,
  UPLOAD_SIZE_LIMITS,
} from './upload-validation';

describe('upload validation', () => {
  it.each([
    ['image/png', UPLOAD_SIZE_LIMITS.image],
    ['video/mp4', UPLOAD_SIZE_LIMITS.video],
    ['application/pdf', UPLOAD_SIZE_LIMITS.other],
    ['application/octet-stream', 100 * MEBIBYTE],
  ])('accepts %s at its limit', (mimeType, size) => {
    expect(() => assertUploadSize(mimeType, size)).not.toThrow();
  });

  it.each([
    ['image/png', UPLOAD_SIZE_LIMITS.image + 1],
    ['video/mp4', UPLOAD_SIZE_LIMITS.video + 1],
    ['application/pdf', UPLOAD_SIZE_LIMITS.other + 1],
  ])('rejects %s above its limit', (mimeType, size) => {
    expect(() => assertUploadSize(mimeType, size)).toThrow(BadRequestException);
  });

  it('preserves only a safe final extension', () => {
    expect(getSafeFileExtension('Photo.JPEG')).toBe('.jpeg');
    expect(getSafeFileExtension('archive.tar.gz')).toBe('.gz');
    expect(getSafeFileExtension('name.very-long-extension')).toBe('');
    expect(getSafeFileExtension('.env')).toBe('');
  });
});
