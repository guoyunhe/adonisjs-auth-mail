import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setApp } from '@adonisjs/core/services/app'
import { MustVerifyEmail, PasswordBrokerStatus, VerifiedMiddleware } from '../src/index.js'

class TestEncryption {
  private values = new Map<string, { payload: object; purpose?: string; expiresAt?: number }>()
  lastDuration?: string | number

  encrypt(payload: object, options: { expiresIn?: string | number; purpose?: string } = {}) {
    const token = randomUUID()
    const duration = options.expiresIn
    this.lastDuration = duration
    const expiresInMs = typeof duration === 'string' ? parseDuration(duration) : duration
    this.values.set(token, {
      payload,
      purpose: options.purpose,
      expiresAt:
        duration === undefined || duration === 0 || expiresInMs === undefined
          ? undefined
          : Date.now() + expiresInMs,
    })
    return token
  }

  decrypt<T>(token: string, purpose?: string): T | null {
    const value = this.values.get(token)
    if (
      !value ||
      value.purpose !== purpose ||
      (value.expiresAt !== undefined && value.expiresAt <= Date.now())
    ) return null
    return value.payload as T
  }
}

function parseDuration(duration: string) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(duration)
  if (!match) throw new Error(`Unsupported test duration: ${duration}`)
  const unitMs = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as 'ms' | 's' | 'm' | 'h' | 'd'
  ]
  return Number(match[1]) * unitMs
}

const user: any = {
  id: 1,
  email: 'a@b.c',
  password: 'hash1',
  emailVerifiedAt: null,
  async markEmailAsVerified() {
    this.emailVerifiedAt = new Date()
  },
  async save() {},
}
const sent: any[] = []
const rows: any[] = []
const encryption = new TestEncryption()
let mailFailure = false
const mailer = {
  async send(callback: any) {
    if (mailFailure) throw new Error('mail transport unavailable')
    const message: any = {
      to(address: string) { this.address = address; return this },
      subject(subject: string) { this.subjectLine = subject; return this },
      htmlView(view: string, data: any) { this.htmlTemplate = view; this.htmlData = data; return this },
      textView(view: string, data: any) { this.textTemplate = view; this.textData = data; return this },
    }
    await callback(message)
    sent.push(message)
  },
}

const authMailConfig: any = {
  emailVerification: {
    path: '/email/verify/:token',
    template: {
      subject: 'Verify email',
      htmlView: 'verify',
      textView: 'verify-text',
    },
  },
  passwordReset: {
    path: '/password/reset/:token',
    template: {
      subject: 'Reset password',
      htmlView: 'reset',
      textView: 'reset-text',
    },
  },
}

function matches(row: any, conditions: [string, any, any?][]) {
  return conditions.every(([column, operatorOrValue, value]) => {
    if (column === 'createdAt' && operatorOrValue === '>') {
      return row.createdAt.toJSDate() > value.toJSDate()
    }
    return row[column] === operatorOrValue
  })
}

const PasswordReset = {
  async updateOrCreate(search: { email: string }, update: { token: string; createdAt: unknown }) {
    const existing = rows.find((row) => row.email === search.email)
    if (existing) Object.assign(existing, update)
    else rows.push({ ...search, ...update })
  },
  query() {
    const conditions: [string, any, any?][] = []
    const query: any = {
      where(column: string, operatorOrValue: any, value?: any) {
        conditions.push([column, operatorOrValue, value])
        return query
      },
      async first() {
        return rows.find((row) => matches(row, conditions)) ?? null
      },
      async delete() {
        let count = 0
        for (let index = rows.length - 1; index >= 0; index--) {
          if (matches(rows[index], conditions)) {
            rows.splice(index, 1)
            count++
          }
        }
        return count
      },
    }
    return query
  },
}

const User = {
  async find(id: string) {
    return String(user.id) === id ? user : null
  },
  async findBy(field: 'email', email: string) {
    return field === 'email' && user.email === email ? user : null
  },
}

setApp({
  config: {
    get(key: string) {
      if (key === 'auth_mail') return authMailConfig
      if (key === 'app.appUrl') return 'https://x'
      throw new Error(`Unexpected config key: ${key}`)
    },
  },
  container: {
    async make(key: string) {
      if (key === 'encryption') return encryption
      if (key === 'mail.manager') return mailer
      throw new Error(`Unexpected container binding: ${key}`)
    },
  },
  async booted(callback: () => unknown) {
    return callback()
  },
  async importDefault(path: string) {
    if (path === '#models/user') return User
    if (path === '#models/password_reset') return PasswordReset
    throw new Error(`Unexpected import path: ${path}`)
  },
} as any)

const { default: emailVerificationService } = await import('../src/services/email_verification.js')
const { default: passwordResetService } = await import('../src/services/password_reset.js')

function setup(options: { expiresIn?: number | string; throttle?: number } = {}) {
  sent.length = 0
  rows.length = 0
  mailFailure = false
  user.id = 1
  user.email = 'a@b.c'
  user.password = 'hash1'
  user.emailVerifiedAt = null
  authMailConfig.emailVerification = {
    path: '/v/:token',
    template: { subject: 'Verify email', htmlView: 'verify', textView: 'verify-text' },
  }
  authMailConfig.passwordReset = {
    path: '/r/:token',
    template: { subject: 'Reset password', htmlView: 'reset', textView: 'reset-text' },
    ...options,
  }
}

const tokenOf = (url: string) => new URL(url).pathname.split('/').pop()!

