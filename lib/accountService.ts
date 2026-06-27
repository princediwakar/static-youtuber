// Path: lib/accountService.ts
import { query } from './database';
import crypto from 'crypto';
import { AccountCredentials } from './types';

interface EncryptedAccountRow {
  id: string;
  youtube_channel_id: string;
  google_client_id_encrypted: string;
  google_client_secret_encrypted: string;
  refresh_token_encrypted: string;
  cloudinary_cloud_name_encrypted: string;
  cloudinary_api_key_encrypted: string;
  cloudinary_api_secret_encrypted: string;
}

const algorithm = 'aes-256-gcm';

function getEncryptionKey(): crypto.KeyObject {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required to decrypt account credentials');
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

// Cache to avoid repeated DB hits within a Lambda warm instance
let credentialCache: AccountCredentials | null = null;

export async function getAccountCredentials(accountId: string): Promise<AccountCredentials> {
  if (credentialCache?.id === accountId) return credentialCache;

  const result = await query<EncryptedAccountRow>(
    "SELECT id, youtube_channel_id, google_client_id_encrypted, google_client_secret_encrypted, refresh_token_encrypted, cloudinary_cloud_name_encrypted, cloudinary_api_key_encrypted, cloudinary_api_secret_encrypted FROM accounts WHERE id = $1 AND status = 'active'",
    [accountId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const row = result.rows[0];
  credentialCache = {
    id: row.id,
    youtubeChannelId: row.youtube_channel_id,
    googleClientId: decrypt(row.google_client_id_encrypted),
    googleClientSecret: decrypt(row.google_client_secret_encrypted),
    refreshToken: decrypt(row.refresh_token_encrypted),
    cloudinaryCloudName: decrypt(row.cloudinary_cloud_name_encrypted),
    cloudinaryApiKey: decrypt(row.cloudinary_api_key_encrypted),
    cloudinaryApiSecret: decrypt(row.cloudinary_api_secret_encrypted),
  };

  return credentialCache;
}
