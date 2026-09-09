# Promo Tracker

## Local Telegram bot setup

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` in `.env`.
4. Apply the database migration with `npm run db:migrate`.
5. Start long polling with `npm run bot`.

The bot fails at startup with a clear error when `TELEGRAM_BOT_TOKEN` is missing.
