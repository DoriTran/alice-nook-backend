# Better Auth Authentication Foundation — Step Report

**Date:** 2026-08-09  
**Stack:** NestJS 11 · Prisma 7 · Neon PostgreSQL 18 · Better Auth  
**Status:** Complete (not committed)

---

## Goal

Establish a production-ready authentication foundation using Better Auth:

- Email + password first
- Sessions handled by Better Auth (no custom JWT/password hashing)
- Compatible with NestJS + Prisma 7 + Neon
- Ready to add Google OAuth / account linking later
- No Diary/Workspace models yet

---

## What was done

### 1. Prisma smoke-test cleanup

- Removed temporary `PrismaTest` model from `prisma/schema.prisma`
- Removed `GET /prisma-test` and related service/test code
- Deleted migration `20260808172512_init`
- Dropped leftover Neon table + `_prisma_migrations` history row
- Verified `npx prisma migrate status` was clean before auth work

### 2. Package installs

```bash
npm install better-auth @better-auth/prisma-adapter @thallesp/nestjs-better-auth
```

Installed versions:

| Package | Version |
| --- | --- |
| `better-auth` | `^1.6.26` |
| `@better-auth/prisma-adapter` | `^1.6.26` |
| `@thallesp/nestjs-better-auth` | `^2.7.0` |

### 3. Better Auth schema + migration

- Added `src/auth/create-auth.ts` (factory used by Nest)
- Added `src/auth/auth.ts` (standalone CLI config with PrismaPg adapter)
- Generated auth models via `npx auth@latest generate`
- Applied migration: **`20260808175540_better_auth`**

Prisma models (mapped tables):

| Model | Table |
| --- | --- |
| `User` | `user` |
| `Session` | `session` |
| `Account` | `account` |
| `Verification` | `verification` |

### 4. Environment variables

`.env` (local secrets only):

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=http://localhost:3000`

`.env.example` updated with placeholders only (no real secrets).

### 5. NestJS integration

- `src/main.ts`: `bodyParser: false` (required by Nest Better Auth)
- `src/app.module.ts`: `AuthModule.forRootAsync` injecting `PrismaService` into `createAuth(prisma)`
- `src/app.controller.ts`: `GET /health` marked `@AllowAnonymous()`
- Global `ValidationPipe` kept as-is
- No custom JWT / password / session logic

---

## Files created / modified

### Created

- `src/auth/create-auth.ts`
- `src/auth/auth.ts`
- `prisma/migrations/20260808175540_better_auth/migration.sql`
- `docs/better-auth-foundation-report.md` (this report)

### Modified

- `prisma/schema.prisma`
- `src/main.ts`
- `src/app.module.ts`
- `src/app.controller.ts`
- `src/app.service.ts`
- `src/app.controller.spec.ts`
- `.env`
- `.env.example`
- `package.json` / `package-lock.json`

### Removed

- `PrismaTest` model and smoke-test endpoint
- `prisma/migrations/20260808172512_init`

---

## Auth endpoints

Default Better Auth base path: `/api/auth`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/sign-up/email` | Create user (email/password) |
| `POST` | `/api/auth/sign-in/email` | Login + session cookie |
| `POST` | `/api/auth/sign-out` | End session |
| `GET` | `/api/auth/get-session` | Current session |

Public non-auth route:

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/health` | `{ "status": "ok" }` |

---

## Environment variables required

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection |
| `BETTER_AUTH_SECRET` | Auth secret (≥ 32 chars) |
| `BETTER_AUTH_URL` | Auth base URL (`http://localhost:3000` locally) |

Optional existing placeholders remain in `.env.example`: `DATABASE_HOST`, `DATABASE_POOLER_HOST`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`.

---

## Verification performed

```bash
npx prisma migrate status
npm run start:dev
```

Checks:

1. NestJS starts successfully
2. `GET /health` → `{ "status": "ok" }` without auth
3. Sign-up creates a user and session
4. Sign-in creates a valid session cookie
5. `GET /api/auth/get-session` returns the authenticated user
6. Invalid password returns `401` / `INVALID_EMAIL_OR_PASSWORD`
7. Prisma migration status is up to date
8. Neon remains reachable (auth writes succeeded against Neon)

**curl note:** mutating Better Auth requests from curl need:

```http
Origin: http://localhost:3000
```

---

## Architecture notes / compatibility

- Prisma 7 requires `PrismaPg`; Better Auth must receive Nest’s `PrismaService`, not a bare `new PrismaClient()`
- Generated client import path: `generated/prisma/client` (not `@prisma/client`)
- Nest Better Auth module registers a **global AuthGuard**; public routes must use `@AllowAnonymous()`
- Better Auth CLI cannot use Nest DI, so `src/auth/auth.ts` builds a short-lived adapter-backed Prisma client for schema generation
- Account linking remains enabled by Better Auth defaults — Google OAuth can be added later without redesigning User/Account/Session
- Jest cannot parse `@thallesp/nestjs-better-auth` ESM by default; unit test mocks `AllowAnonymous`

```text
Client
  ├─ POST/GET /api/auth/*  →  @thallesp/nestjs-better-auth  →  betterAuth
  │                                              └─ prismaAdapter(PrismaService)
  └─ GET /health (@AllowAnonymous)  →  AppController
PrismaService (PrismaPg)  →  Neon PostgreSQL
```

---

## Explicitly not implemented (next steps later)

- Google OAuth credentials / UI
- R2, Railway, Docker
- Diary / Workspace models
- Realtime
- Custom JWT auth
- Password-reset email service
- Email verification provider

---

## Suggested next step

Add Google OAuth to Better Auth (`socialProviders.google`) and verify account linking against an existing email/password Alice Nook account.