test('email verification tokens are unique and purpose-bound', async () => {
  setup()
  await emailVerificationService.sendVerification(user)
  const first = tokenOf(sent[0].textData.url)
  await emailVerificationService.sendVerification(user)
  const second = tokenOf(sent[1].textData.url)
  assert.notEqual(first, second)
  assert.equal(await passwordResetService.resetPassword({
    email: user.email,
    token: first,
    password: 'new password',
  }), PasswordBrokerStatus.INVALID_TOKEN)
})

test('email verification rejects invalid tokens and persists verification once', async () => {
  setup()
  await emailVerificationService.sendVerification(user)
  const token = tokenOf(sent[0].textData.url)
  assert.equal(await emailVerificationService.verifyEmail(`${token}x`), null)
  assert.equal(await emailVerificationService.verifyEmail(token), user)
  assert.ok(user.emailVerifiedAt)
  assert.equal(await emailVerificationService.verifyEmail(token), null)
})

test('email verification accepts encryption duration strings', async () => {
  setup()
  authMailConfig.emailVerification.expiresIn = '5m'
  await emailVerificationService.sendVerification(user)
  assert.equal(encryption.lastDuration, '5m')
})

test('password reset is throttled and single use', async () => {
  setup()
  assert.equal(await passwordResetService.sendResetLink('none@x.y'), PasswordBrokerStatus.INVALID_USER)
  assert.equal(await passwordResetService.sendResetLink(user.email), PasswordBrokerStatus.RESET_LINK_SENT)
  const token = tokenOf(sent[0].textData.url)
  assert.equal(new URL(sent[0].textData.url).searchParams.get('email'), user.email)
  assert.equal(await passwordResetService.sendResetLink(user.email), PasswordBrokerStatus.RESET_THROTTLED)
  assert.equal(sent.length, 1)
  assert.equal(
    await passwordResetService.resetPassword({ email: user.email, token, password: 'new password' }),
    PasswordBrokerStatus.PASSWORD_RESET
  )
  assert.equal(user.password, 'new password')
  assert.equal(
    await passwordResetService.resetPassword({ email: user.email, token, password: 'another password' }),
    PasswordBrokerStatus.INVALID_TOKEN
  )
})

test('password reset token is bound to the user and email', async () => {
  setup()
  await passwordResetService.sendResetLink(user.email)
  const token = tokenOf(sent[0].textData.url)
  user.email = 'changed@b.c'
  assert.equal(
    await passwordResetService.resetPassword({
      email: user.email,
      token,
      password: 'new password',
    }),
    PasswordBrokerStatus.INVALID_TOKEN
  )
})

test('password reset token expires', async () => {
  setup({ expiresIn: '0s', throttle: 0 })
  await passwordResetService.sendResetLink(user.email)
  const token = tokenOf(sent[0].textData.url)
  assert.equal(
    await passwordResetService.resetPassword({ email: user.email, token, password: 'new password' }),
    PasswordBrokerStatus.INVALID_TOKEN
  )
})

test('password reset accepts encryption duration strings', async () => {
  setup({ expiresIn: '12h', throttle: 0 })
  await passwordResetService.sendResetLink(user.email)
  assert.equal(encryption.lastDuration, '12h')
  const token = tokenOf(sent[0].textData.url)
  assert.equal(
    await passwordResetService.resetPassword({ email: user.email, token, password: 'new password' }),
    PasswordBrokerStatus.PASSWORD_RESET
  )
})

test('reset store keeps one token per email and consumes it once', async () => {
  setup({ throttle: 0 })
  await passwordResetService.sendResetLink(user.email)
  const oldToken = tokenOf(sent[0].textData.url)
  await passwordResetService.sendResetLink(user.email)
  const token = tokenOf(sent[1].textData.url)
  assert.equal(rows.length, 1)
  assert.deepEqual(Object.keys(rows[0]).sort(), ['createdAt', 'email', 'token'])
  assert.equal(
    await passwordResetService.resetPassword({
      email: user.email,
      token: oldToken,
      password: 'new password',
    }),
    PasswordBrokerStatus.INVALID_TOKEN
  )
  assert.equal(
    await passwordResetService.resetPassword({
      email: 'other@x.y',
      token,
      password: 'new password',
    }),
    PasswordBrokerStatus.INVALID_USER
  )
  assert.equal(
    await passwordResetService.resetPassword({
      email: user.email,
      token,
      password: 'new password',
    }),
    PasswordBrokerStatus.PASSWORD_RESET
  )
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
  setup()
  mailFailure = true
  await assert.rejects(emailVerificationService.sendVerification(user), /mail transport unavailable/)
})

test('renders configured message templates with user data', async () => {
  setup()
  user.locale = 'zh-CN'
  authMailConfig.emailVerification.template = {
    subject: '验证邮箱',
    htmlView: 'mails/email_verification_zh',
    textView: 'mails/email_verification_zh_text',
  }
  await emailVerificationService.sendVerification(user)
  assert.equal(sent[0].subjectLine, '验证邮箱')
  assert.equal(sent[0].htmlTemplate, 'mails/email_verification_zh')
  assert.equal(sent[0].textTemplate, 'mails/email_verification_zh_text')
  assert.equal(sent[0].htmlData.user, user)
  assert.match(sent[0].textData.url, /^https:\/\/x\/v\//)
})

test('rejects paths without a token placeholder', async () => {
  setup()
  authMailConfig.emailVerification.path = '/verify'
  await assert.rejects(emailVerificationService.sendVerification(user), /:token placeholder/)
})
