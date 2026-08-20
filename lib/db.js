'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SQLITE_SCHEMA = `
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
`;

function toPg(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function sqliteAdapter(database) {
  return {
    dialect: 'sqlite',
    get: (sql, ...params) => Promise.resolve(database.prepare(sql).get(...params)),
    all: (sql, ...params) => Promise.resolve(database.prepare(sql).all(...params)),
    run: (sql, ...params) => {
      database.prepare(sql).run(...params);
      return Promise.resolve();
    },
    tx: async fn => fn(sqliteAdapter(database)),
    health: async () => {
      database.prepare('SELECT 1 AS ok').get();
    },
    close: () => database.close()
  };
}

function postgresAdapter(pool) {
  const bind = client => ({
    dialect: 'postgres',
    get: async (sql, ...params) => {
      const { rows } = await client.query(toPg(sql), params);
      return rows[0];
    },
    all: async (sql, ...params) => {
      const { rows } = await client.query(toPg(sql), params);
      return rows;
    },
    run: async (sql, ...params) => {
      await client.query(toPg(sql), params);
    }
  });
  const base = bind(pool);
  return {
    ...base,
    tx: async fn => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await fn(bind(client));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    health: async () => {
      await pool.query('SELECT 1 AS ok');
    },
    close: () => pool.end()
  };
}

function pgSsl(connectionString) {
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return false;
  return { rejectUnauthorized: process.env.PGSSL_STRICT === 'true' };
}

async function openDatabase() {
  if (process.env.DATABASE_URL) {
    const pg = require('pg');
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.VERCEL ? 1 : 8,
      ssl: pgSsl(process.env.DATABASE_URL)
    });
    const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '001_initial.sql'), 'utf8');
    try { await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'); } catch {}
    await pool.query(migration.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/i, ''));
    return postgresAdapter(pool);
  }

  try {
    const Database = require('better-sqlite3');
    const databaseFile = process.env.DATABASE_FILE || (process.env.VERCEL ? '/tmp/unitrack.db' : path.join(process.cwd(), 'data', 'unitrack.db'));
    fs.mkdirSync(path.dirname(path.resolve(databaseFile)), { recursive: true });
    const database = new Database(path.resolve(databaseFile));
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    database.exec(SQLITE_SCHEMA);
    return sqliteAdapter(database);
  } catch (error) {
    throw new Error('SQLite native bindings are unavailable. Set DATABASE_URL to a PostgreSQL instance (Neon, Supabase, or Vercel Postgres) before deploying to serverless. Original error: ' + error.message);
  }
}

module.exports = { openDatabase };
