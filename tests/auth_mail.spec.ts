import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AuthMail } from '../src/index.js'

function setup() {
  const user: any = { id: 1, email: 'a@b.c', password: 'hash1', emailVerifiedAt: null }
  const sent: any[] = []
  const mailer = {
    async send(cb: any) {
      const m: any = { to(a: string) { this.addr = a; return this }, subject(s: string) { this.subj = s; return this }, text(t: string) { this.body = t; return this } }
      await cb(m)
      sent.push(m)
    },
  }
  const am = new AuthMail(
    { secret: 's3cret', mailer, verificationUrl: (t) => `https://x/v/${t}`, resetUrl: (t) => `https://x/r/${t}` },
    async (id) => (String(user.id) === id ? user : null)
  )
  return { user, sent, am }
}
const tokenOf = (body: string) => body.split('/').pop()!

test('email verification', async () => {
  const { user, sent, am } = setup()
  await am.sendVerification(user)
  const token = tokenOf(sent[0].body)
  assert.equal(await am.verifyEmail(token + 'x', async () => {}), null)
  const res = await am.verifyEmail(token, async (u) => { u.emailVerifiedAt = new Date() })
  assert.equal(res, user)
  assert.ok(user.emailVerifiedAt)
})

test('password reset is single use', async () => {
  const { user, sent, am } = setup()
  await am.sendPasswordReset('none@x.y', async () => null)
  assert.equal(sent.length, 0)
  await am.sendPasswordReset(user.email, async () => user)
  const token = tokenOf(sent[0].body)
  assert.ok(await am.resetPassword(token, async (u) => { u.password = 'hash2' }))
  assert.equal(await am.resetPassword(token, async () => {}), null)
})

test('verification store tracks sent messages', async () => {
  const { user, sent } = setup()
  const rows: any[] = []
  const store = {
    async create(r: any) { rows.push(r) },
    async markVerified(h: string, at: Date) { rows.find((r) => r.tokenHash === h).verifiedAt = at },
  }
  const am = new AuthMail(
    { secret: 's', verificationStore: store, mailer: { async send() {} }, verificationUrl: (t) => t, resetUrl: (t) => t },
    async () => user
  )
  await am.sendVerification(user)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].verifiedAt, null)
  assert.equal(sent.length, 0)
})
