# Deploying UniTrack to Vercel

## Important database warning

Vercel functions are ephemeral. UniTrack's current local SQLite adapter is only suitable for a demo deployment because `/tmp` storage can be cleared and is not shared reliably between function instances. For real student accounts, connect the PostgreSQL repository/runtime before launch.

## Vercel setup

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Import the repository in Vercel.
3. Keep the project root at the repository root. Vercel will use `vercel.json` and `api/index.js`.
4. Set production environment variables in Vercel Project Settings, never in the repository:

   - `NODE_ENV=production`
   - `APP_ORIGIN=https://YOUR_PROJECT.vercel.app` or your custom domain
   - `SESSION_SECRET` with at least 32 random characters
   - `DATABASE_URL` for the managed PostgreSQL instance after the runtime cutover
   - Google, Apple, Resend, and UI data-provider variables from [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)

5. Deploy the project.
6. Verify `https://YOUR_DOMAIN/healthz` returns `{ "status": "ok" }`.
7. Add the exact production OAuth callback URLs to Google and Apple:

   - `https://YOUR_DOMAIN/api/auth/google/callback`
   - `https://YOUR_DOMAIN/api/auth/apple/callback`

8. Configure a custom domain and enforce HTTPS in Vercel.
9. Add an external uptime monitor for `/healthz` and ship structured logs to your monitoring provider.

## Before real launch

Do not put real student data into the SQLite-on-Vercel demo. Complete the PostgreSQL runtime cutover, run migrations and backup verification, configure secrets, obtain the University of Ibadan data agreement, and complete the Nigerian data-protection review first.
