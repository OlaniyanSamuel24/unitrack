require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { openDatabase } = require('./lib/db');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const isServerless = Boolean(process.env.VERCEL);
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProduction) throw new Error('SESSION_SECRET must be set to at least 32 characters');
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET missing; using an ephemeral development secret.');
}

let dbPromise;
function db() {
  if (!dbPromise) dbPromise = openDatabase();
  return dbPromise;
}

const CATALOG = [
  { code: 'CSC 401', title: 'Computer Networks', units: 3, lecturer: 'Dr. A. Adebayo', semester: '2025/2026 Harmattan' },
  { code: 'CSC 403', title: 'Software Engineering', units: 3, lecturer: 'Dr. K. Okafor', semester: '2025/2026 Harmattan' },
  { code: 'CSC 405', title: 'Artificial Intelligence', units: 3, lecturer: 'Prof. T. Bello', semester: '2025/2026 Harmattan' },
  { code: 'STA 401', title: 'Statistical Methods', units: 3, lecturer: 'Dr. R. Yusuf', semester: '2025/2026 Harmattan' },
  { code: 'CSC 402', title: 'Operating Systems', units: 3, lecturer: 'Dr. A. James', semester: '2024/2025 Rain' },
  { code: 'CSC 404', title: 'Database Systems', units: 3, lecturer: 'Prof. M. Adeola', semester: '2024/2025 Rain' },
  { code: 'CSC 406', title: 'Human Computer Interaction', units: 3, lecturer: 'Dr. L. Mensah', semester: '2024/2025 Rain' },
  { code: 'GST 401', title: 'Entrepreneurship', units: 2, lecturer: 'Dr. F. Okonkwo', semester: '2024/2025 Rain' },
  { code: 'CSC 411', title: 'Compiler Construction', units: 3, lecturer: 'Prof. S. Adewale', semester: '2025/2026 Harmattan' },
  { code: 'CSC 499', title: 'Final Year Project', units: 6, lecturer: 'Project supervisor', semester: '2025/2026 Session' }
];

app.set('trust proxy', 1);
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
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 250, standardHeaders: true, legacyHeaders: false }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => console.log(JSON.stringify({
    type: 'http_request',
    method: req.method,
    path: req.path,
    status: res.statusCode,
    durationMs: Date.now() - startedAt,
    requestId: req.headers['x-request-id'] || crypto.randomUUID()
  })));
  next();
});

app.get('/healthz', async (req, res) => {
  try {
    await (await db()).health();
    res.json({ status: 'ok', service: 'unitrack', timestamp: now() });
  } catch (error) {
    res.status(503).json({ status: 'error', service: 'unitrack' });
  }
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
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return decoded.provider === provider && decoded.expiresAt > Date.now();
  } catch {
    return false;
  }
}
async function sendPasswordResetEmail(email, resetToken) {
  const resetUrl = `${process.env.APP_ORIGIN || 'http://localhost:3000'}/reset-password?token=${encodeURIComponent(resetToken)}`;
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    if (!isProduction) {
      console.log(`[development] Password reset URL for ${email}: ${resetUrl}`);
      return resetUrl;
    }
    throw new Error('password_email_not_configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [email],
      subject: 'Reset your UniTrack password',
      html: `<p>Reset your UniTrack password within 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p>`
    })
  });
  if (!response.ok) throw new Error('password_email_delivery_failed');
  return null;
}

