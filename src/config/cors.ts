import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function createCorsOptions(
  frontendURL: string | undefined,
): CorsOptions {
  const origin = frontendURL?.trim();
  if (!origin) {
    throw new Error('FRONTEND_URL is required to configure CORS');
  }

  return {
    origin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}
