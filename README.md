# UniTrack

UniTrack is a University of Ibadan student academic management prototype with a production-oriented API foundation.

## Local setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set `SESSION_SECRET` to a random value of at least 32 characters.
4. Install dependencies with `npm install`.
5. Start the app with `npm start`.
6. Open `http://localhost:3000`.

The SQLite database is created at `data/unitrack.db` on first start. The `data/` directory should not be committed.

## API foundation

- `POST /api/auth/register` creates a student account and profile.
- `POST /api/auth/login` creates an httpOnly session cookie.
- `POST /api/auth/logout` revokes the current session.
- `GET /api/auth/me` returns the authenticated user.
- `POST /api/auth/forgot-password` creates a short-lived reset token. In development the token is returned for testing; production must deliver it through a transactional email provider.
- `POST /api/auth/reset-password` consumes a reset token and revokes active sessions.
- `GET /api/student/profile`, `/api/student/courses`, and `/api/student/results` are ownership-protected.
- `GET /api/privacy/export` and `DELETE /api/privacy/account` support data rights workflows.
- `/api/admin/*` requires the `admin` role.
- `/api/admin/ui-sync` requires an authorised UI data API configured through environment variables. It intentionally does not scrape or invent University of Ibadan records.
- Google and Apple buttons start OAuth authorization and validate callback state/tokens when provider credentials are configured.
- Registration requires a versioned privacy/terms consent and stores the consent record.

## Provider configuration

Google and Apple login require registered OAuth applications, exact callback URLs, client credentials, and a token exchange implementation. The API returns a clear configuration error until those values exist; it does not pretend social login is functional.

Before production, add:

- A transactional email provider for password recovery.
- HTTPS and a managed database backup strategy.
- A real University of Ibadan data-sharing agreement or authorised API feed.
- A named data controller, support contact, retention schedule, consent language, and final privacy notice reviewed for Nigeria's applicable data protection requirements.
- A proper admin provisioning workflow. Do not manually change roles in production.
- Automated tests for authentication, ownership, role boundaries, reset-token expiry, and privacy deletion.

## PostgreSQL cutover

`db/migrations/001_initial.sql`, `scripts/migrate.mjs`, `scripts/import-sqlite.mjs`, `scripts/backup.ps1`, and `docker-compose.yml` define the PostgreSQL migration path. Docker is required to run the local Postgres service. The current local API process still uses SQLite for backward-compatible development; the final production cutover must switch the API repository layer to the PostgreSQL pool, run the migration/import, verify backups, and only then deploy the Postgres compose/app stack. Do not point a production `DATABASE_URL` at this build and assume the API has switched databases.

## Production activation checklist

1. Set a managed `DATABASE_URL` and run `npm run db:migrate`.
2. Import existing records with `node scripts/import-sqlite.mjs`, then verify row counts and sample accounts.
3. Configure Google/Apple client IDs, secrets, callback URLs, and Apple signing key.
4. Configure `RESEND_API_KEY` and a verified `RESEND_FROM` domain.
5. Use a secret manager for `SESSION_SECRET`; terminate HTTPS at the load balancer.
6. Add uptime/error monitoring to `/healthz` and retain structured request logs without passwords or tokens.
7. Complete a Nigerian data-protection review with a named data controller, retention schedule, data-subject request process, breach process, and approved consent/privacy copy.

## Security notes

Passwords are hashed with bcrypt. Sessions are stored as SHA-256 token hashes and sent in httpOnly, same-site cookies. Helmet, request-size limits, rate limiting, parameter validation, foreign keys, and audit events are enabled. Add CSRF protection if the deployment uses cross-site state-changing requests or relaxes the same-site cookie policy.
