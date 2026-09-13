import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('chatbox notification default migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260913090000_enable_chatbox_notifications_by_default',
      'migration.sql',
    ),
    'utf8',
  );

  it('sets the default for new rows without updating existing rows', () => {
    expect(migration).toMatch(
      /ALTER COLUMN "notificationEnabled" SET DEFAULT true;/,
    );
    expect(migration).not.toMatch(/\bUPDATE\b/i);
  });
});
