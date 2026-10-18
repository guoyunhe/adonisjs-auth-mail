import app from '@adonisjs/core/services/app'
import { createAuthMail } from './create_auth_mail.js'
import type { AuthMailServiceUser } from '../types.js'

interface EmailVerificationService {
  sendVerification(user: AuthMailServiceUser): Promise<void>
  verifyEmail(token: string): Promise<AuthMailServiceUser | null>
}

let emailVerificationService: EmailVerificationService

await app.booted(async () => {
  const authMail = await createAuthMail()
  emailVerificationService = {
    sendVerification(user) {
      return authMail.sendVerification(user)
    },

    verifyEmail(token) {
      return authMail.verifyEmail(token, (user) => user.markEmailAsVerified())
    },
  }
})

export { emailVerificationService as default }