function sendValidationError(res, error) {
  return res.status(400).json({ error: 'validation_error', details: error.flatten ? error.flatten() : error.message });
}
async function audit(store, userId, action) {
  await store.run('INSERT INTO audit_log (id, user_id, action, created_at) VALUES (?, ?, ?, ?)', id(), userId || null, action, now());
}
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    profile: user.full_name ? {
      fullName: user.full_name,
      matricNumber: user.matric_number,
      faculty: user.faculty,
      department: user.department,
      programme: user.programme,
      level: user.level,
      academicSession: user.academic_session
    } : null
  };
}
function cookieOptions() {
  return { httpOnly: true, secure: isProduction || isServerless, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 14 };
}
async function createSession(store, userId, res) {
  const raw = token();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await store.run('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', id(), userId, hash(raw), expiresAt, createdAt);
  res.cookie('unitrack_session', raw, cookieOptions());
}
async function getCurrentUser(req) {
  const raw = req.cookies.unitrack_session;
  if (!raw) return null;
  const store = await db();
  return store.get(`SELECT u.id, u.email, u.role, p.full_name, p.matric_number, p.faculty, p.department, p.programme, p.level, p.academic_session
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN student_profiles p ON p.user_id = u.id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`, hash(raw), now());
}
async function requireAuth(req, res, next) {
  const user = await getCurrentUser(req);
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
async function courseData(store, userId) {
  return store.all(`SELECT c.id, c.code, c.title, c.units, c.lecturer, c.semester, e.status,
    r.score, r.grade, r.grade_point AS gradePoint, r.quality_points AS qualityPoints
    FROM enrolments e JOIN courses c ON c.id = e.course_id
    LEFT JOIN results r ON r.course_id = c.id AND r.user_id = e.user_id
    WHERE e.user_id = ? ORDER BY c.code`, userId);
}
async function resultData(store, userId) {
  return store.all(`SELECT r.id, c.code, c.title, c.units, r.academic_session AS academicSession, r.semester, r.score, r.grade, r.grade_point AS gradePoint, r.quality_points AS qualityPoints
    FROM results r JOIN courses c ON c.id = r.course_id WHERE r.user_id = ? ORDER BY r.academic_session DESC, r.semester`, userId);
}
function computeStats(courses, results) {
  const graded = results.filter(item => item.gradePoint != null);
  const gradedUnits = graded.reduce((sum, item) => sum + Number(item.units || 0), 0);
  const quality = graded.reduce((sum, item) => sum + Number(item.qualityPoints ?? Number(item.gradePoint) * Number(item.units || 0)), 0);
  const completed = courses.filter(item => item.status === 'completed');
  const current = courses.filter(item => item.status === 'current');
  const outstanding = courses.filter(item => item.status === 'outstanding');
  const creditsCompleted = completed.reduce((sum, item) => sum + Number(item.units || 0), 0);
  const creditsRequired = 150;
  const latestSession = results[0]?.academicSession;
  const latestSemester = results[0]?.semester;
  const semesterRows = results.filter(item => item.academicSession === latestSession && item.semester === latestSemester);
  const semesterUnits = semesterRows.reduce((sum, item) => sum + Number(item.units || 0), 0);
  const semesterQuality = semesterRows.reduce((sum, item) => sum + Number(item.qualityPoints ?? Number(item.gradePoint) * Number(item.units || 0)), 0);
  return {
    cgpa: gradedUnits ? Number((quality / gradedUnits).toFixed(2)) : 0,
    semesterGpa: semesterUnits ? Number((semesterQuality / semesterUnits).toFixed(2)) : 0,
    creditsCompleted,
    creditsRequired,
    progressPercent: Math.min(100, Math.round((creditsCompleted / creditsRequired) * 100)),
    coursesCompleted: completed.length,
    coursesCurrent: current.length,
    coursesOutstanding: outstanding.length,
    coursesTotal: 37
  };
}
async function ensureCatalog(store) {
  const existing = await store.get('SELECT COUNT(*) AS count FROM courses');
  if (Number(existing?.count || 0) > 0) return;
  for (const course of CATALOG) {
    await store.run(
      'INSERT INTO courses (id, code, title, units, lecturer, semester, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id(), course.code, course.title, course.units, course.lecturer, course.semester, 'catalog'
    );
  }
}
async function enrolNewStudent(store, userId) {
  await ensureCatalog(store);
  const courses = await store.all('SELECT id, code, units FROM courses ORDER BY code');
  const currentCodes = new Set(['CSC 401', 'CSC 403', 'CSC 405', 'STA 401', 'CSC 499']);
  const completedCodes = new Set(['CSC 402', 'CSC 404', 'CSC 406', 'GST 401']);
  const sampleGrades = {
    'CSC 402': { score: 78, grade: 'A', gradePoint: 4 },
    'CSC 404': { score: 68, grade: 'B', gradePoint: 3 },
    'CSC 406': { score: 81, grade: 'A', gradePoint: 4 },
    'GST 401': { score: 71, grade: 'A', gradePoint: 4 }
  };
  for (const course of courses) {
    const status = currentCodes.has(course.code) ? 'current' : completedCodes.has(course.code) ? 'completed' : 'outstanding';
    await store.run('INSERT INTO enrolments (id, user_id, course_id, status) VALUES (?, ?, ?, ?)', id(), userId, course.id, status);
    const sample = sampleGrades[course.code];
    if (sample) {
      await store.run(
        'INSERT INTO results (id, user_id, course_id, academic_session, semester, score, grade, grade_point, quality_points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id(), userId, course.id, '2024/2025', 'Rain', sample.score, sample.grade, sample.gradePoint, sample.gradePoint * Number(course.units)
      );
    }
  }
}

app.post('/api/auth/register', async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const data = parsed.data;
  const store = await db();
  if (await store.get('SELECT id FROM users WHERE email = ?', data.email)) return res.status(409).json({ error: 'email_already_registered' });
  if (await store.get('SELECT user_id FROM student_profiles WHERE matric_number = ?', data.matricNumber)) return res.status(409).json({ error: 'matric_number_already_registered' });
  const userId = id();
  const timestamp = now();
  await store.tx(async tx => {
    await tx.run('INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', userId, data.email, bcrypt.hashSync(data.password, 12), 'student', timestamp, timestamp);
    await tx.run(`INSERT INTO student_profiles (user_id, full_name, matric_number, faculty, department, programme, level, academic_session, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, userId, data.fullName, data.matricNumber, data.faculty, data.department, data.programme, data.level, data.academicSession, timestamp, timestamp);
    await tx.run('INSERT INTO user_consents (id, user_id, consent_type, consent_version, granted_at) VALUES (?, ?, ?, ?, ?)', id(), userId, 'privacy_and_terms', data.consentVersion, timestamp);
    await audit(tx, userId, 'account.created');
    await enrolNewStudent(tx, userId);
  });
  await createSession(store, userId, res);
  const created = await store.get(`SELECT u.id, u.email, u.role, p.full_name, p.matric_number, p.faculty, p.department, p.programme, p.level, p.academic_session FROM users u JOIN student_profiles p ON p.user_id = u.id WHERE u.id = ?`, userId);
  return res.status(201).json({ user: publicUser(created) });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const store = await db();
  const user = await store.get('SELECT id, email, role, password_hash FROM users WHERE email = ?', parsed.data.email);
  if (!user || !user.password_hash || !bcrypt.compareSync(parsed.data.password, user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  await createSession(store, user.id, res);
  await audit(store, user.id, 'account.login');
  const fullUser = await store.get(`SELECT u.id, u.email, u.role, p.full_name, p.matric_number, p.faculty, p.department, p.programme, p.level, p.academic_session FROM users u LEFT JOIN student_profiles p ON p.user_id = u.id WHERE u.id = ?`, user.id);
  return res.json({ user: publicUser(fullUser) });
});

app.post('/api/auth/logout', async (req, res) => {
  const raw = req.cookies.unitrack_session;
  const store = await db();
  if (raw) await store.run('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', now(), hash(raw));
  res.clearCookie('unitrack_session', cookieOptions());
  res.status(204).end();
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post('/api/auth/forgot-password', async (req, res) => {
  const parsed = z.object({ email: emailSchema }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const store = await db();
  const user = await store.get('SELECT id FROM users WHERE email = ?', parsed.data.email);
  if (user) {
    const raw = token();
    await store.run('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)', id(), user.id, hash(raw), new Date(Date.now() + 1000 * 60 * 30).toISOString());
    await audit(store, user.id, 'password.reset_requested');
    try {
      const developmentToken = await sendPasswordResetEmail(parsed.data.email, raw);
      if (!isProduction) return res.json({ message: 'If the account exists, reset instructions have been created.', developmentToken: developmentToken ? raw : undefined });
    } catch (error) {
      if (isProduction) return res.status(503).json({ error: 'password_recovery_temporarily_unavailable' });
    }
  }
  return res.json({ message: 'If the account exists, reset instructions have been sent.' });
});
app.post('/api/auth/reset-password', async (req, res) => {
  const parsed = z.object({ token: z.string().min(32), password: z.string().min(12).max(128) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const store = await db();
  const reset = await store.get('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', hash(parsed.data.token), now());
  if (!reset) return res.status(400).json({ error: 'invalid_or_expired_reset_token' });
  await store.tx(async tx => {
    await tx.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', bcrypt.hashSync(parsed.data.password, 12), now(), reset.user_id);
    await tx.run('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', now(), reset.id);
    await tx.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now(), reset.user_id);
    await audit(tx, reset.user_id, 'password.reset_completed');
  });
  res.status(204).end();
});

app.get('/api/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(503).json({ error: 'google_oauth_not_configured' });
  const state = signedOAuthState('google');
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: `${process.env.APP_ORIGIN}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', access_type: 'offline', state });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
app.get('/api/auth/google/callback', async (req, res) => {
  if (!verifyOAuthState(req.query.state, 'google') || !req.query.code) return res.status(400).json({ error: 'invalid_oauth_state' });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${process.env.APP_ORIGIN}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
  if (!tokenResponse.ok) return res.status(502).json({ error: 'google_token_exchange_failed' });
  const tokens = await tokenResponse.json();
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) return res.status(502).json({ error: 'google_profile_fetch_failed' });
  const googleProfile = await profileResponse.json();
  const store = await db();
  const user = await store.get('SELECT id FROM users WHERE email = ?', googleProfile.email);
  if (!user) return res.status(409).json({ error: 'social_account_requires_profile_setup', email: googleProfile.email });
  await createSession(store, user.id, res);
  await audit(store, user.id, 'account.google_login');
  return res.redirect('/');
});
app.get('/api/auth/apple', (req, res) => {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) return res.status(503).json({ error: 'apple_oauth_not_configured' });
  const state = signedOAuthState('apple');
  const params = new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID, redirect_uri: `${process.env.APP_ORIGIN}/api/auth/apple/callback`, response_type: 'code id_token', response_mode: 'form_post', scope: 'name email', state });
  res.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
});
app.post('/api/auth/apple/callback', async (req, res) => {
  if (!verifyOAuthState(req.body.state, 'apple') || !req.body.code) return res.status(400).json({ error: 'invalid_oauth_state' });
  const { SignJWT, jwtVerify, createRemoteJWKSet } = await import('jose');
  const key = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const clientSecret = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID, typ: 'JWT' }).setIssuer(process.env.APPLE_TEAM_ID).setAudience('https://appleid.apple.com').setSubject(process.env.APPLE_CLIENT_ID).setIssuedAt().setExpirationTime('180d').sign(crypto.createPrivateKey(key));
  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID, client_secret: clientSecret, code: req.body.code, grant_type: 'authorization_code', redirect_uri: `${process.env.APP_ORIGIN}/api/auth/apple/callback` }) });
  if (!tokenResponse.ok) return res.status(502).json({ error: 'apple_token_exchange_failed' });
  const tokens = await tokenResponse.json();
  const verified = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')), { issuer: 'https://appleid.apple.com', audience: process.env.APPLE_CLIENT_ID });
  const email = verified.payload.email;
  const store = await db();
  const user = await store.get('SELECT id FROM users WHERE email = ?', email);
  if (!user) return res.status(409).json({ error: 'social_account_requires_profile_setup', email });
  await createSession(store, user.id, res);
  await audit(store, user.id, 'account.apple_login');
  return res.redirect('/');
});

