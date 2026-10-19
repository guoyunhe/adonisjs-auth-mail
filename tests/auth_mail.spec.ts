import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AuthMail,
  createToken,
  MustVerifyEmail,
  PasswordBrokerStatus,
  VerifiedMiddleware,
  verifyToken,
} from '../src/index.js'

function setup(options: { expiresIn?: number; throttle?: number } = {}) {
  const user: any = { id: 1, email: 'a@b.c', password: 'hash1', emailVerifiedAt: null }
  const sent: any[] = []
  const rows: any[] = []
  const mailer = {
    async send(cb: any) {
      const m: any = {
        to(a: string) { this.addr = a; return this },
        subject(s: string) { this.subj = s; return this },
        htmlView(view: string, data: any) { this.htmlTemplate = view; this.data = data; return this },
        textView(view: string, data: any) { this.textTemplate = view; this.body = data.url; return this },
      }
      await cb(m)
      sent.push(m)
    },
  }
  const am = new AuthMail(
    {
      emailVerification: {
        path: '/v/:token',
        template: { subject: 'Verify email', htmlView: 'verify', textView: 'verify-text' },
      },
      passwordReset: {
        path: '/r/:token',
        template: { subject: 'Reset password', htmlView: 'reset', textView: 'reset-text' },
        ...options,
      },
    },
    {
      async findById(id) {
        return String(user.id) === id ? user : null
      },
      async findByEmail(email) {
        return user.email === email ? user : null
      },
    },
    mailer,
    { secret: 's3cret', appUrl: 'https://x' },
    {
      async create(record) {
        const index = rows.findIndex((row) => row.email === record.email)
        if (index === -1) rows.push(record)
        else rows[index] = record
      },
      async hasRecent(email, since) {
        return rows.some((row) => row.email === email && row.createdAt > since)
      },
      async consume(email, token, validSince) {
        const index = rows.findIndex((row) =>
          row.email === email && row.token === token && row.createdAt > validSince
        )
        if (index === -1) return false
        rows.splice(index, 1)
        return true
      },
    }
  )
  return { user, sent, rows, am }
}
const tokenOf = (body: string) => new URL(body).pathname.split('/').pop()!

test('tokens are unique for identical inputs', () => {
  const first = createToken('secret', 'verify-email', 1, 'a@b.c', 3600)
  const second = createToken('secret', 'verify-email', 1, 'a@b.c', 3600)
  assert.notEqual(first, second)
  assert.ok(verifyToken('secret', 'verify-email', first, 'a@b.c'))
  assert.ok(verifyToken('secret', 'verify-email', second, 'a@b.c'))
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
  assert.equal(await am.sendResetLink({ email: 'none@x.y' }), PasswordBrokerStatus.INVALID_USER)
  assert.equal(sent.length, 0)
  assert.equal(await am.sendResetLink({ email: user.email }), PasswordBrokerStatus.RESET_LINK_SENT)
  const token = tokenOf(sent[0].body)
  assert.equal(new URL(sent[0].body).pathname, `/r/${token}`)
  assert.equal(new URL(sent[0].body).searchParams.get('email'), user.email)
  assert.equal(await am.sendResetLink({ email: user.email }), PasswordBrokerStatus.RESET_THROTTLED)
  assert.equal(sent.length, 1)
  assert.equal(
    await am.reset({ email: user.email, token, password: 'new password' }, async (u, password) => {
      u.password = password
    }),
    PasswordBrokerStatus.PASSWORD_RESET
  )
  assert.equal(
    await am.reset({ email: user.email, token, password: 'another password' }, async () => {}),
    PasswordBrokerStatus.INVALID_TOKEN
  )
  assert.equal(user.password, 'new password')
})

test('password reset token expires based on its stored creation time', async () => {
  const { user, sent, am } = setup({ expiresIn: 0, throttle: 0 })
  await am.sendResetLink({ email: user.email })
  const token = tokenOf(sent[0].body)
  assert.equal(
    await am.reset({ email: user.email, token, password: 'new password' }, async () => {}),
    PasswordBrokerStatus.INVALID_TOKEN
  )
})

