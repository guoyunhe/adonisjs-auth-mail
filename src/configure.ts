import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Minimal shape of the ace command passed to `configure` */
interface ConfigureCommand {
  createCodemods(): Promise<{
    makeUsingStub(stubsRoot: string, stubPath: string, data: Record<string, unknown>): Promise<unknown>
    defineEnvVariables(vars: Record<string, string | number | boolean>): Promise<void>
    defineEnvValidations(validations: { variables: Record<string, string>; leadingComment?: string }): Promise<void>
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
    'config.stub',
    'email_verification_model.stub',
    'password_reset_model.stub',
    'email_verification_controller.stub',
    'password_reset_controller.stub',
    'add_email_verified_at_to_users_table.stub',
    'create_email_verifications_table.stub',
    'create_password_resets_table.stub',
  ]
  for (const stub of stubs) {
    await codemods.makeUsingStub(stubsRoot, stub, { timestamp })
  }

  await codemods.defineEnvVariables({ APP_URL: 'http://localhost:3333', MAIL_FROM: 'noreply@example.com' })
  await codemods.defineEnvValidations({
    leadingComment: 'Variables for adonisjs-auth-mail',
    variables: { APP_URL: 'Env.schema.string()', MAIL_FROM: 'Env.schema.string()' },
  })
}
