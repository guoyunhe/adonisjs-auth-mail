/**
 * Minimal shape of the user (e.g. a Lucid model compatible with
 * @adonisjs/auth) that this package works with.
 */
export interface MailableUser {
  id: string | number
  email: string
  password?: string | null
  emailVerifiedAt?: unknown
  locale?: string
}

/**
 * Minimal shape of the @adonisjs/mail service (`mail.send`).
 */
export interface MailSender {
  send(callback: (message: MailMessage) => void | Promise<void>): Promise<unknown>
}

export interface MailMessage {
  to(address: string): this
  from?(address: string): this
  subject(subject: string): this
  text?(content: string): this
  html?(content: string): this
  textView(template: string, data?: object): this
  htmlView(template: string, data?: object): this
}

/** One row per successfully accepted password reset email (the `password_resets` table). */
export interface PasswordResetRecord {
  userId: string | number
  email: string
  tokenHash: string
  sentAt: Date
  expiresAt: Date
  usedAt: Date | null
}

export interface PasswordResetStore {
  create(record: PasswordResetRecord): Promise<void>
  consume(tokenHash: string, usedAt: Date): Promise<boolean>
}

export interface AuthMailConfig {
  /** Tracks sent password reset emails */
  resetStore?: PasswordResetStore
  /** Secret used to sign tokens, usually `env.get('APP_KEY')` */
  secret: string
  /** Mail service, usually `import mail from '@adonisjs/mail/services/main'` */
  mailer: MailSender
  /** Builds the link sent in the email. Receives the signed token. */
  verificationUrl: (token: string, user: MailableUser) => string
  resetUrl: (token: string, user: MailableUser) => string
  /** Token lifetimes in seconds. Defaults: 24h verification, 1h reset */
  verificationExpiresIn?: number
  resetExpiresIn?: number
  from?: string
  /** Customise email contents, including localization based on user.locale. */
  verificationMessage?: (message: MailMessage, url: string, user: MailableUser) => void
  resetMessage?: (message: MailMessage, url: string, user: MailableUser) => void
}
