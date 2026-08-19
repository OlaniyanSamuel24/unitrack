import Database from 'better-sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config();
const sqliteFile = process.env.SQLITE_FILE || './data/unitrack.db';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sqlite = new Database(sqliteFile, { readonly: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false });
const client = await pool.connect();
const tables = ['users', 'student_profiles', 'courses', 'enrolments', 'results', 'sessions', 'password_reset_tokens', 'audit_log', 'user_consents'];
try {
  await client.query('BEGIN');
  for (const table of tables) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    for (const row of rows) {
      const values = columns.map(column => row[column]);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
      await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
    }
    console.log(`Imported ${rows.length} ${table} rows`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { sqlite.close(); client.release(); await pool.end(); }