app.get('/api/student/profile', requireAuth, (req, res) => res.json({ profile: req.user }));
app.get('/api/student/courses', requireAuth, async (req, res) => res.json({ courses: await courseData(await db(), req.user.id) }));
app.get('/api/student/results', requireAuth, async (req, res) => res.json({ results: await resultData(await db(), req.user.id) }));
app.get('/api/student/overview', requireAuth, async (req, res) => {
  const store = await db();
  const courses = await courseData(store, req.user.id);
  const results = await resultData(store, req.user.id);
  res.json({ user: publicUser(req.user), courses, results, stats: computeStats(courses, results) });
});
app.post('/api/student/results/:resultId', requireAuth, async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const store = await db();
  const result = await store.get('SELECT id FROM results WHERE id = ? AND user_id = ?', req.params.resultId, req.user.id);
  if (!result) return res.status(404).json({ error: 'result_not_found' });
  const data = parsed.data;
  await store.run('UPDATE results SET score = ?, grade = ?, grade_point = ?, quality_points = grade_point * (SELECT units FROM courses WHERE id = results.course_id) WHERE id = ?', data.score, data.grade, data.gradePoint, result.id);
  await audit(store, req.user.id, 'result.updated');
  res.status(204).end();
});

app.get('/api/admin/ui-sync/status', requireAuth, requireRole('admin'), (req, res) => res.json({ configured: Boolean(process.env.UI_DATA_API_URL), message: process.env.UI_DATA_API_URL ? 'UI data connector configured.' : 'An authorised University of Ibadan data feed is required before synchronisation can be enabled.' }));
app.post('/api/admin/ui-sync', requireAuth, requireRole('admin'), async (req, res) => {
  if (!process.env.UI_DATA_API_URL || !process.env.UI_DATA_API_TOKEN) return res.status(503).json({ error: 'ui_data_connector_not_configured' });
  const response = await fetch(process.env.UI_DATA_API_URL, { headers: { Authorization: `Bearer ${process.env.UI_DATA_API_TOKEN}`, Accept: 'application/json' } });
  if (!response.ok) return res.status(502).json({ error: 'ui_data_provider_unavailable' });
  await audit(await db(), req.user.id, 'ui_data.sync_requested');
  res.json({ message: 'Provider response received. Map its authorised schema before importing records.', providerStatus: response.status });
});

