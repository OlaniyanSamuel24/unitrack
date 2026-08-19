# UniTrack production activation

This checklist requires access to external provider consoles and a legal/data-protection owner. Do not put secrets in source control or chat.

## 1. Google OAuth

Create a Google OAuth web application and register:

- Authorized origin: `https://YOUR_DOMAIN`
- Redirect URI: `https://YOUR_DOMAIN/api/auth/google/callback`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_ORIGIN` in the deployment secret manager. The Google button starts `/api/auth/google`; the callback exchanges the code, fetches the verified OpenID profile, and creates a session for an existing UniTrack email.

## 2. Apple Sign in

Create a Sign in with Apple Service ID, configure the return URL:

- `https://YOUR_DOMAIN/api/auth/apple/callback`

Set `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and the Apple private key as `APPLE_PRIVATE_KEY`. The callback is `POST` because Apple uses `form_post`; configure the same URL in the provider console and reverse proxy.

## 3. Resend

Verify the sending domain in Resend, publish its DNS records, then set:

- `RESEND_API_KEY`
- `RESEND_FROM=UniTrack <noreply@YOUR_VERIFIED_DOMAIN>`

Never enable production password recovery without a verified sender and delivery monitoring.

## 4. University of Ibadan data access

Obtain a written data-sharing/API agreement from the University of Ibadan data owner or ICT/academic records authority. The agreement must define student consent, fields, purpose, refresh frequency, retention, correction/deletion, incident notification, and the authorised technical contact. Only then set `UI_DATA_API_URL` and `UI_DATA_API_TOKEN`. The app intentionally does not scrape the public website or invent academic records.

## 5. PostgreSQL

Provision a managed PostgreSQL 16+ instance with TLS, automated backups, point-in-time recovery, restricted network access, and a separate production role. Set `DATABASE_URL`, run `npm run db:migrate`, import the existing SQLite data with `node scripts/import-sqlite.mjs`, compare row counts and sample profiles, and rehearse rollback. The current local server remains SQLite until its repository layer is cut over to the PostgreSQL pool; do not treat the migration files alone as a completed runtime migration.

## 6. Secrets and HTTPS

Use a secret manager such as Azure Key Vault, AWS Secrets Manager, GCP Secret Manager, or the hosting provider's encrypted environment variables. Required secrets include `SESSION_SECRET`, database credentials, OAuth secrets, Apple private key, Resend key, and UI API token. Terminate HTTPS at the load balancer, redirect HTTP to HTTPS, configure HSTS after validation, and set `NODE_ENV=production`.

## 7. Monitoring

Monitor `/healthz` from outside the deployment. Forward structured `http_request` logs to a provider such as Sentry, Datadog, Grafana Cloud, Azure Monitor, or CloudWatch. Add alerts for 5xx rate, auth failures, password-delivery failures, database connectivity, latency, backup age, and certificate expiry. Redact passwords, reset tokens, OAuth codes, cookies, and access tokens from logs.

## 8. Nigerian data-protection review

Before collecting real matric numbers or results, appoint the data controller/processor, confirm the lawful basis and explicit consent copy, publish the final privacy notice, define retention/deletion periods, provide export/correction/deletion channels, document processor contracts and cross-border transfers, and create a breach-response process. Obtain review from the organisation's Nigerian data-protection/legal adviser; this repository cannot provide legal approval.
