import { createHash, randomBytes } from 'node:crypto'
import { createToken, readUserId, verifyToken } from './token.js'
import {
  PasswordBrokerStatus,
  type AuthMailConfig,
  type AuthMailUserProvider,
  type MailSender,
  type MailableUser,
  type ResetLinkCredentials,
  type ResetPasswordCredentials,
  type ResetPasswordStatus,
  type PasswordResetStore,
  type SendResetLinkStatus,
} from './types.js'

/**
 * Email verification and password reset. Users are loaded and persisted via
 * the user provider and callbacks passed to `verifyEmail` / `reset`, so any model used
 * with @adonisjs/auth works.
 */
export class AuthMail<User extends MailableUser = MailableUser> {
  constructor(
    private config: AuthMailConfig,
    private users: AuthMailUserProvider<User>,
    private mailer: MailSender,
    private resetStore?: PasswordResetStore
  ) {}

  async sendVerification(user: User) {
    const expiresIn = this.config.emailVerification.expiresIn ?? 86400
    const token = createToken(this.config.secret, 'verify-email', user.id, user.email, expiresIn)
    if (!this.config.emailVerification.path.includes(':token')) {
      throw new Error('emailVerification.path must include a :token placeholder')
    }
    const path = this.config.emailVerification.path.replace(':token', encodeURIComponent(token))
    const url = new URL(path, this.config.appUrl).toString()
    await this.mailer.send((message) => {
      message.to(user.email)
      message
        .subject(this.config.emailVerification.template.subject)
        .htmlView(this.config.emailVerification.template.htmlView, { url, user })
        .textView(this.config.emailVerification.template.textView, { url, user })
    })
  }

  /** Returns the user, or null when the token is invalid, expired, or the email is already verified. */
  async verifyEmail(
    token: string,
    markEmailAsVerified: (user: User) => Promise<void>
  ): Promise<User | null> {
    const id = readUserId(token, 'verify-email')
    const user = id ? await this.users.findById(id) : null
    if (
      !user ||
      user.emailVerifiedAt ||
      !verifyToken(this.config.secret, 'verify-email', token, user.email)
    ) return null
    await markEmailAsVerified(user)
    return user
  }

  async sendResetLink(credentials: ResetLinkCredentials): Promise<SendResetLinkStatus> {
    const user = await this.users.findByEmail(credentials.email)
    if (!user) return PasswordBrokerStatus.INVALID_USER

    const store = this.getResetStore()
    const throttle = this.config.passwordReset.throttle ?? 60
    if (throttle > 0 && await store.hasRecent(user.email, new Date(Date.now() - throttle * 1000))) {
      return PasswordBrokerStatus.RESET_THROTTLED
    }

    const token = randomBytes(32).toString('hex')
    if (!this.config.passwordReset.path.includes(':token')) {
      throw new Error('passwordReset.path must include a :token placeholder')
    }
    const path = this.config.passwordReset.path.replace(':token', encodeURIComponent(token))
    const url = new URL(path, this.config.appUrl)
    url.searchParams.set('email', user.email)
    await this.mailer.send((message) => {
      message.to(user.email)
      message
        .subject(this.config.passwordReset.template.subject)
        .htmlView(this.config.passwordReset.template.htmlView, { url: url.toString(), user })
        .textView(this.config.passwordReset.template.textView, { url: url.toString(), user })
    })
    await store.create({
      email: user.email,
      token: hashToken(token),
      createdAt: new Date(),
    })
    return PasswordBrokerStatus.RESET_LINK_SENT
  }

  async reset(
    credentials: ResetPasswordCredentials,
    setPassword: (user: User, password: string) => Promise<void>
  ): Promise<ResetPasswordStatus> {
    const user = await this.users.findByEmail(credentials.email)
    if (!user) return PasswordBrokerStatus.INVALID_USER

    const expiresIn = this.config.passwordReset.expiresIn ?? 3600
    const consumed = await this.getResetStore().consume(
      user.email,
      hashToken(credentials.token),
      new Date(Date.now() - expiresIn * 1000)
    )
    if (!consumed) return PasswordBrokerStatus.INVALID_TOKEN

    await setPassword(user, credentials.password)
    return PasswordBrokerStatus.PASSWORD_RESET
  }

  private getResetStore() {
    if (!this.resetStore) {
      throw new Error('Password reset requires a configured password reset model')
    }
    return this.resetStore
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