app.get('/api/privacy/export', requireAuth, async (req, res) => {
  const store = await db();
  const courses = await courseData(store, req.user.id);
  const results = await store.all('SELECT * FROM results WHERE user_id = ?', req.user.id);
  await audit(store, req.user.id, 'privacy.exported');
  res.json({ exportedAt: now(), user: publicUser(req.user), courses, results });
});
app.delete('/api/privacy/account', requireAuth, async (req, res) => {
  const store = await db();
  await store.run('DELETE FROM users WHERE id = ?', req.user.id);
  res.clearCookie('unitrack_session', cookieOptions());
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
app.get(['/', '/reset-password'], sendAsset('index.html', 'html'));
app.get('/styles.css', sendAsset('styles.css', 'css'));
app.get('/app.js', sendAsset('app.js', 'js'));
app.get('/client-integration.js', sendAsset('client-integration.js', 'js'));
app.get('/privacy.html', sendAsset('privacy.html', 'html'));
app.get('/manifest.webmanifest', sendAsset('public/manifest.webmanifest', 'application/manifest+json'));
app.get('/favicon.svg', sendAsset('public/favicon.svg', 'svg'));
app.get('/ui-logo.gif', sendAsset('public/ui-logo.gif', 'gif'));
app.get('/icons/:icon', (req, res) => {
  if (!/^(google|apple)\.svg$/.test(req.params.icon)) return res.status(404).end();
  return sendAsset(`public/icons/${req.params.icon}`, 'svg')(req, res);
});
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

async function start() {
  await db();
  app.listen(port, () => console.log(`UniTrack listening on http://localhost:${port}`));
  const shutdown = async () => {
    try { await (await db()).close(); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  start().catch(error => {
    console.error(error);
    process.exit(1);
  });
} else {
  module.exports = app;
}
