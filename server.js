require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { z } = require('zod');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to at least 32 characters');
}

const databaseFile = process.env.DATABASE_FILE || (process.env.VERCEL ? '/tmp/unitrack.db' : './data/unitrack.db');
const dataDirectory = path.dirname(path.resolve(databaseFile));
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new Database(path.resolve(databaseFile));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS student_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    matric_number TEXT NOT NULL UNIQUE,
    faculty TEXT NOT NULL,
    department TEXT NOT NULL,
    programme TEXT NOT NULL,
    level TEXT NOT NULL,
    academic_session TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    units INTEGER NOT NULL CHECK (units > 0 AND units <= 12),
    lecturer TEXT,
    semester TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
  );
  CREATE TABLE IF NOT EXISTS enrolments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('current', 'completed', 'outstanding')),
    UNIQUE(user_id, course_id)
  );
  CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    academic_session TEXT NOT NULL,
    semester TEXT NOT NULL,
    score REAL CHECK (score >= 0 AND score <= 100),
    grade TEXT,
    grade_point REAL CHECK (grade_point >= 0 AND grade_point <= 5),
    quality_points REAL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    UNIQUE(user_id, consent_type, consent_version)
  );
`);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://ui.edu.ng', 'https://images.unsplash.com', 'https://cdn.simpleicons.org'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 250, standardHeaders: true, legacyHeaders: false }));
app.use((req, res, next) => { const startedAt = Date.now(); res.on('finish', () => console.log(JSON.stringify({ type: 'http_request', method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt, requestId: req.headers['x-request-id'] || crypto.randomUUID() }))); next(); });
app.get('/healthz', (req, res) => {
  try { db.prepare('SELECT 1 AS ok').get(); res.json({ status: 'ok', service: 'unitrack', timestamp: now() }); }
  catch (error) { res.status(503).json({ status: 'error', service: 'unitrack' }); }
});

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const token = () => crypto.randomBytes(32).toString('hex');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const emailSchema = z.string().trim().email().transform(value => value.toLowerCase());
const registrationSchema = z.object({
  email: emailSchema,
  password: z.string().min(12).max(128),
  fullName: z.string().trim().min(2).max(120),
  matricNumber: z.string().trim().min(4).max(32),
  faculty: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(120),
  programme: z.string().trim().min(2).max(160),
  level: z.enum(['100 Level', '200 Level', '300 Level', '400 Level', '500 Level']),
  academicSession: z.string().regex(/^20\d{2}\/20\d{2}$/),
  consent: z.literal(true),
  consentVersion: z.string().min(1).max(32)
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
const resultSchema = z.object({ score: z.number().min(0).max(100), grade: z.string().min(1).max(2), gradePoint: z.number().min(0).max(5) });

function signedOAuthState(provider) {
  const payload = Buffer.from(JSON.stringify({ provider, expiresAt: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyOAuthState(value, provider) {
  if (!value) return false;
  const [payload, signature] = value.split('.');
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload || '').digest('base64url');
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try { const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()); return decoded.provider === provider && decoded.expiresAt > Date.now(); } catch { return false; }
}
async function sendPasswordResetEmail(email, resetToken) {
  const resetUrl = `${process.env.APP_ORIGIN || 'http://localhost:3000'}/reset-password?token=${encodeURIComponent(resetToken)}`;
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    if (!isProduction) { console.log(`[development] Password reset URL for ${email}: ${resetUrl}`); return resetUrl; }
    throw new Error('password_email_not_configured');
  }
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.RESEND_FROM, to: [email], subject: 'Reset your UniTrack password', html: `<p>Reset your UniTrack password within 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p>` }) });
  if (!response.ok) throw new Error('password_email_delivery_failed');
  return null;
}

function sendValidationError(res, error) {
  return res.status(400).json({ error: 'validation_error', details: error.flatten ? error.flatten() : error.message });
}
function audit(userId, action) {
  db.prepare('INSERT INTO audit_log (id, user_id, action, created_at) VALUES (?, ?, ?, ?)').run(id(), userId || null, action, now());
}
function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, profile: user.full_name ? {
    fullName: user.full_name, matricNumber: user.matric_number, faculty: user.faculty,
    department: user.department, programme: user.programme, level: user.level, academicSession: user.academic_session
  } : null };
}
function createSession(userId, res) {
  const raw = token();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(id(), userId, hash(raw), expiresAt, createdAt);
  res.cookie('unitrack_session', raw, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 14 });
}
function getCurrentUser(req) {
  const raw = req.cookies.unitrack_session;
  if (!raw) return null;
  return db.prepare(`SELECT u.id, u.email, u.role, p.full_name, p.matric_number, p.faculty, p.department, p.programme, p.level, p.academic_session
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN student_profiles p ON p.user_id = u.id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`).get(hash(raw), now());
}
function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'authentication_required' });
  req.user = user;
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
function courseData(userId) {
  return db.prepare(`SELECT c.id, c.code, c.title, c.units, c.lecturer, c.semester, e.status,
    r.score, r.grade, r.grade_point AS gradePoint, r.quality_points AS qualityPoints
    FROM enrolments e JOIN courses c ON c.id = e.course_id
    LEFT JOIN results r ON r.course_id = c.id AND r.user_id = e.user_id
    WHERE e.user_id = ? ORDER BY c.code`).all(userId);
}

app.post('/api/auth/register', async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const data = parsed.data;
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(data.email)) return res.status(409).json({ error: 'email_already_registered' });
  if (db.prepare('SELECT user_id FROM student_profiles WHERE matric_number = ?').get(data.matricNumber)) return res.status(409).json({ error: 'matric_number_already_registered' });
  const userId = id();
  const timestamp = now();
  const create = db.transaction(() => {
    db.prepare('INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, data.email, bcrypt.hashSync(data.password, 12), 'student', timestamp, timestamp);
    db.prepare(`INSERT INTO student_profiles (user_id, full_name, matric_number, faculty, department, programme, level, academic_session, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, data.fullName, data.matricNumber, data.faculty, data.department, data.programme, data.level, data.academicSession, timestamp, timestamp);
    db.prepare('INSERT INTO user_consents (id, user_id, consent_type, consent_version, granted_at) VALUES (?, ?, ?, ?, ?)').run(id(), userId, 'privacy_and_terms', data.consentVersion, timestamp);
    audit(userId, 'account.created');
  });
  create();
  createSession(userId, res);
  return res.status(201).json({ user: publicUser(db.prepare(`SELECT u.id, u.email, u.role, p.full_name, p.matric_number, p.faculty, p.department, p.programme, p.level, p.academic_session FROM users u JOIN student_profiles p ON p.user_id = u.id WHERE u.id = ?`).get(userId)) });
});

