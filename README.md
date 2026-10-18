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

The stubs are organized in `stubs/config/`, `stubs/controllers/`, `stubs/models/` and
`stubs/migrations/`, matching the structure of a typical AdonisJS app.
`stubs/migrations/add_email_verified_at_to_users_table.stub` adds `users.email_verified_at`
(verification status), while `stubs/migrations/create_email_verifications_table.stub` and
`stubs/models/email_verification.stub` create the `email_verifications` table/model that tracks each
sent message (token hash, sent/expiry/verified timestamps). Pass `verificationStore` (with `create`
and `markVerified`, e.g. backed by that model) in the config to record them. Both generated model
stubs extend the schema classes generated from their migrations in `#database/schema`.

## Password resets, controllers and config

`stubs/migrations/create_password_resets_table.stub` and `stubs/models/password_reset.stub` track sent
reset emails via `resetStore`. The controller stubs are in `stubs/controllers/` (then register their
routes), and `stubs/config/auth_mail.stub` is copied to `config/auth_mail.ts`. It uses `defineConfig`
and wires both stores to the Lucid models.

## Prerequisites

This package requires an AdonisJS v7 application with `@adonisjs/auth` and `@adonisjs/mail`
installed and configured. If you have not added them yet, run:

```sh
node ace add @adonisjs/auth
node ace add @adonisjs/mail
```

## Installation

```sh
node ace add adonisjs-auth-mail
```

This copies the config, models, controllers and migrations into your app (see stubs above) and
defines the `APP_URL` and `MAIL_FROM` env variables. Then register routes and run `node ace migration:run`.
Running the migrations generates `database/schema.ts`, which the generated models import.
