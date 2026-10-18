import { DateTime } from 'luxon'

export interface MustVerifyEmailUser {
  hasVerifiedEmail(): boolean
  markEmailAsVerified(): Promise<void>
}

type ModelWithEmailVerifiedAt = {
  emailVerifiedAt: unknown
  save(): Promise<unknown>
}

type ModelConstructor<T> = new (...args: any[]) => T

export function MustVerifyEmail<TBase extends ModelConstructor<ModelWithEmailVerifiedAt>>(Base: TBase) {
  return class extends Base implements MustVerifyEmailUser {
    hasVerifiedEmail() {
      return this.emailVerifiedAt != null
    }

    async markEmailAsVerified() {
      if (this.hasVerifiedEmail()) return
      this.emailVerifiedAt = DateTime.now()
      await this.save()
    }
  }
}
