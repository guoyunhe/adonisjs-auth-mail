import { createHash } from 'node:crypto'
import { createToken, readUserId, verifyToken } from './token.js'
import type { AuthMailConfig, MailableUser } from './types.js'

/**
 * Email verification and password reset. Users are loaded and persisted via
 * the callbacks passed to `verifyEmail` / `resetPassword`, so any model used
 * with @adonisjs/auth works.
 */
export class AuthMail<User extends MailableUser = MailableUser> {
  constructor(
    private config: AuthMailConfig,
    private findUser: (id: string) => Promise<User | null>
  ) {}

  async sendVerification(user: User) {
    const expiresIn = this.config.verificationExpiresIn ?? 86400
    const token = createToken(this.config.secret, 'verify-email', user.id, user.email, expiresIn)
    const url = this.config.verificationUrl(token, user)
    await this.config.mailer.send((message) => {
      message.to(user.email)
      if (this.config.from) message.from?.(this.config.from)
      if (this.config.verificationMessage) return this.config.verificationMessage(message, url, user)
      message.subject('Verify your email address')
      message.text?.(`Verify your email address by visiting: ${url}`)
    })
  }

  /** Returns the user, or null when the token is invalid, expired, or the email is already verified. */
  async verifyEmail(
    token: string,
    markEmailAsVerified: (user: User) => Promise<void>
  ): Promise<User | null> {
    const id = readUserId(token, 'verify-email')
    const user = id ? await this.findUser(id) : null
    if (
      !user ||
      user.emailVerifiedAt ||
      !verifyToken(this.config.secret, 'verify-email', token, user.email)
    ) return null
    await markEmailAsVerified(user)
    return user
  }

  /** Sends a reset email. Silently does nothing for unknown users. */
  async sendPasswordReset(email: string, findByEmail: (email: string) => Promise<User | null>) {
    const user = await findByEmail(email)
    if (!user) return
    const expiresIn = this.config.resetExpiresIn ?? 3600
    const token = createToken(this.config.secret, 'reset-password', user.id, user.password ?? '', expiresIn)
    const url = this.config.resetUrl(token, user)
    await this.config.mailer.send((message) => {
      message.to(user.email)
      if (this.config.from) message.from?.(this.config.from)
      if (this.config.resetMessage) return this.config.resetMessage(message, url, user)
      message.subject('Reset your password')
      message.text?.(`Reset your password by visiting: ${url}`)
    })
    await this.config.resetStore?.create({
      email: user.email,
      tokenHash: hashToken(token),
      createdAt: new Date(),
    })
  }

  /**
   * With a reset store, the token is atomically consumed before `setPassword`
   * runs. Without a store, changing the password hash invalidates the token.
   */
  async resetPassword(token: string, setPassword: (user: User) => Promise<void>): Promise<User | null> {
    const id = readUserId(token, 'reset-password')
    const user = id ? await this.findUser(id) : null
    if (!user || !verifyToken(this.config.secret, 'reset-password', token, user.password ?? '')) {
      return null
    }
    if (this.config.resetStore) {
      const consumed = await this.config.resetStore.consume(hashToken(token))
      if (!consumed) return null
    }
    await setPassword(user)
    return user
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
