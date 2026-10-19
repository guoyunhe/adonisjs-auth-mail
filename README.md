# adonisjs-auth-mail

Email verification and password reset for AdonisJS

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

The command creates these files in your application:

- `config/`
  - `auth_mail.ts`
- `app/`
  - `models/`
    - `password_reset.ts`
  - `validators/`
    - `password_reset.ts`
  - `controllers/`
    - `email_verification_controller.ts`
    - `password_reset_controller.ts`
- `database/`
  - `migrations/`
    - `<timestamp>_add_email_verified_at_to_users_table.ts`
    - `<timestamp>_create_password_resets_table.ts`
- `resources/`
  - `views/`
    - `mails/`
      - `email_verification.edge`
      - `email_verification_text.edge`
      - `password_reset.edge`
      - `password_reset_text.edge`

It also updates these existing files:

- `start/kernel.ts` — registers the `verified` middleware alias

Import email verification and password reset services directly from
`adonisjs-auth-mail/services/email_verification` and
`adonisjs-auth-mail/services/password_reset`. Then register routes and run `node ace migration:run`.
Running the migrations generates `database/schema.ts`, which the generated models import.

### Update the User model

The generated migration adds `users.email_verified_at`. Email verification does not use a separate
token table or model. After applying migrations, add `withEmailVerification` to the existing
`compose` call in your User model:

```ts
// app/models/user.ts
import { UserSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import hash from '@adonisjs/core/services/hash'
import { withEmailVerification } from 'adonisjs-auth-mail'

export default class User extends compose(
  UserSchema,
  withAuthFinder(hash),
  withEmailVerification
) {
  // Keep the rest of your existing User model here.
}
```

If your model already uses other mixins, include `withEmailVerification` in its existing
`compose` call. `hasVerifiedEmail()` checks the persisted timestamp, and `markEmailAsVerified()`
sets it once and saves the user. The generated `verified` middleware is registered in
`start/kernel.ts`; use it after authentication to protect routes.

### Expose verification status to the frontend (optional)

To let the frontend show an email verification reminder, include `emailVerifiedAt` in the user
data returned by your `UserTransformer`. For example, add this field to the object returned by
its `transform` method:

```ts
emailVerifiedAt: user.emailVerifiedAt?.toISO() ?? null,
```

The frontend can show a reminder when this field is `null`:

```ts
if (user.emailVerifiedAt === null) {
  // Show a reminder to verify the email address.
}
```

This field is optional and intended for presentation; continue enforcing access to protected
routes with the `verified` middleware on the server.

Register the generated controller actions in `start/routes.ts`. Route configuration is split by
feature below.

## Email Verification

### Configuration

Edit `emailVerification` in `config/auth_mail.ts`:

| Option | Purpose |
| --- | --- |
| `expiresIn` | Token lifetime (default: `24h`); uses AdonisJS encryption duration formats such as `1d`, `12h`, or `5m`. |
| `path` | URL path of the verification page containing the `:token` placeholder. |
| `template` | Email `subject`, `htmlView`, and `textView`. |

Verification tokens use purpose-bound AdonisJS encryption and the application's `app.appKey`.
The service uses `app.appUrl` to build absolute links. Configure the default mailer and sender in
`config/mail.ts`; these settings are not part of `config/auth_mail.ts`.

### Routes and middleware

Register the generated send and verify actions in `start/routes.ts`. The
`emailVerification.path` points to your application's verification page, not the POST action.
Sending a verification email requires an authenticated user. You may protect routes that require
a verified account with the named `verified` middleware:

```ts
import router from '@adonisjs/core/services/router'
import EmailVerificationController from '#controllers/email_verification_controller'
import EmailVerificationPageController from '#controllers/email_verification_page_controller'
import AccountController from '#controllers/account_controller'
import { middleware } from '#start/kernel'

// Send a verification email to the authenticated user.
router.post('/email/verify/send', [EmailVerificationController, 'send'])
  .use(middleware.auth())

// Render a confirmation screen using your app's frontend (React, Vue, Edge, etc.).
// This GET handler must not verify the email address.
router.get('/email/verification/:token', [EmailVerificationPageController, 'show'])

// Verify the email address only after the user submits the confirmation form.
router.post('/email/verification/:token', [EmailVerificationController, 'verify'])

// Use `verified` middleware to restrict unverified users from creating posts
router.post('/post', [AccountController, 'store'])
  .use([middleware.auth(), middleware.verified()])
```

The package does not generate a confirmation page. Implement `GET /email/verification/:token` using
your application's frontend stack. It should display a confirmation action without changing
verification state, then call `POST /email/verification/:token` only after the user confirms. For
example, a frontend page can use this handler for its confirmation button:

