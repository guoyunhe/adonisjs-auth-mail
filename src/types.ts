/**
 * Minimal shape of the user (e.g. a Lucid model compatible with
 * @adonisjs/auth) that this package works with.
 */
export interface MailableUser {
  id: string | number
  email: string
  password?: string | null
  emailVerifiedAt?: unknown
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
}

/** One row per verification email sent (the `email_verifications` table). */
export interface EmailVerificationRecord {
  userId: string | number
  email: string
  tokenHash: string
  sentAt: Date
  expiresAt: Date
  verifiedAt: Date | null
}

/** Persistence for sent verification messages, e.g. backed by a Lucid model. */
export interface EmailVerificationStore {
  create(record: EmailVerificationRecord): Promise<void>
  markVerified(tokenHash: string, verifiedAt: Date): Promise<void>
}

/** One row per password reset email sent (the `password_resets` table). */
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
  markUsed(tokenHash: string, usedAt: Date): Promise<void>
}

export interface AuthMailConfig {
  /** Tracks sent password reset emails */
  resetStore?: PasswordResetStore
  /** Tracks sent verification emails and their verification status */
  verificationStore?: EmailVerificationStore
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
  /** Customise email contents */
  verificationMessage?: (message: MailMessage, url: string, user: MailableUser) => void
  resetMessage?: (message: MailMessage, url: string, user: MailableUser) => void
}
