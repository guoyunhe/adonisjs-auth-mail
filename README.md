# adonisjs-auth-mail

Email verification and password reset for AdonisJS

Built on `@adonisjs/mail` and `@adonisjs/auth`. Tokens are HMAC-signed and expire. Verification
state lives on the user model, while password reset tokens are bound to the current password hash
and tracked by the generated reset store.

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
await authMail.verifyEmail(token, (u) => u.markEmailAsVerified())

await authMail.sendPasswordReset(email, (e) => User.findBy('email', e))
await authMail.resetPassword(token, async (u) => { u.password = newPassword; await u.save() })
```

## Database

The stubs are organized in `stubs/config/`, `stubs/controllers/`, `stubs/models/` and
`stubs/migrations/`, matching a typical AdonisJS app. Email verification
does not create a separate token table or model: `stubs/migrations/add_email_verified_at_to_users_table.stub`
adds `users.email_verified_at`, and `MustVerifyEmail` adds the verification behavior to your User
model.

After applying migrations, wrap the User model's existing Lucid base with the mixin:

```ts
import { UserSchema } from '#database/schema'
import { MustVerifyEmail } from 'adonisjs-auth-mail'

export default class User extends MustVerifyEmail(UserSchema) {
  // Keep the rest of your existing User model here.
}
```

If your model already extends another mixin, wrap that base instead. `hasVerifiedEmail()` checks the
persisted timestamp, and `markEmailAsVerified()` sets it once and saves the user. The generated
`verified` middleware is registered in `start/kernel.ts`; use it after authentication to protect
routes.

When upgrading from an earlier stub version, remove the old `verificationStore` and
`EmailVerification` import from `config/auth_mail.ts`. Any previously created `email_verifications`
table is no longer used; drop it with an explicit migration if you want to remove it.

## Password resets, controllers and config

`stubs/migrations/create_password_resets_table.stub` and `stubs/models/password_reset.stub` track sent
reset emails via `resetStore`. The controller stubs are in `stubs/controllers/`, and
`stubs/config/auth_mail.stub` is copied to `config/auth_mail.ts`. It uses `defineConfig` and wires
the reset store to the Lucid model. Password reset records are created only after the mailer accepts
the message; the token is atomically consumed before the password update callback runs.

The default controllers use Vine validation, including an eight-character minimum and a
128-character maximum for reset passwords. Adapt the validator to match your application's password
policy. Message callbacks can provide localized text and HTML; `user.locale` is available when the
user model exposes it:

```ts
verificationMessage(message, url, user) {
  const isChinese = user.locale?.startsWith('zh')
  message.subject(isChinese ? '验证邮箱' : 'Verify your email address')
  message.text(`${isChinese ? '请访问' : 'Visit'}: ${url}`)
  message.html?.(`<p>${isChinese ? '请验证邮箱：' : 'Verify your email:'} <a href="${url}">${url}</a></p>`)
}
```

## Email views

Installation generates English Edge templates for HTML and plain-text versions of both messages:

- `resources/views/mails/verify_email.edge`
- `resources/views/mails/verify_email_text.edge`
- `resources/views/mails/reset_password.edge`
- `resources/views/mails/reset_password_text.edge`

The generated `config/auth_mail.ts` uses `htmlView` and `textView` to render these templates. Edit
them to match your product's wording and design, or use the message callbacks to select localized
templates.

## Prerequisites

This package's generated models, migrations and controllers require an AdonisJS v7
application with Lucid, auth, mail, Edge and Vine installed and configured. If you have not added
them yet, run:

```sh
node ace add @adonisjs/lucid
node ace add @adonisjs/auth
node ace add @adonisjs/mail
node ace add edge
node ace add @vinejs/vine
```

## Installation

```sh
node ace add adonisjs-auth-mail
```

This copies the config, reset model, controllers, migrations and email views into your app, registers
the `verified` middleware alias, and defines `APP_URL` and `MAIL_FROM`. Then register routes and run
`node ace migration:run`.
Running the migrations generates `database/schema.ts`, which the generated models import.

Register the generated controller actions in `start/routes.ts`. Protect verification-email sending
with your app's auth middleware. Since these endpoints can send email or change credentials, add
rate limiting before exposing them publicly:

```sh
node ace add @adonisjs/limiter
```

For example, after configuring a `throttle` middleware in `start/limiter.ts`:

```ts
// start/limiter.ts
import limiter from '@adonisjs/limiter/services/main'

export const authMailThrottle = limiter.define('auth-mail', (ctx) =>
  limiter.allowRequests(5).every('1 minute').usingKey(ctx.request.ip())
)
```

Apply it to the routes:

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'
import EmailVerificationController from '#controllers/email_verification_controller'
import PasswordResetController from '#controllers/password_reset_controller'
import { middleware } from '#start/kernel'
import { authMailThrottle } from '#start/limiter'

router.post('/email/verify/send', [EmailVerificationController, 'send'])
  .use([middleware.auth(), authMailThrottle])
router.get('/email/verify/:token', [EmailVerificationController, 'verify']).use(authMailThrottle)
router.post('/password/forgot', [PasswordResetController, 'forgot']).use(authMailThrottle)
router.post('/password/reset/:token', [PasswordResetController, 'reset']).use(authMailThrottle)
router.get('/account', [AccountController, 'show'])
  .use([middleware.auth(), middleware.verified()])
```

Tune limits per endpoint and deployment, and use the configured limiter store appropriate for your
deployment. The `verified` middleware returns 403 for authenticated users without a verified email;
customize it to redirect browser users to your verification notice page if needed.