test('reset store keeps one token per email and consumes it once', async () => {
  const { user } = setup()
  const rows: any[] = []
  const sent: any[] = []
  const am = new AuthMail(
    {
      emailVerification: {
        path: '/v/:token',
        template: { subject: 'Verify', htmlView: 'verify', textView: 'verify-text' },
      },
      passwordReset: {
        path: '/r/:token',
        template: { subject: 'Reset', htmlView: 'reset', textView: 'reset-text' },
        throttle: 0,
      },
    },
    {
      async findById() { return user },
      async findByEmail(email) { return email === user.email ? user : null },
    },
    {
      async send(callback: any) {
        const message: any = {
          to() { return this },
          subject() { return this },
          htmlView() { return this },
          textView(_view: string, data: any) { this.body = data.url; return this },
        }
        await callback(message)
        sent.push(message)
      },
    },
    { secret: 's', appUrl: 'https://x' },
    {
        async create(r) {
          const index = rows.findIndex((row) => row.email === r.email)
          if (index === -1) rows.push(r)
          else rows[index] = r
        },
        async hasRecent() {
          return false
        },
        async consume(email, token, validSince) {
          const index = rows.findIndex((row) =>
            row.email === email && row.token === token && row.createdAt > validSince
          )
          if (index === -1) return false
          rows.splice(index, 1)
          return true
        },
    }
  )
  await am.sendResetLink({ email: user.email })
  const oldToken = tokenOf(sent[0].body)
  await am.sendResetLink({ email: user.email })
  const token = tokenOf(sent[1].body)
  assert.equal(rows.length, 1)
  assert.deepEqual(Object.keys(rows[0]).sort(), ['createdAt', 'email', 'token'])
  const credentials = { email: user.email, password: 'new password' }
  assert.equal(
    await am.reset({ ...credentials, token: oldToken }, async () => {}),
    PasswordBrokerStatus.INVALID_TOKEN
  )
  assert.equal(
    await am.reset({ ...credentials, email: 'other@x.y', token }, async () => {}),
    PasswordBrokerStatus.INVALID_USER
  )
  let resets = 0
  assert.equal(
    await am.reset({ ...credentials, token }, async () => { resets++ }),
    PasswordBrokerStatus.PASSWORD_RESET
  )
  assert.equal(
    await am.reset({ ...credentials, token }, async () => { resets++ }),
    PasswordBrokerStatus.INVALID_TOKEN
  )
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
      emailVerification: {
        path: '/verify/:token',
        template: { subject: 'Verify', htmlView: 'verify', textView: 'verify-text' },
      },
      passwordReset: {
        path: '/reset/:token',
        template: { subject: 'Reset', htmlView: 'reset', textView: 'reset-text' },
      },
    },
    {
      async findById(id) { return String(user.id) === id ? user : null },
      async findByEmail(email) { return email === user.email ? user : null },
    },
    { async send() { throw new Error('mail transport unavailable') } },
    { secret: 's', appUrl: 'https://x' }
  )
  await assert.rejects(am.sendVerification(user), /mail transport unavailable/)
})

test('renders configured message templates with user data', async () => {
  const { user, sent } = setup()
  user.locale = 'zh-CN'
  const am = new AuthMail(
    {
      emailVerification: {
        path: '/v/:token',
        template: {
          subject: '验证邮箱',
          htmlView: 'mails/verify_email_zh',
          textView: 'mails/verify_email_zh_text',
        },
      },
      passwordReset: {
        path: '/r/:token',
        template: { subject: 'Reset', htmlView: 'reset', textView: 'reset-text' },
      },
    },
    {
      async findById(id) { return String(user.id) === id ? user : null },
      async findByEmail(email) { return email === user.email ? user : null },
    },
    {
      async send(callback: any) {
        const message: any = {
          to() { return this },
          subject(subject: string) { this.subjectLine = subject; return this },
          htmlView(view: string, data: any) { this.htmlTemplate = view; this.viewData = data; return this },
          textView(view: string, data: any) { this.textTemplate = view; this.body = data.url; return this },
        }
        await callback(message)
        sent.push(message)
      },
    },
    { secret: 's', appUrl: 'https://x' }
  )
  await am.sendVerification(user)
  assert.equal(sent[0].subjectLine, '验证邮箱')
  assert.equal(sent[0].htmlTemplate, 'mails/verify_email_zh')
  assert.equal(sent[0].textTemplate, 'mails/verify_email_zh_text')
  assert.equal(sent[0].viewData.user, user)
  assert.match(sent[0].body, /^https:\/\/x\/v\//)
})
