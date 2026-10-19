import { createHash } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import config from '@adonisjs/core/services/config'
import encryption from '@adonisjs/core/services/encryption'
import mail from '@adonisjs/mail/services/main'
import { PasswordBrokerStatus } from '../types.js'
import type {
  AuthMailConfig,
  AuthMailServiceUser,
  AuthMailUserModel,
  PasswordResetModel,
  ResetPasswordCredentials,
  ResetPasswordStatus,
  SendResetLinkStatus,
} from '../types.js'
import { LucidPasswordResetStore } from './lucid_password_reset_store.js'

interface PasswordResetService {
  sendResetLink(email: string): Promise<SendResetLinkStatus>
  resetPassword(credentials: ResetPasswordCredentials): Promise<ResetPasswordStatus>
}

let passwordResetService: PasswordResetService

await app.booted(async () => {
  const authMailConfig = config.get<AuthMailConfig>('auth_mail')
  const appUrl = config.get<string>('app.appUrl')
  if (!appUrl) {
    throw new Error('The app.appUrl configuration is required to generate email links')
  }
  const User = await app.importDefault<{ default: AuthMailUserModel }>('#models/user')
  const PasswordReset = await app.importDefault<{ default: PasswordResetModel }>('#models/password_reset')
  const resetStore = new LucidPasswordResetStore(PasswordReset)

  passwordResetService = {
    async sendResetLink(email): Promise<SendResetLinkStatus> {
      const user = await User.findBy('email', email)
      if (!user) return PasswordBrokerStatus.INVALID_USER

      const throttle = authMailConfig.passwordReset.throttle ?? 60
      if (
        throttle > 0 &&
        await resetStore.hasRecent(user.email, new Date(Date.now() - throttle * 1000))
      ) {
        return PasswordBrokerStatus.RESET_THROTTLED
      }

      const { path, template } = authMailConfig.passwordReset
      const expiresIn = authMailConfig.passwordReset.expiresIn ?? '1h'
      const token = encryption.encrypt(
        { userId: String(user.id), binding: user.email },
        { purpose: 'password-reset', expiresIn }
      )
      if (!path.includes(':token')) {
        throw new Error('passwordReset.path must include a :token placeholder')
      }
      const url = new URL(
        path.replace(':token', encodeURIComponent(token)),
        appUrl
      )
      url.searchParams.set('email', user.email)
      await mail.send((message) => {
        message.to(user.email)
        message
          .subject(template.subject)
          .htmlView(template.htmlView, { url: url.toString(), user })
          .textView(template.textView, { url: url.toString(), user })
      })
      await resetStore.create({
        email: user.email,
        token: hashToken(token),
        createdAt: new Date(),
      })
      return PasswordBrokerStatus.RESET_LINK_SENT
    },

    async resetPassword(credentials: ResetPasswordCredentials): Promise<ResetPasswordStatus> {
      const user = await User.findBy('email', credentials.email)
      if (!user) return PasswordBrokerStatus.INVALID_USER

      const payload = encryption.decrypt<{ userId: string; binding: string }>(
        credentials.token,
        'password-reset'
      )
      if (!payload || payload.userId !== String(user.id) || payload.binding !== user.email) {
        return PasswordBrokerStatus.INVALID_TOKEN
      }

      const consumed = await resetStore.consume(
        user.email,
        hashToken(credentials.token)
      )
      if (!consumed) return PasswordBrokerStatus.INVALID_TOKEN

      user.password = credentials.password
      await user.save()
      return PasswordBrokerStatus.PASSWORD_RESET
    },
  }
})

export { passwordResetService as default }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
