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
    const token = createToken(
      this.config.secret,
      'verify-email',
      user.id,
      user.email,
      this.config.verificationExpiresIn ?? 86400
    )
    const url = this.config.verificationUrl(token, user)
    await this.config.mailer.send((message) => {
      message.to(user.email)
      if (this.config.from) message.from?.(this.config.from)
      if (this.config.verificationMessage) return this.config.verificationMessage(message, url, user)
      message.subject('Verify your email address')
      message.text?.(`Verify your email address by visiting: ${url}`)
    })
  }

  /** Returns the verified user, or null when the token is invalid/expired. */
  async verifyEmail(token: string, markVerified: (user: User) => Promise<void>): Promise<User | null> {
    const id = readUserId(token, 'verify-email')
    const user = id ? await this.findUser(id) : null
    if (!user || !verifyToken(this.config.secret, 'verify-email', token, user.email)) return null
    await markVerified(user)
    return user
  }

  /** Sends a reset email. Silently does nothing for unknown users. */
  async sendPasswordReset(email: string, findByEmail: (email: string) => Promise<User | null>) {
    const user = await findByEmail(email)
    if (!user) return
    const token = createToken(
      this.config.secret,
      'reset-password',
      user.id,
      user.password ?? '',
      this.config.resetExpiresIn ?? 3600
    )
    const url = this.config.resetUrl(token, user)
    await this.config.mailer.send((message) => {
      message.to(user.email)
      if (this.config.from) message.from?.(this.config.from)
      if (this.config.resetMessage) return this.config.resetMessage(message, url, user)
      message.subject('Reset your password')
      message.text?.(`Reset your password by visiting: ${url}`)
    })
  }

  /**
   * Tokens are bound to the current password hash, so they are single-use:
   * once `setPassword` stores the new password the token stops working.
   */
  async resetPassword(token: string, setPassword: (user: User) => Promise<void>): Promise<User | null> {
    const id = readUserId(token, 'reset-password')
    const user = id ? await this.findUser(id) : null
    if (!user || !verifyToken(this.config.secret, 'reset-password', token, user.password ?? '')) {
      return null
    }
    await setPassword(user)
    return user
  }
}
