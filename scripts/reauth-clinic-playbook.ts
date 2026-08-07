import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { google } from 'googleapis';
import * as readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Use the existing client ID and secret from the environment
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3000/api/auth/callback/google'; 

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const scopes = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
];

function getEncryptionKey(): crypto.KeyObject {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required to encrypt account credentials');
  return crypto.createSecretKey(crypto.scryptSync(secret, 'salt', 32));
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function main() {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force consent to ensure a refresh token is given
    scope: scopes,
  });

  console.log('1. Open this URL in your browser:\n\n', url, '\n');
  console.log('2. Authorize the application. It will redirect you to a localhost URL (which might show an error, that is fine).');
  console.log("3. Copy the 'code' parameter from the URL in your browser's address bar (everything after ?code= and before any other &).");

  rl.question('\nPaste the code here: ', async (code) => {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        console.error('❌ Error: No refresh token returned. You must authorize the app for the first time or revoke it and try again.');
        rl.close();
        return;
      }

      console.log('\n✅ Successfully fetched the refresh token!');
      
      const encryptedRefreshToken = encrypt(tokens.refresh_token);

      console.log('Updating database for clinic_playbook...');
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
      await pool.query(
        'UPDATE accounts SET refresh_token_encrypted = $1, updated_at = NOW() WHERE id = $2',
        [encryptedRefreshToken, 'clinic_playbook']
      );
      await pool.end();

      console.log('✅ Database updated successfully! You can now publish to the Clinic Playbook channel.');
    } catch (error) {
      console.error('❌ Error getting tokens or updating database:', error);
    } finally {
      rl.close();
    }
  });
}

main().catch(e => {
  console.error(e);
  rl.close();
});
