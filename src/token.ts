import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export type TokenPurpose = 'verify-email'

/**
 * Creates a stateless signed token: `<base64url payload>.<signature>`.
 * `binding` ties the token to a value that changes when the token should
 * stop working (the email address, or the password hash for resets).
 */
export function createToken(
  secret: string,
  purpose: TokenPurpose,
  userId: string | number,
  binding: string,
  expiresIn: number
): string {
  const payload = Buffer.from(
    JSON.stringify({ p: purpose, u: String(userId), e: Date.now() + expiresIn * 1000, n: randomUUID() })
  ).toString('base64url')
  return `${payload}.${sign(secret, payload, binding)}`
}

/**
 * Returns the user id embedded in the token (unverified) so the user can be
 * loaded, or null if the token is malformed.
 */
export function readUserId(token: string, purpose: TokenPurpose): string | null {
  const data = parse(token)
  return data && data.p === purpose ? data.u : null
}

/** Verifies signature, purpose, expiry and binding. */
export function verifyToken(
  secret: string,
  purpose: TokenPurpose,
  token: string,
  binding: string
): boolean {
  const data = parse(token)
  if (!data || data.p !== purpose || typeof data.e !== 'number' || data.e < Date.now()) {
    return false
  }
  const [payload, signature] = token.split('.')
  const expected = Buffer.from(sign(secret, payload, binding))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sign(secret: string, payload: string, binding: string) {
  return createHmac('sha256', secret).update(`${payload}.${binding}`).digest('base64url')
}

function parse(token: string): { p: string; u: string; e: number } | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  try {
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  } catch {
    return null
  }
}
