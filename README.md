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

## Database

Copy the stubs in `stubs/` into your app: `add_email_verified_at_to_users_table.stub` adds
`users.email_verified_at` (verification status), and `create_email_verifications_table.stub` +
`email_verification_model.stub` create the `email_verifications` table/model that tracks each sent
message (token hash, sent/expiry/verified timestamps). Pass `verificationStore` (with `create` and
`markVerified`, e.g. backed by that model) in the config to record them.

## Password resets, controllers and config

Additional stubs: `create_password_resets_table.stub` + `password_reset_model.stub` (tracks sent reset
emails via `resetStore`), `email_verification_controller.stub` and `password_reset_controller.stub`
(copy to `app/controllers/`, then register routes), and `config.stub`, to be copied to
`config/auth_mail.ts`. It uses `defineConfig` and wires both stores to the Lucid models.

## Installation

```sh
node ace add adonisjs-auth-mail
```

This copies the config, models, controllers and migrations into your app (see stubs above) and
defines the `APP_URL` and `MAIL_FROM` env variables. Then register routes and run `node ace migration:run`.
