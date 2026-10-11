// src/lib/crypto.ts — AES-256-GCM symmetric encryption for tenant secrets.
//
// Used to encrypt recoverable API credentials (e.g. M-Pesa consumer keys,
// Aevibron API keys) at rest. One-way hashing is NOT appropriate here because
// we must later recover the plaintext to call the provider.
//
// The master key is sourced from MASTER_ENCRYPTION_KEY (32-byte base64 or hex).
// In production this MUST be a KMS-managed key; in this sandbox it falls back
// to a derived dev-only key. The fallback is logged loudly and is NOT safe
// for production use. See SECURITY.md.

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // 96-bit IV recommended for GCM
const TAG_LEN = 16

function masterKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY
  if (raw && raw.length > 0) {
    // Accept either hex or base64 of 32 bytes
    let buf: Buffer | null = null
    if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 64) {
      buf = Buffer.from(raw, 'hex')
    } else {
      try {
        buf = Buffer.from(raw, 'base64')
        if (buf.length !== 32) buf = null
      } catch {
        buf = null
      }
    }
    if (buf && buf.length === 32) return buf
  }
  // Dev-only fallback. NEVER rely on this in production.
  // Derive a deterministic key from a stable salt so the sandbox still works.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MASTER_ENCRYPTION_KEY must be set in production')
  }
  console.warn(
    '[ohwasis.crypto] MASTER_ENCRYPTION_KEY not set — using insecure dev-only key. NOT SAFE FOR PRODUCTION.',
  )
  return crypto.createHash('sha256').update('ohwasis-dev-only-key-DO-NOT-USE-IN-PROD').digest()
}

export interface EncryptedBlob {
  iv: string
  ct: string
  tag: string
}

export function encryptSecret(plaintext: string): string {
  const key = masterKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const blob: EncryptedBlob = {
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  }
  return JSON.stringify(blob)
}

export function decryptSecret(blobStr: string): string {
  let blob: EncryptedBlob
  try {
    blob = JSON.parse(blobStr) as EncryptedBlob
  } catch {
    throw new Error('Invalid encrypted blob')
  }
  const key = masterKey()
  const iv = Buffer.from(blob.iv, 'base64')
  const ct = Buffer.from(blob.ct, 'base64')
  const tag = Buffer.from(blob.tag, 'base64')
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Malformed IV or auth tag')
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

/**
 * Mask a secret for display. Always returns the first 2 + last 2 chars (max),
 * or a fixed number of stars if the secret is too short.
 */
export function maskSecret(secret: string): string {
  if (!secret) return '••••'
  if (secret.length <= 6) return '•'.repeat(Math.min(8, secret.length))
  return `${secret.slice(0, 2)}••••••${secret.slice(-2)}`
}