app.post('/api/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const user = db.prepare('SELECT id, email, role, password_hash FROM users WHERE email = ?').get(parsed.data.email);
  if (!user || !user.password_hash || !bcrypt.compareSync(parsed.data.password, user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  createSession(user.id, res);
  audit(user.id, 'account.login');
  const fullUser = db.prepare(`SELECT u.id, u.email, u.role, p.full_name, p.matric_number, p.faculty, p.department, p.programme, p.level, p.academic_session FROM users u LEFT JOIN student_profiles p ON p.user_id = u.id WHERE u.id = ?`).get(user.id);
  return res.json({ user: publicUser(fullUser) });
});

app.post('/api/auth/logout', (req, res) => {
  const raw = req.cookies.unitrack_session;
  if (raw) db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run(now(), hash(raw));
  res.clearCookie('unitrack_session');
  res.status(204).end();
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post('/api/auth/forgot-password', async (req, res) => {
  const parsed = z.object({ email: emailSchema }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
  if (user) {
    const raw = token();
    db.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(id(), user.id, hash(raw), new Date(Date.now() + 1000 * 60 * 30).toISOString());
    audit(user.id, 'password.reset_requested');
    try { const developmentToken = await sendPasswordResetEmail(parsed.data.email, raw); if (!isProduction) return res.json({ message: 'If the account exists, reset instructions have been created.', developmentToken: developmentToken ? raw : undefined }); } catch (error) { if (isProduction) return res.status(503).json({ error: 'password_recovery_temporarily_unavailable' }); }
  }
  return res.json({ message: 'If the account exists, reset instructions have been sent.' });
});
app.post('/api/auth/reset-password', (req, res) => {
  const parsed = z.object({ token: z.string().min(32), password: z.string().min(12).max(128) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const reset = db.prepare('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(hash(parsed.data.token), now());
  if (!reset) return res.status(400).json({ error: 'invalid_or_expired_reset_token' });
  const update = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(bcrypt.hashSync(parsed.data.password, 12), now(), reset.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now(), reset.id);
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now(), reset.user_id);
    audit(reset.user_id, 'password.reset_completed');
  });
  update();
  res.status(204).end();
});

app.get('/api/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(503).json({ error: 'google_oauth_not_configured' });
  const state = signedOAuthState('google'); const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: `${process.env.APP_ORIGIN}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', access_type: 'offline', state });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
app.get('/api/auth/google/callback', async (req, res) => {
  if (!verifyOAuthState(req.query.state, 'google') || !req.query.code) return res.status(400).json({ error: 'invalid_oauth_state' });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${process.env.APP_ORIGIN}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
  if (!tokenResponse.ok) return res.status(502).json({ error: 'google_token_exchange_failed' });
  const tokens = await tokenResponse.json(); const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) return res.status(502).json({ error: 'google_profile_fetch_failed' });
  const googleProfile = await profileResponse.json(); const user = db.prepare('SELECT id FROM users WHERE email = ?').get(googleProfile.email);
  if (!user) return res.status(409).json({ error: 'social_account_requires_profile_setup', email: googleProfile.email });
  createSession(user.id, res); audit(user.id, 'account.google_login'); return res.redirect('/');
});
app.get('/api/auth/apple', (req, res) => {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) return res.status(503).json({ error: 'apple_oauth_not_configured' });
  const state = signedOAuthState('apple'); const params = new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID, redirect_uri: `${process.env.APP_ORIGIN}/api/auth/apple/callback`, response_type: 'code id_token', response_mode: 'form_post', scope: 'name email', state });
  res.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
});
app.post('/api/auth/apple/callback', async (req, res) => {
  if (!verifyOAuthState(req.body.state, 'apple') || !req.body.code) return res.status(400).json({ error: 'invalid_oauth_state' });
  const { SignJWT, jwtVerify, createRemoteJWKSet } = await import('jose');
  const key = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'); const clientSecret = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID, typ: 'JWT' }).setIssuer(process.env.APPLE_TEAM_ID).setAudience('https://appleid.apple.com').setSubject(process.env.APPLE_CLIENT_ID).setIssuedAt().setExpirationTime('180d').sign(crypto.createPrivateKey(key));
  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID, client_secret: clientSecret, code: req.body.code, grant_type: 'authorization_code', redirect_uri: `${process.env.APP_ORIGIN}/api/auth/apple/callback` }) });
  if (!tokenResponse.ok) return res.status(502).json({ error: 'apple_token_exchange_failed' });
  const tokens = await tokenResponse.json(); const verified = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')), { issuer: 'https://appleid.apple.com', audience: process.env.APPLE_CLIENT_ID }); const email = verified.payload.email;
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email); if (!user) return res.status(409).json({ error: 'social_account_requires_profile_setup', email });
  createSession(user.id, res); audit(user.id, 'account.apple_login'); return res.redirect('/');
});

app.get('/api/student/profile', requireAuth, (req, res) => res.json({ profile: req.user }));
app.get('/api/student/courses', requireAuth, (req, res) => res.json({ courses: courseData(req.user.id) }));
app.get('/api/student/results', requireAuth, (req, res) => res.json({ results: db.prepare(`SELECT r.id, c.code, c.title, c.units, r.academic_session AS academicSession, r.semester, r.score, r.grade, r.grade_point AS gradePoint, r.quality_points AS qualityPoints FROM results r JOIN courses c ON c.id = r.course_id WHERE r.user_id = ? ORDER BY r.academic_session DESC, r.semester`).all(req.user.id) }));
app.post('/api/student/results/:resultId', requireAuth, (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const result = db.prepare('SELECT id FROM results WHERE id = ? AND user_id = ?').get(req.params.resultId, req.user.id);
  if (!result) return res.status(404).json({ error: 'result_not_found' });
  const data = parsed.data;
  db.prepare('UPDATE results SET score = ?, grade = ?, grade_point = ?, quality_points = grade_point * (SELECT units FROM courses WHERE id = results.course_id) WHERE id = ?').run(data.score, data.grade, data.gradePoint, result.id);
  audit(req.user.id, 'result.updated');
  res.status(204).end();
});

app.get('/api/admin/ui-sync/status', requireAuth, requireRole('admin'), (req, res) => res.json({ configured: Boolean(process.env.UI_DATA_API_URL), message: process.env.UI_DATA_API_URL ? 'UI data connector configured.' : 'An authorised University of Ibadan data feed is required before synchronisation can be enabled.' }));
app.post('/api/admin/ui-sync', requireAuth, requireRole('admin'), async (req, res) => {
  if (!process.env.UI_DATA_API_URL || !process.env.UI_DATA_API_TOKEN) return res.status(503).json({ error: 'ui_data_connector_not_configured' });
  const response = await fetch(process.env.UI_DATA_API_URL, { headers: { Authorization: `Bearer ${process.env.UI_DATA_API_TOKEN}`, Accept: 'application/json' } });
  if (!response.ok) return res.status(502).json({ error: 'ui_data_provider_unavailable' });
  audit(req.user.id, 'ui_data.sync_requested');
  res.json({ message: 'Provider response received. Map its authorised schema before importing records.', providerStatus: response.status });
});

app.get('/api/privacy/export', requireAuth, (req, res) => {
  const courses = courseData(req.user.id);
  const results = db.prepare('SELECT * FROM results WHERE user_id = ?').all(req.user.id);
  audit(req.user.id, 'privacy.exported');
  res.json({ exportedAt: now(), user: publicUser(req.user), courses, results });
});
app.delete('/api/privacy/account', requireAuth, (req, res) => {
  const userId = req.user.id;
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.clearCookie('unitrack_session');
  res.status(204).end();
});

const root = path.resolve(__dirname);
function sendAsset(fileName, contentType) {
  return (req, res) => {
    const filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) return res.status(500).json({ error: 'asset_missing', file: fileName });
    return res.type(contentType).send(fs.readFileSync(filePath));
  };
}
app.get('/', sendAsset('index.html', 'html'));
app.get('/styles.css', sendAsset('styles.css', 'css'));
app.get('/app.js', sendAsset('app.js', 'js'));
app.get('/client-integration.js', sendAsset('client-integration.js', 'js'));
app.get('/privacy.html', sendAsset('privacy.html', 'html'));
app.get('/icons/:icon', (req, res) => { if (!/^(google|apple)\.svg$/.test(req.params.icon)) return res.status(404).end(); return sendAsset(`public/icons/${req.params.icon}`, 'svg')(req, res); });
app.use((req, res) => res.status(404).json({ error: 'not_found' }));
if (require.main === module) {
  app.listen(port, () => console.log(`UniTrack listening on http://localhost:${port}`));
  process.on('SIGTERM', () => { db.close(); process.exit(0); });
  process.on('SIGINT', () => { db.close(); process.exit(0); });
} else {
  module.exports = app;
}
