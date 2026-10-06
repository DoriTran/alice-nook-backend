import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type SecretPayload = {
  secretId: string;
  fragment: unknown;
};

export type EncryptedSecretAttrs = {
  secretId: string;
  version: 1;
  keyVersion: 1;
  ciphertext: string;
  iv: string;
  authTag: string;
  displayLength: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const decodeKey = (value: string | undefined): Buffer | null => {
  const source = value?.trim();
  if (!source || !/^[A-Za-z0-9+/]+={0,2}$/.test(source)) return null;
  const decoded = Buffer.from(source, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== source)
    return null;
  return decoded;
};

@Injectable()
export class SecretCryptoService {
  private readonly logger = new Logger(SecretCryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const configured = config.get<string>('ALICE_SECRET_KEY');
    this.key = decodeKey(configured);
    if (!this.key && process.env.NODE_ENV !== 'test') {
      this.logger.warn(
        configured?.trim()
          ? 'Cloud Secret Content is disabled: ALICE_SECRET_KEY must be canonical Base64 for exactly 32 bytes.'
          : 'Cloud Secret Content is disabled: ALICE_SECRET_KEY is not configured.',
      );
    }
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  encrypt(
    fragment: unknown,
    secretId: string,
    displayLength: number,
  ): EncryptedSecretAttrs {
    if (!this.key) throw new ServiceUnavailableException('SECRET_UNAVAILABLE');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = Buffer.from(
      JSON.stringify({ version: 1, fragment }),
      'utf8',
    );
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    return {
      secretId,
      version: 1,
      keyVersion: 1,
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      displayLength,
    };
  }

  decrypt(attrs: unknown): unknown {
    if (!this.key) throw new ServiceUnavailableException('SECRET_UNAVAILABLE');
    if (!isRecord(attrs) || attrs.version !== 1 || attrs.keyVersion !== 1)
      throw new Error('Unsupported Secret payload');
    for (const field of ['ciphertext', 'iv', 'authTag'] as const)
      if (typeof attrs[field] !== 'string')
        throw new Error('Invalid Secret payload');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(attrs.iv as string, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(attrs.authTag as string, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(attrs.ciphertext as string, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const envelope = JSON.parse(plaintext) as unknown;
    if (
      !isRecord(envelope) ||
      envelope.version !== 1 ||
      !('fragment' in envelope)
    )
      throw new Error('Invalid Secret envelope');
    return envelope.fragment;
  }
}
