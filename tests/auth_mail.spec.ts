import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AuthMail,
  createToken,
  MustVerifyEmail,
  VerifiedMiddleware,
  verifyToken,
} from '../src/index.js'

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

test('tokens are unique for identical inputs', () => {
  const first = createToken('secret', 'reset-password', 1, 'password-hash', 3600)
  const second = createToken('secret', 'reset-password', 1, 'password-hash', 3600)
  assert.notEqual(first, second)
  assert.ok(verifyToken('secret', 'reset-password', first, 'password-hash'))
  assert.ok(verifyToken('secret', 'reset-password', second, 'password-hash'))
})

test('email verification', async () => {
  const { user, sent, am } = setup()
  await am.sendVerification(user)
  const token = tokenOf(sent[0].body)
  assert.equal(await am.verifyEmail(token + 'x', async () => {}), null)
  const res = await am.verifyEmail(token, async (u) => { u.emailVerifiedAt = new Date() })
  assert.equal(res, user)
  assert.ok(user.emailVerifiedAt)
  assert.equal(await am.verifyEmail(token, async () => {}), null)
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

test('reset store keeps one token per email and consumes it once', async () => {
  const { user } = setup()
  const rows: any[] = []
  const sent: any[] = []
  const am = new AuthMail(
    {
      secret: 's',
      mailer: {
        async send(callback: any) {
          const message: any = {
            to() { return this },
            subject() { return this },
            text(body: string) { this.body = body; return this },
          }
          await callback(message)
          sent.push(message)
        },
      },
      verificationUrl: (t) => `https://x/v/${t}`,
      resetUrl: (t) => `https://x/r/${t}`,
      resetStore: {
        async create(r) {
          const index = rows.findIndex((row) => row.email === r.email)
          if (index === -1) rows.push(r)
          else rows[index] = r
        },
        async consume(h) {
          const index = rows.findIndex((row) => row.tokenHash === h)
          if (index === -1) return false
          rows.splice(index, 1)
          return true
        },
      },
    },
    async () => user
  )
  await am.sendPasswordReset(user.email, async () => user)
  const oldToken = tokenOf(sent[0].body)
  await am.sendPasswordReset(user.email, async () => user)
  const token = tokenOf(sent[1].body)
  assert.equal(rows.length, 1)
  assert.deepEqual(Object.keys(rows[0]).sort(), ['createdAt', 'email', 'tokenHash'])
  let resets = 0
  assert.equal(await am.resetPassword(oldToken, async () => { resets++ }), null)
  assert.equal(await am.resetPassword(token, async () => { resets++ }), user)
  assert.equal(await am.resetPassword(token, async () => { resets++ }), null)
  assert.equal(resets, 1)
  assert.equal(rows.length, 0)
})

test('MustVerifyEmail mixin persists verification once', async () => {
  class UserModel {
    emailVerifiedAt: unknown = null
    saves = 0

    async save() {
      this.saves++
    }
  }

  const User = MustVerifyEmail(UserModel)
  const user = new User()
  assert.equal(user.hasVerifiedEmail(), false)
  await user.markEmailAsVerified()
  assert.equal(user.hasVerifiedEmail(), true)
  assert.equal(user.saves, 1)
  await user.markEmailAsVerified()
  assert.equal(user.saves, 1)
})

test('verified middleware blocks unverified users and allows verified users', async () => {
  const middleware = new VerifiedMiddleware()
  const denied = { message: '' }
  let nextCalled = false
  const deniedResponse = await middleware.handle(
    {
      auth: { async authenticate() { return { hasVerifiedEmail: () => false, markEmailAsVerified: async () => {} } } },
      response: { forbidden(body: { message: string }) { denied.message = body.message; return body } },
    } as any,
    async () => { nextCalled = true }
  )
  assert.deepEqual(deniedResponse, { message: 'Email address not verified' })
  assert.equal(nextCalled, false)
  assert.equal(denied.message, 'Email address not verified')

  await middleware.handle(
    {
      auth: { async authenticate() { return { hasVerifiedEmail: () => true, markEmailAsVerified: async () => {} } } },
      response: { forbidden() { throw new Error('Unexpected forbidden response') } },
    } as any,
    async () => { nextCalled = true }
  )
  assert.equal(nextCalled, true)
})

test('propagates mailer failures', async () => {
  const { user } = setup()
  const am = new AuthMail(
    {
      secret: 's',
      mailer: { async send() { throw new Error('mail transport unavailable') } },
      verificationUrl: (token) => token,
      resetUrl: (token) => token,
    },
    async () => user
  )
  await assert.rejects(am.sendVerification(user), /mail transport unavailable/)
})

test('message callbacks can localize mail using the user locale', async () => {
  const { user, sent } = setup()
  user.locale = 'zh-CN'
  const am = new AuthMail(
    {
      secret: 's',
      mailer: {
        async send(callback: any) {
          const message: any = {
            to() { return this },
            subject(subject: string) { this.subjectLine = subject; return this },
            text(body: string) { this.body = body; return this },
          }
          await callback(message)
          sent.push(message)
        },
      },
      verificationUrl: (token) => `https://x/v/${token}`,
      resetUrl: (token) => `https://x/r/${token}`,
      verificationMessage(message, url, currentUser) {
        const chinese = currentUser.locale?.startsWith('zh')
        message.subject(chinese ? '验证邮箱' : 'Verify your email address')
        message.text(`${chinese ? '请访问' : 'Visit'}: ${url}`)
      },
    },
    async () => user
  )
  await am.sendVerification(user)
  assert.equal(sent[0].subjectLine, '验证邮箱')
  assert.match(sent[0].body, /^请访问:/)
})
