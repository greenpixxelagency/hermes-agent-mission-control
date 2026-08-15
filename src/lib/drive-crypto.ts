import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const VERSION = 'v1'

function key(): Buffer {
  const value = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
  if (!value) throw new Error('DRIVE_OAUTH_NOT_CONFIGURED')
  let decoded: Buffer
  try { decoded = Buffer.from(value, 'base64url') } catch { throw new Error('DRIVE_OAUTH_KEY_INVALID') }
  if (decoded.length !== 32) throw new Error('DRIVE_OAUTH_KEY_INVALID')
  return decoded
}

export function isDriveOAuthConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY)
}

/** AES-256-GCM envelope. Plaintext never leaves server memory. */
export function encryptDriveCredential(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptDriveCredential<T>(envelope: string): T {
  const [version, ivText, tagText, ciphertextText, extra] = envelope.split('.')
  if (version !== VERSION || !ivText || !tagText || !ciphertextText || extra) throw new Error('DRIVE_CREDENTIAL_INVALID')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivText, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8')) as T
  } catch { throw new Error('DRIVE_CREDENTIAL_INVALID') }
}
