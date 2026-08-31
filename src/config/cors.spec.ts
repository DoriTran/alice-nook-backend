import { createCorsOptions } from './cors';

describe('createCorsOptions', () => {
  it('allows only the configured origin with credentials', () => {
    expect(createCorsOptions('http://localhost:8888')).toEqual({
      origin: 'http://localhost:8888',
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  });

  it('rejects a missing origin', () => {
    expect(() => createCorsOptions(undefined)).toThrow(
      'FRONTEND_URL is required',
    );
  });
});
