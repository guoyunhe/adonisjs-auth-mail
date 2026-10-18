import app from '@adonisjs/core/services/app'
import { createAuthMail } from './create_auth_mail.js'
import type { ResetPasswordCredentials, ResetPasswordStatus, SendResetLinkStatus } from '../types.js'

interface PasswordResetService {
  sendResetLink(email: string): Promise<SendResetLinkStatus>
  resetPassword(credentials: ResetPasswordCredentials): Promise<ResetPasswordStatus>
}

let passwordResetService: PasswordResetService

await app.booted(async () => {
  const authMail = await createAuthMail({ withPasswordResetStore: true })
  passwordResetService = {
    sendResetLink(email) {
      return authMail.sendResetLink({ email })
    },

    resetPassword(credentials) {
      return authMail.reset(credentials, async (user, password) => {
        user.password = password
        await user.save()
      })
    },
  }
})

export { passwordResetService as default }
