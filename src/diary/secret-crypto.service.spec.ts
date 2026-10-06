import { ConfigService } from '@nestjs/config';
import { SecretCryptoService } from './secret-crypto.service';
import {
  graphemeLength,
  hydrateSecrets,
  materializeSecrets,
} from './secret-content';

const key = Buffer.alloc(32, 7).toString('base64');
const fragment = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'alice@example.com 👩‍💻' }],
    },
  ],
};

describe('SecretCryptoService', () => {
  it('disables Cloud Secret without crashing for missing or malformed keys', () => {
    expect(new SecretCryptoService(new ConfigService({})).enabled).toBe(false);
    expect(
      new SecretCryptoService(
        new ConfigService({ ALICE_SECRET_KEY: 'not-base64' }),
      ).enabled,
    ).toBe(false);
  });

  it('encrypts and authenticates canonical RichContent with a fresh IV', () => {
    const service = new SecretCryptoService(
      new ConfigService({ ALICE_SECRET_KEY: key }),
    );
    const first = service.encrypt(fragment, 'secret:1', 19);
    const second = service.encrypt(fragment, 'secret:1', 19);
    expect(service.decrypt(first)).toEqual(fragment);
    expect(first.ciphertext).not.toContain('alice@example.com');
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(() =>
      service.decrypt({
        ...first,
        authTag: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow();
  });

  it('materializes payloads and hydrates without persisting plaintext', () => {
    const service = new SecretCryptoService(
      new ConfigService({ ALICE_SECRET_KEY: key }),
    );
    const content = {
      json: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'secretContentInline',
                attrs: { secretId: 'secret:1', displayLength: 0 },
              },
            ],
          },
        ],
      },
      preview: '[Secret]',
    };
    const encrypted = materializeSecrets(
      content,
      [{ secretId: 'secret:1', fragment }],
      service,
    );
    expect(JSON.stringify(encrypted)).not.toContain('alice@example.com');
    expect(hydrateSecrets(encrypted, service)).toEqual({
      'secret:1': fragment,
    });
  });

  it('allows one Copy wrapper inside an encrypted fragment but rejects same-type nesting', () => {
    const service = new SecretCryptoService(
      new ConfigService({ ALICE_SECRET_KEY: key }),
    );
    const content = {
      json: {
        type: 'doc',
        content: [
          { type: 'secretContentBlock', attrs: { secretId: 'secret:copy' } },
        ],
      },
      preview: '[Secret]',
    };
    const wrapped = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contentCopyInline',
              attrs: { copyId: 'copy:1' },
              content: [{ type: 'text', text: 'inside' }],
            },
          ],
        },
      ],
    };
    expect(() =>
      materializeSecrets(
        content,
        [{ secretId: 'secret:copy', fragment: wrapped }],
        service,
      ),
    ).not.toThrow();
    const nested = structuredClone(wrapped);
    const outer = nested.content[0].content[0];
    outer.content = [{ ...outer, attrs: { copyId: 'copy:2' } }];
    expect(() =>
      materializeSecrets(
        content,
        [{ secretId: 'secret:copy', fragment: nested }],
        service,
      ),
    ).toThrow('Special Content cannot be nested');
  });

  it('counts user-facing graphemes', () => {
    expect(
      graphemeLength({ type: 'doc', content: [{ type: 'text', text: 'a👩‍💻' }] }),
    ).toBe(2);
  });
});
