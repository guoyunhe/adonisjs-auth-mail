import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Minimal shape of the ace command passed to `configure` */
interface ConfigureCommand {
  createCodemods(): Promise<{
    makeUsingStub(stubsRoot: string, stubPath: string, data: Record<string, unknown>): Promise<unknown>
    registerMiddleware(
      stack: 'server' | 'router' | 'named',
      middleware: { name: string; path: string }[]
    ): Promise<void>
  }>
}

export const stubsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'stubs')

/**
 * Invoked by `node ace add adonisjs-auth-mail` / `node ace configure adonisjs-auth-mail`.
 */
export async function configure(command: ConfigureCommand) {
  const codemods = await command.createCodemods()
  const timestamp = Date.now()
  const stubs = [
    'config/auth_mail.stub',
    'models/password_reset.stub',
    'validators/password_reset.stub',
    'controllers/email_verification_controller.stub',
    'controllers/password_reset_controller.stub',
    'migrations/add_email_verified_at_to_users_table.stub',
    'migrations/create_password_resets_table.stub',
    'views/mails/email_verification.stub',
    'views/mails/email_verification_text.stub',
    'views/mails/password_reset.stub',
    'views/mails/password_reset_text.stub',
  ]
  for (const stub of stubs) {
    await codemods.makeUsingStub(stubsRoot, stub, { timestamp })
  }

  await codemods.registerMiddleware('named', [
    { name: 'verified', path: 'adonisjs-auth-mail/verified_middleware' },
  ])
}
