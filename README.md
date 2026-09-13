# Promo Tracker

## Authentication behavior

Protected requests reload the current user, so deactivating an account blocks its existing sessions immediately. Resetting a password changes future login credentials but does not revoke an existing JWT; that session remains valid until its 12-hour expiry unless the account is deactivated.

## Local M4 setup

1. Run `npm install`.
2. Run `npm install --prefix ui`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `REPORT_REMINDER_CHAT_ID`, and a random `AUTH_JWT_SECRET` of at least 32 characters.
4. Apply migrations only when setting up a new database: `npm run db:migrate`.

Start each service in a separate terminal:

```sh
npm run api  # Express API, http://localhost:3000 (override with PORT)
npm run bot  # Telegram long polling
npm run ui   # Admin UI, http://localhost:5173
```

The UI reads SQLite data through the API. It never connects to Prisma or SQLite directly.

The bot fails at startup with a clear error when `TELEGRAM_BOT_TOKEN` is missing.

## Authentication

The Admin UI uses a 12-hour JWT stored in an HttpOnly, SameSite=Lax cookie. There is no public signup. `USER` can view the tracker and update report state; `SUPERUSER` can additionally delete a promo or remove one partner association. Promo deletion also removes its PromoPartner rows but preserves Partner records.

Create users manually (the password prompt is not stored or printed):

```sh
npm run user:create -- admin@example.com SUPERUSER
npm run user:create -- kam@example.com USER
```

## Automatic report reminders

The bot process checks due reminders every minute and sends only to `REPORT_REMINDER_CHAT_ID`. The default schedule is `09:00` in `Europe/Berlin`; override it with `REPORT_REMINDER_TIME` and `REPORT_REMINDER_TIMEZONE`. Weekend reminders move to Monday. Delivery timestamps are persisted per promo partner, with at most two automatic reminders.

Checks:

```sh
npm test
npm run typecheck
npm run ui:test
npm run ui:build
```
