import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { Pool } from 'pg';
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';

function getEncryptionKey(): crypto.KeyObject {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required');
  return crypto.createSecretKey(crypto.scryptSync(secret, 'salt', 32));
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format');
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const accountIds = ['canvas_center', 'canvas_area', 'canvas_base', 'canvas_station', 'clinic_playbook'];
const suffixMap: Record<string, string> = {
  canvas_center: 'CANVAS_CENTER',
  canvas_area: 'CANVAS_AREA',
  canvas_base: 'CANVAS_BASE',
  canvas_station: 'CANVAS_STATION',
  clinic_playbook: 'CLINIC_PLAYBOOK',
};

async function main() {
  const pool = new Pool({
    connectionString: (process.env.DATABASE_URL || '').replace(
      /[?&]sslmode=(?:prefer|require|verify-ca)(?=\?|&|$)/,
      (m) => m.replace(/(prefer|require|verify-ca)/, 'verify-full')
    ),
    ssl: { rejectUnauthorized: false },
  });

  const result = await pool.query(
    `SELECT id, cloudinary_cloud_name_encrypted, cloudinary_api_key_encrypted, cloudinary_api_secret_encrypted
     FROM accounts
     WHERE id = ANY($1) AND status = 'active'`,
    [accountIds]
  );

  if (result.rows.length === 0) {
    console.error('No accounts found');
    await pool.end();
    process.exit(1);
  }

  const envVars: string[] = [];
  for (const row of result.rows) {
    const suffix = suffixMap[row.id];
    if (!suffix) {
      console.warn(`Unknown account id: ${row.id}, skipping`);
      continue;
    }
    const cloudName = decrypt(row.cloudinary_cloud_name_encrypted);
    const apiKey = decrypt(row.cloudinary_api_key_encrypted);
    const apiSecret = decrypt(row.cloudinary_api_secret_encrypted);
    envVars.push(`CLOUDINARY_CLOUD_NAME_${suffix}=${cloudName}`);
    envVars.push(`CLOUDINARY_API_KEY_${suffix}=${apiKey}`);
    envVars.push(`CLOUDINARY_API_SECRET_${suffix}=${apiSecret}`);
    console.log(`Decrypted ${row.id} (${suffix}): cloud_name=${cloudName}`);
  }

  console.log('\nCreating/updating Modal secret cloudinary...\n');
  const { spawnSync } = await import('child_process');
  const args = ['-m', 'modal', 'secret', 'create', '--force', 'cloudinary', ...envVars];
  const out = spawnSync('python3', args, { stdio: 'inherit', shell: false });
  if (out.status !== 0) {
    console.error(`modal secret create exited with code ${out.status}`);
    process.exit(out.status ?? 1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
