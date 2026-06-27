// Path: lib/database.ts
import { Pool, QueryResult, QueryResultRow } from 'pg';

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').replace(
    /[?&]sslmode=(?:prefer|require|verify-ca)(?=\?|&|$)/,
    (m) => m.replace(/(prefer|require|verify-ca)/, 'verify-full')
  ),
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 300000, // 5 min — keep alive through long pipeline steps
});

export async function query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error: any) {
    // Retry once on connection errors — Neon pooler can drop idle connections
    if (error?.code === 'ECONNRESET' || error?.message?.includes('Connection terminated')) {
      console.warn('[DB] Connection lost, retrying...');
      return await pool.query<T>(text, params);
    }
    console.error('[DB] Query failed:', { text, error });
    throw error;
  }
}

export const db = {
  getJob: async (id: string) => {
    const res = await query(
      `SELECT * FROM slideshow_jobs WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  },
  getIncompleteJob: async (accountId: string) => {
    const res = await query(
      `SELECT * FROM slideshow_jobs
       WHERE account_id = $1
         AND status != 'published'
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountId]
    );
    return res.rows[0] ?? null;
  },
  createJob: async (data: { account_id: string, topic: string, niche: string, format_template: string, script: any, status: string, variant?: string }) => {
    const res = await query(
      `INSERT INTO slideshow_jobs (account_id, topic, niche, format_template, script, status, variant)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [data.account_id, data.topic, data.niche, data.format_template, data.script, data.status, data.variant || null]
    );
    return res.rows[0].id;
  },
  updateJob: async (id: string, updates: Record<string, any>) => {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    
    const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    
    await query(
      `UPDATE slideshow_jobs SET ${setClause}, updated_at = NOW() WHERE id = $1`,
      [id, ...values]
    );
  }
};
