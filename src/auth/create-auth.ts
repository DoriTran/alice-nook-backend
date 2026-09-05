import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { PrismaClient } from '../../generated/prisma/client';
import { getAuthRuntimeConfig } from './auth-config';
import {
  SIGNUP_NOT_ALLOWED_CODE,
  SIGNUP_NOT_ALLOWED_MESSAGE,
  isSignupEmailAllowed,
} from './signup-allowlist';

function assertSignupEmailAllowed(email: string | null | undefined): void {
  if (isSignupEmailAllowed(email)) return;

  throw APIError.from('FORBIDDEN', {
    code: SIGNUP_NOT_ALLOWED_CODE,
    message: SIGNUP_NOT_ALLOWED_MESSAGE,
  });
}

function getBodyEmail(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('email' in body)) {
    return undefined;
  }

  return typeof body.email === 'string' ? body.email : undefined;
}

export function createAuth(prisma: PrismaClient) {
  const config = getAuthRuntimeConfig();

  return betterAuth({
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
    },
    hooks: {
      before: createAuthMiddleware((ctx) => {
        if (ctx.path === '/sign-up/email') {
          const body: unknown = ctx.body;
          assertSignupEmailAllowed(getBodyEmail(body));
        }
        return Promise.resolve();
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: (user) => {
            assertSignupEmailAllowed(user.email);
            return Promise.resolve();
          },
        },
      },
    },
    ...(config.google
      ? {
          socialProviders: {
            google: config.google,
          },
        }
      : {}),
  });
}

export type Auth = ReturnType<typeof createAuth>;
