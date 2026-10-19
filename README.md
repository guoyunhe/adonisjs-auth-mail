# adonisjs-auth-mail

Email verification and password reset for AdonisJS

Built on `@adonisjs/mail` and `@adonisjs/auth`. Email verification uses expiring HMAC-signed tokens.
Password resets use opaque, one-time tokens whose hashes and creation times are stored in Lucid,
following Laravel's password broker flow.

```ts
import emailVerificationService from 'adonisjs-auth-mail/services/email_verification'
import passwordResetService from 'adonisjs-auth-mail/services/password_reset'

await emailVerificationService.sendVerification(user)
await emailVerificationService.verifyEmail(token)

const linkStatus = await passwordResetService.sendResetLink(email)
const resetStatus = await passwordResetService.resetPassword({ email, token, password: newPassword })
```

These package services read `config/auth_mail.ts` and automatically import `#models/user`, so controllers do
not need to instantiate `AuthMail`, maintain service files, or supply user lookup/password-update
callbacks. The password reset methods return `PasswordBrokerStatus` values corresponding to
Laravel's broker statuses: `passwords.sent`, `passwords.user`, `passwords.throttled`,
`passwords.reset` or `passwords.token`.

## Database

The stubs are organized in `stubs/config/`, `stubs/controllers/`, `stubs/validators/`,
`stubs/models/` and `stubs/migrations/`, matching a typical AdonisJS app. Email verification
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

`stubs/migrations/create_password_resets_table.stub` and `stubs/models/password_reset.stub` back
the package-managed `passwordReset` store. The table keeps only `id`, unique `email`, `token` (the SHA-256 hash) and nullable
`created_at`; each new request replaces the existing token for that email. Expiry and throttling
are checked against `created_at`, and consuming a reset deletes its row. The controller stubs are in `stubs/controllers/`, and
`stubs/config/auth_mail.stub` is copied to `config/auth_mail.ts`. It uses `defineConfig` and wires
the reset service to the Lucid model. The raw token is sent only after the mailer accepts the message;
its hash is persisted, and the token is atomically consumed before the password update runs.

Existing installations keep their already-applied migration unchanged. The new code works with the
extra legacy columns, but removing them from an existing database requires a separate migration.

The default controllers use Vine validation, including an eight-character minimum and a
128-character maximum for reset passwords. Adapt the validator to match your application's password
policy. The configured Edge templates receive both `url` and `user`, so they can localize messages
using `user.locale`.

## Email views

Installation generates English Edge templates for HTML and plain-text versions of both messages:

- `resources/views/mails/verify_email.edge`
- `resources/views/mails/verify_email_text.edge`
- `resources/views/mails/reset_password.edge`
- `resources/views/mails/reset_password_text.edge`

The generated `config/auth_mail.ts` uses `htmlView` and `textView` to render these templates. Edit
them to match your product's wording and design, or select localized templates through the
`emailVerification.template` and `passwordReset.template` paths.

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

This copies the config, reset model, controllers, password validators, migrations and email views
into your app, registers the `verified` middleware alias, and defines `APP_URL`.
Import email verification and password reset services directly from
`adonisjs-auth-mail/services/email_verification` and
`adonisjs-auth-mail/services/password_reset`. Then register routes and run `node ace migration:run`.
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

Use the limiter on public endpoints that send mail or change credentials. Route configuration is
split by feature below.

Tune limits per endpoint and deployment, and use the configured limiter store appropriate for your
deployment.

## Email Verification

### Configuration

Edit `emailVerification` in `config/auth_mail.ts`:

| Option | Purpose |
| --- | --- |
| `expiresIn` | Token lifetime (default: `24h`); uses AdonisJS encryption duration formats such as `1d`, `12h`, or `5m`. |
| `path` | Verification URL path containing the `:token` placeholder. |
| `template` | Email `subject`, `htmlView`, and `textView`. |

Verification tokens use purpose-bound AdonisJS encryption and the application's `app.appKey`.
The service uses `app.appUrl` to build absolute links. Configure the default mailer and sender in
`config/mail.ts`; these settings are not part of `config/auth_mail.ts`.

### Routes and middleware

Register the generated send and verify actions in `start/routes.ts`. Sending a verification email
requires an authenticated user; the link target from `emailVerification.path` must resolve to the
verification action. You may protect routes that require a verified account with the named
`verified` middleware:

```ts
import router from '@adonisjs/core/services/router'
import EmailVerificationController from '#controllers/email_verification_controller'
import AccountController from '#controllers/account_controller'
import { middleware } from '#start/kernel'
import { authMailThrottle } from '#start/limiter'

router.post('/email/verify/send', [EmailVerificationController, 'send'])
  .use([middleware.auth(), authMailThrottle])
router.get('/email/verify/:token', [EmailVerificationController, 'verify'])
  .use(authMailThrottle)

router.get('/account', [AccountController, 'show'])
  .use([middleware.auth(), middleware.verified()])
```

The generated verification URL is `GET /email/verify/:token`. The verification route does not
require an authenticated session because the encrypted token identifies and verifies its owner.
`verified` returns 403 for authenticated users without a verified email; customize it to redirect
browser users to your verification notice page if needed.

## Password Reset

### Configuration

Edit `passwordReset` in `config/auth_mail.ts`:

| Option | Purpose |
| --- | --- |
| `expiresIn` | Token lifetime (default: `1h`); uses AdonisJS encryption duration formats such as `1d`, `12h`, or `5m`. |
| `throttle` | Minimum seconds between reset emails to the same address (default: 60). |
| `path` | Reset URL path containing the `:token` placeholder; the service adds the email query parameter. |
| `template` | Email `subject`, `htmlView`, and `textView`. |

Reset tokens use purpose-bound AdonisJS encryption and the application's `app.appKey`. The service
uses `app.appUrl` to build absolute links, persists token hashes, applies email throttling, and
atomically consumes each token once. Token expiry is enforced by encryption.

### Routes

Register the generated forgot-password and reset actions as public routes protected by a rate
limiter. Also provide a GET page for the password-entry form: the generated email link targets
`/password/reset/:token?email=...`, while the generated controller handles the POST submission.
Keep both `email` and `token` when rendering/submitting the form.

```ts
import router from '@adonisjs/core/services/router'
import PasswordResetController from '#controllers/password_reset_controller'
import PasswordResetPageController from '#controllers/password_reset_page_controller'
import { authMailThrottle } from '#start/limiter'

router.post('/password/forgot', [PasswordResetController, 'forgot'])
  .use(authMailThrottle)
router.get('/password/reset/:token', [PasswordResetPageController, 'show'])
  .use(authMailThrottle)
router.post('/password/reset', [PasswordResetController, 'reset'])
  .use(authMailThrottle)
```

### Reset form

`PasswordResetPageController` is application-specific; create a form or frontend route that reads
the `token` route parameter and `email` query parameter, then submits `email`, `token` and `password`
to `POST /password/reset`. The reset controller validates the request and updates the user's
password after the token has been atomically consumed.
