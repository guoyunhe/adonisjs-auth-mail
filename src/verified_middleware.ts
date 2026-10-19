import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { WithEmailVerificationUser } from './with_email_verification.js'

type AuthenticatedHttpContext = HttpContext & {
  auth: {
    authenticate(): Promise<unknown>
  }
}

export default class VerifiedMiddleware {
  async handle({ auth, response }: AuthenticatedHttpContext, next: NextFn) {
    const user: unknown = await auth.authenticate()
    if (!isWithEmailVerificationUser(user)) {
      throw new Error('The authenticated User model must use withEmailVerification')
    }
    if (!user.hasVerifiedEmail()) {
      return response.forbidden({ message: 'Email address not verified' })
    }
    await next()
  }
}

function isWithEmailVerificationUser(value: unknown): value is WithEmailVerificationUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    'hasVerifiedEmail' in value &&
    typeof value.hasVerifiedEmail === 'function' &&
    'markEmailAsVerified' in value &&
    typeof value.markEmailAsVerified === 'function'
  )
}
