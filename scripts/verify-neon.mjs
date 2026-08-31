/**
 * Verify Neon auth records for a given email.
 * Usage: node scripts/verify-neon.mjs <email>
 * Reads DATABASE_URL from .env (never printed).
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (dotenv may not be installed as runtime dep)
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const email = process.argv[2] || 'alice.e2e.1788099774732@example.com';

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  console.log(`\nVerifying records for: ${email}\n`);

  // ── user ──────────────────────────────────────────────────────────────
  const userRes = await client.query(
    `SELECT id, name, email, "emailVerified", "createdAt" FROM "user" WHERE email = $1`,
    [email]
  );
  if (userRes.rows.length === 0) {
    console.error('❌  No user row found!');
    process.exitCode = 1;
  } else {
    const u = userRes.rows[0];
    console.log('✅  user');
    console.log(`     id           : ${u.id}`);
    console.log(`     name         : ${u.name}`);
    console.log(`     email        : ${u.email}`);
    console.log(`     emailVerified: ${u.emailVerified}`);
    console.log(`     createdAt    : ${u.createdAt}`);
  }

  const userId = userRes.rows[0]?.id;
  if (!userId) {
    await client.end();
    return;
  }

  // ── account ───────────────────────────────────────────────────────────
  const accRes = await client.query(
    `SELECT id, "providerId", "accountId", "userId", "createdAt" FROM "account" WHERE "userId" = $1`,
    [userId]
  );
  if (accRes.rows.length === 0) {
    console.error('\n❌  No account row found!');
    process.exitCode = 1;
  } else {
    console.log('\n✅  account');
    for (const a of accRes.rows) {
      console.log(`     id         : ${a.id}`);
      console.log(`     providerId : ${a.providerId}`);
      console.log(`     accountId  : ${a.accountId}`);
      console.log(`     userId     : ${a.userId}`);
      console.log(`     createdAt  : ${a.createdAt}`);
    }
  }

  // ── session ───────────────────────────────────────────────────────────
  const sesRes = await client.query(
    `SELECT id, "userId", "expiresAt", "createdAt" FROM "session" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [userId]
  );
  if (sesRes.rows.length === 0) {
    console.error('\n❌  No session row found!');
    process.exitCode = 1;
  } else {
    console.log(`\n✅  session (${sesRes.rows.length} row(s))`);
    for (const s of sesRes.rows) {
      console.log(`     id        : ${s.id}`);
      console.log(`     userId    : ${s.userId}`);
      console.log(`     expiresAt : ${s.expiresAt}`);
      console.log(`     createdAt : ${s.createdAt}`);
    }
  }

  console.log('\n─────────────────────────────────────────');
  if (process.exitCode === 1) {
    console.log('  NEON VERIFICATION FAILED ❌');
  } else {
    console.log('  NEON VERIFICATION PASSED ✅');
    console.log('  user + account + session rows all exist.');
  }
  console.log('─────────────────────────────────────────\n');

  await client.end();
}

main().catch(err => {
  console.error('DB error:', err.message);
  process.exit(1);
});
