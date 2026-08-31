import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../../generated/prisma/client';
import { getAuthRuntimeConfig } from './auth-config';

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
