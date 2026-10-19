import type { DateTime } from 'luxon'

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

/** One current reset token per email address (the `password_resets` table). */
export interface PasswordResetRecord {
  email: string
  /** SHA-256 hash of the raw token sent to the user */
  token: string
  createdAt: Date
}

export interface PasswordResetStore {
  create(record: PasswordResetRecord): Promise<void>
  hasRecent(email: string, since: Date): Promise<boolean>
  consume(email: string, token: string): Promise<boolean>
}

export interface AuthMailServiceUser extends MailableUser {
  markEmailAsVerified(): Promise<void>
  save(): Promise<unknown>
}

export interface AuthMailUserModel {
  find(id: string): Promise<AuthMailServiceUser | null>
  findBy(field: 'email', email: string): Promise<AuthMailServiceUser | null>
}

export interface PasswordResetModelQuery {
  where(
    column: 'email' | 'token' | 'createdAt',
    operatorOrValue: string | DateTime,
    value?: string | DateTime
  ): PasswordResetModelQuery
  first(): Promise<unknown>
  delete(): Promise<number>
}

export interface PasswordResetModel {
  updateOrCreate(
    search: { email: string },
    update: { token: string; createdAt: DateTime }
  ): Promise<unknown>
  query(): PasswordResetModelQuery
}

export interface MailTemplate {
  /** Subject line used for the message. */
  subject: string

  /** Edge template used to render the HTML body. */
  htmlView: string

  /** Edge template used to render the plain-text body. */
  textView: string
}

export interface EmailVerificationConfig {
  /** Same duration value accepted by AdonisJS encryption, such as `1d`, `12h`, or `5m`. */
  expiresIn?: number | string

  /** Absolute-path URL pattern. It must include the `:token` placeholder. */
  path: string

  /** Subject and Edge views used for the verification email. */
  template: MailTemplate
}

export interface PasswordResetConfig {
  /** Same duration value accepted by AdonisJS encryption, such as `1d`, `12h`, or `5m`. */
  expiresIn?: number | string

  /** Minimum seconds between reset emails to the same address. Defaults to 60. */
  throttle?: number

  /** Absolute-path URL pattern. It must include the `:token` placeholder; email is added as a query parameter. */
  path: string

  /** Subject and Edge views used for the password reset email. */
  template: MailTemplate

  /** Lazily loads the Lucid model used to persist reset tokens. */
  model?: () => Promise<{ default: PasswordResetModel }>
}

export const PasswordBrokerStatus = {
  RESET_LINK_SENT: 'passwords.sent',
  INVALID_USER: 'passwords.user',
  RESET_THROTTLED: 'passwords.throttled',
  PASSWORD_RESET: 'passwords.reset',
  INVALID_TOKEN: 'passwords.token',
} as const

export type SendResetLinkStatus =
  | typeof PasswordBrokerStatus.RESET_LINK_SENT
  | typeof PasswordBrokerStatus.INVALID_USER
  | typeof PasswordBrokerStatus.RESET_THROTTLED

export type ResetPasswordStatus =
  | typeof PasswordBrokerStatus.PASSWORD_RESET
  | typeof PasswordBrokerStatus.INVALID_USER
  | typeof PasswordBrokerStatus.INVALID_TOKEN

export interface ResetLinkCredentials {
  email: string
}

export interface ResetPasswordCredentials extends ResetLinkCredentials {
  token: string
  password: string
}

export interface AuthMailConfig {
  /** Settings for email verification links and messages. */
  emailVerification: EmailVerificationConfig

  /** Settings for password reset links and messages. */
  passwordReset: PasswordResetConfig
}
