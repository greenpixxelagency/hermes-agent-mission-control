import { randomBytes, scrypt as nodeScrypt, timingSafeEqual, createHash } from 'crypto'
const COST = 32768
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const KEY_LENGTH = 64

export const normalizeEmail = (value: string) => value.trim().toLowerCase()
export const passwordError = (password: string) => password.length < 12 ? 'Use at least 12 characters.' : null

function scrypt(password: string, salt: Buffer, length: number) {
  return new Promise<Buffer>((resolve, reject) => nodeScrypt(password, salt, length, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived)))
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, key] = stored.split('$')
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !key) return false
  const expected = Buffer.from(key, 'base64url')
  if (Number(n) !== COST || Number(r) !== BLOCK_SIZE || Number(p) !== PARALLELIZATION) return false
  const derived = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length)
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

export const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const createResetToken = () => randomBytes(32).toString('base64url')
