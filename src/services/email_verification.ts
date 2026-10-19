import app from '@adonisjs/core/services/app'
import config from '@adonisjs/core/services/config'
import encryption from '@adonisjs/core/services/encryption'
import mail from '@adonisjs/mail/services/main'
import type { AuthMailConfig, AuthMailServiceUser, AuthMailUserModel } from '../types.js'

interface EmailVerificationService {
  sendVerification(user: AuthMailServiceUser): Promise<void>
  verifyEmail(token: string): Promise<AuthMailServiceUser | null>
}

let emailVerificationService: EmailVerificationService

await app.booted(async () => {
  const authMailConfig = config.get<AuthMailConfig>('auth_mail')
  const appUrl = config.get<string>('app.appUrl')
  if (!appUrl) {
    throw new Error('The app.appUrl configuration is required to generate email links')
  }
  const User = await app.importDefault<{ default: AuthMailUserModel }>('#models/user')

  emailVerificationService = {
    async sendVerification(user) {
      const expiresIn = authMailConfig.emailVerification.expiresIn ?? '24h'
      const token = encryption.encrypt(
        { userId: String(user.id), binding: user.email },
        { purpose: 'email-verification', expiresIn }
      )
      const { path, template } = authMailConfig.emailVerification
      if (!path.includes(':token')) {
        throw new Error('emailVerification.path must include a :token placeholder')
      }
      const url = new URL(
        path.replace(':token', encodeURIComponent(token)),
        appUrl
      ).toString()
      await mail.send((message) => {
        message.to(user.email)
        message
          .subject(template.subject)
          .htmlView(template.htmlView, { url, user })
          .textView(template.textView, { url, user })
      })
    },

    async verifyEmail(token) {
      const payload = encryption.decrypt<{ userId: string; binding: string }>(
        token,
        'email-verification'
      )
      if (!payload) return null

      const user = await User.find(payload.userId)
      if (!user || user.emailVerifiedAt || user.email !== payload.binding) return null

      await user.markEmailAsVerified()
      return user
    },
  }
})

export { emailVerificationService as default }
