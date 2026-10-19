import mail from '@adonisjs/mail/services/main'
import app from '@adonisjs/core/services/app'
import config from '@adonisjs/core/services/config'
import { AuthMail } from '../auth_mail.js'
import type {
  AuthMailConfig,
  AuthMailServiceUser,
  AuthMailUserModel,
  PasswordResetModel,
  PasswordResetStore,
} from '../types.js'
import { LucidPasswordResetStore } from './lucid_password_reset_store.js'

export async function createAuthMail(options: { withPasswordResetStore?: boolean } = {}) {
  const authMailConfig = config.get<AuthMailConfig>('auth_mail')
  const secret = config.get<string>('app.appKey')
  if (!secret) {
    throw new Error('The app.appKey configuration is required to sign email verification tokens')
  }
  const appUrl = config.get<string>('app.url')
  if (!appUrl) {
    throw new Error('The app.url configuration is required to generate email links')
  }
  const User = await app.importDefault<{ default: AuthMailUserModel }>('#models/user')
  let resetStore: PasswordResetStore | undefined
  if (options.withPasswordResetStore) {
    const PasswordReset = await app.importDefault<{ default: PasswordResetModel }>('#models/password_reset')
    resetStore = new LucidPasswordResetStore(PasswordReset)
  }

  return new AuthMail<AuthMailServiceUser>(
    authMailConfig,
    {
      findById: (id) => User.find(id),
      findByEmail: (email) => User.findBy('email', email),
    },
    mail,
    { secret, appUrl },
    resetStore
  )
}