```ts
async function confirmEmailVerification(token: string) {
  const response = await fetch(`/email/verification/${encodeURIComponent(token)}`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Unable to verify email address')
  return response.json()
}
```

This prevents email security scanners that only follow links from verifying an address
automatically. Neither route requires an authenticated session because the encrypted token
identifies and verifies its owner.
`verified` returns 403 for authenticated users without a verified email; customize it to redirect
browser users to your verification notice page if needed.

### Verify email after registration (optional)

```ts
// app/controllers/new_account_controller.ts
import User from '#models/user'
import { signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import UserTransformer from '#transformers/user_transformer'
import emailVerificationService from 'adonisjs-auth-mail/services/email_verification'

export default class NewAccountController {
  async store({ request, serialize }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(signupValidator)

    const user = await User.create({ fullName, email, password })
    const token = await User.accessTokens.create(user)

    void emailVerificationService.sendVerificationLink(user).catch((error) => {
      logger.error({ err: error }, 'Failed to send email verification link')
    })

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }
}
```

The verification email is sent asynchronously and is not awaited, so a mail delivery failure does
not prevent registration from succeeding. The failure is logged; production applications can
instead enqueue the email and retry it using their job system.

## Password Reset

### Configuration

Edit `passwordReset` in `config/auth_mail.ts`:

| Option | Purpose |
| --- | --- |
| `expiresIn` | Token lifetime (default: `1h`); uses AdonisJS encryption duration formats such as `1d`, `12h`, or `5m`. |
| `throttle` | Minimum seconds between reset emails to the same address (default: 60). |
| `path` | URL path of the password reset page containing the `:token` placeholder; the service adds the email query parameter. |
| `template` | Email `subject`, `htmlView`, and `textView`. |

Reset tokens use purpose-bound AdonisJS encryption and the application's `app.appKey`. The service
uses `app.appUrl` to build absolute links, persists token hashes, applies email throttling, and
atomically consumes each token once. Token expiry is enforced by encryption.

### Routes

Register the generated forgot-password and reset actions as public routes. Rate-limit them using
your chosen application or upstream solution (see [Request Rate Limit](#request-rate-limit)).
Also provide a GET page for the password-entry form: the generated email link targets
`/password/reset/:token?email=...`, while the generated controller handles the POST submission.
Keep both `email` and `token` when rendering/submitting the form.

```ts
import router from '@adonisjs/core/services/router'
import PasswordResetController from '#controllers/password_reset_controller'
import PasswordResetPageController from '#controllers/password_reset_page_controller'

router.post('/password/forgot', [PasswordResetController, 'forgot'])
router.get('/password/reset/:token', [PasswordResetPageController, 'show'])
router.post('/password/reset', [PasswordResetController, 'reset'])
```

### Reset form

`PasswordResetPageController` is application-specific; create a form or frontend route that reads
the `token` route parameter and `email` query parameter, then submits `email`, `token` and `password`
to `POST /password/reset`. The reset controller validates the request and updates the user's
password after the token has been atomically consumed.

## Request Rate Limit

Endpoints that send email or change credentials should be rate-limited before being exposed
publicly. You can use an application middleware, an edge service such as Cloudflare, or both.
Configure limits and storage according to your traffic and deployment.

If you use AdonisJS Limiter, install it with:

```sh
node ace add @adonisjs/limiter
```

Then define a middleware in `start/limiter.ts` and attach it to relevant routes:

```ts
// start/limiter.ts
import limiter from '@adonisjs/limiter/services/main'

export const authMailThrottle = limiter.define('auth-mail', (ctx) =>
  limiter.allowRequests(5).every('1 minute').usingKey(ctx.request.ip())
)
```

Apply your chosen rate-limiting solution to public email-verification and password-reset
endpoints. For example, when using the AdonisJS Limiter middleware:

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'
import EmailVerificationController from '#controllers/email_verification_controller'
import EmailVerificationPageController from '#controllers/email_verification_page_controller'
import PasswordResetController from '#controllers/password_reset_controller'
import { authMailThrottle } from '#start/limiter'

router.post('/email/verify/send', [EmailVerificationController, 'send'])
  .use(authMailThrottle)
router.get('/email/verification/:token', [EmailVerificationPageController, 'show'])
  .use(authMailThrottle)
router.post('/email/verification/:token', [EmailVerificationController, 'verify'])
  .use(authMailThrottle)
router.post('/password/forgot', [PasswordResetController, 'forgot'])
  .use(authMailThrottle)
router.post('/password/reset', [PasswordResetController, 'reset'])
  .use(authMailThrottle)
```

If rate limiting is handled by an upstream service such as Cloudflare, configure the equivalent
rules there instead; the application middleware is optional.
