# adonisjs-auth-mail
Email verification and password reset for AdonisJS

Built on `@adonisjs/mail` and `@adonisjs/auth`. Tokens are stateless, HMAC-signed and expire;
password reset tokens are bound to the current password hash, so they are single use.

```ts
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import { AuthMail } from 'adonisjs-auth-mail'

const authMail = new AuthMail(
  {
    secret: env.get('APP_KEY'),
    mailer: mail,
    verificationUrl: (token) => `https://example.com/verify-email/${token}`,
    resetUrl: (token) => `https://example.com/reset-password/${token}`,
  },
  (id) => User.find(id)
)

await authMail.sendVerification(user)
await authMail.verifyEmail(token, async (u) => { u.emailVerifiedAt = DateTime.now(); await u.save() })

await authMail.sendPasswordReset(email, (e) => User.findBy('email', e))
await authMail.resetPassword(token, async (u) => { u.password = newPassword; await u.save() })
```
