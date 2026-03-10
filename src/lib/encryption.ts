/**
 * AES-256-GCM encryption for API keys stored in the database.
 *
 * Format: <keyVersion>:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Key rotation: Set ENCRYPTION_KEY to the new key and ENCRYPTION_KEY_PREVIOUS
 * to the old key. Decryption tries the current key first, then falls back to
 * the previous key. On successful fallback decryption, the caller should
 * re-encrypt with the current key and update the row.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16

interface EncryptionKey {
  version: string
  key: Buffer
}

function getKeys(): { current: EncryptionKey; previous: EncryptionKey | null } {
  const currentHex = process.env.ENCRYPTION_KEY
  if (!currentHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  if (currentHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }

  const previousHex = process.env.ENCRYPTION_KEY_PREVIOUS ?? null

  return {
    current: {
      version: 'v1',
      key: Buffer.from(currentHex, 'hex'),
    },
    previous: previousHex
      ? {
          version: 'v0',
          key: Buffer.from(previousHex, 'hex'),
        }
      : null,
  }
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a string in the format: version:iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const { current } = getKeys()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, current.key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    current.version,
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Tries the current key first; if that fails and a previous key exists,
 * tries the previous key (for key rotation).
 *
 * Returns { plaintext, needsReEncrypt } where needsReEncrypt is true if
 * the previous key was used (caller should re-encrypt and update DB).
 */
export function decrypt(ciphertext: string): {
  plaintext: string
  needsReEncrypt: boolean
} {
  const parts = ciphertext.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format')
  }

  const [, ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const { current, previous } = getKeys()

  // Try current key first
  try {
    const decipher = createDecipheriv(ALGORITHM, current.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    })
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])
    return { plaintext: decrypted.toString('utf8'), needsReEncrypt: false }
  } catch {
    // Current key failed, try previous
  }

  // Try previous key (rotation scenario)
  if (previous) {
    try {
      const decipher = createDecipheriv(ALGORITHM, previous.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      })
      decipher.setAuthTag(authTag)
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ])
      return { plaintext: decrypted.toString('utf8'), needsReEncrypt: true }
    } catch {
      // Previous key also failed
    }
  }

  throw new Error('Failed to decrypt: no valid key found')
}

/**
 * Generate a cryptographically random webhook token (32-char hex = 128 bits).
 */
export function generateWebhookToken(): string {
  return randomBytes(16).toString('hex')
}
