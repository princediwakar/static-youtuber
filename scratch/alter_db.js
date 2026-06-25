require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace(
    /[?&]sslmode=(?:prefer|require|verify-ca)(?=\?|&|$)/,
    (m) => m.replace(/(prefer|require|verify-ca)/, 'verify-full')
  ),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE slideshow_jobs ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'story'`);
    console.log('Successfully added format column to slideshow_jobs');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
