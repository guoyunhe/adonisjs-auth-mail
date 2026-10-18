import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { MustVerifyEmailUser } from './must_verify_email.js'

type AuthenticatedHttpContext = HttpContext & {
  auth: {
    authenticate(): Promise<unknown>
  }
}

export default class VerifiedMiddleware {
  async handle({ auth, response }: AuthenticatedHttpContext, next: NextFn) {
    const user: unknown = await auth.authenticate()
    if (!isMustVerifyEmailUser(user)) {
      throw new Error('The authenticated User model must use MustVerifyEmail')
    }
    if (!user.hasVerifiedEmail()) {
      return response.forbidden({ message: 'Email address not verified' })
    }
    await next()
  }
}

function isMustVerifyEmailUser(value: unknown): value is MustVerifyEmailUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    'hasVerifiedEmail' in value &&
    typeof value.hasVerifiedEmail === 'function' &&
    'markEmailAsVerified' in value &&
    typeof value.markEmailAsVerified === 'function'
  )
}
