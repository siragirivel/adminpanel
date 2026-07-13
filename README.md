# Sirigirvel Documentation

## User manual

If you want the step-by-step operating guide for workshop staff, read:

`USER_MANUAL.md`

For module-wise web UI reference, read:

`MODULE_WISE_UI_DOCUMENTATION.md`

For mobile app UI planning/specification, read:

`MOBILE_APP_UI_DOCUMENTATION.md`

This manual explains:

1. Vehicle registration
2. Quotations
3. Invoices
4. Inventory
5. Spare orders
6. Day book
7. Accounts
8. Logs
9. Profile settings

## Who should read what

1. Workshop staff and operators: `USER_MANUAL.md`
2. Developers and maintainers: project source code and setup files

## Run locally

```bash
npm install
npm run dev
```

Then open:

`http://localhost:3000`

## Auto Notification Mail (Safe Mode)

This project supports automated notification emails via:

`POST /api/notifications/auto-send`

Behavior (IST / Asia-Kolkata):

1. `alerts` - every day
2. `weekly-report` - every Monday
3. `all` - on day 1 of every month
4. All notification sections are included in the digest (low stock, credit due, pickup overdue, open enquiries, service due, weekly transactions)

Safety guardrails:

1. Requires secret auth (`NOTIFICATION_CRON_SECRET` or `CRON_SECRET`)
2. Supports either header `x-notification-cron-secret` or `Authorization: Bearer <secret>`
3. Uses `notification_mail_runs` table to prevent duplicate sends for the same day/type

Setup:

1. Add env vars:
   - `NOTIFICATION_CRON_SECRET` (or `CRON_SECRET` for Vercel Cron)
   - `AUTO_NOTIFICATION_INCLUDE_ADMINS` (`true/false`)
2. Run SQL migration:
   - `scripts/add-notification-mail-runs.sql`
