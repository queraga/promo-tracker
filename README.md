# Promo Tracker

## Local M4 setup

1. Run `npm install`.
2. Run `npm install --prefix ui`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, and `REPORT_REMINDER_CHAT_ID`.
4. Apply migrations only when setting up a new database: `npm run db:migrate`.

Start each service in a separate terminal:

```sh
npm run api  # Express API, http://localhost:3000 (override with PORT)
npm run bot  # Telegram long polling
npm run ui   # Admin UI, http://localhost:5173
```

The UI reads SQLite data through the API. It never connects to Prisma or SQLite directly.

The bot fails at startup with a clear error when `TELEGRAM_BOT_TOKEN` is missing.

## Automatic report reminders

The bot process checks due reminders every minute and sends only to `REPORT_REMINDER_CHAT_ID`. The default schedule is `09:00` in `Europe/Berlin`; override it with `REPORT_REMINDER_TIME` and `REPORT_REMINDER_TIMEZONE`. Weekend reminders move to Monday. Delivery timestamps are persisted per promo partner, with at most two automatic reminders.

Checks:

```sh
npm test
npm run typecheck
npm run ui:test
npm run ui:build
```
