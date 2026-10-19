import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { configure, stubsRoot } from '../src/index.js'

test('configure generates all stubs and env', async () => {
  const made: string[] = []
  const middleware: { stack: string; name: string; path: string }[] = []
  let envVariables: Record<string, string | number | boolean> = {}
  let envValidations: Record<string, string> = {}
  await configure({
    async createCodemods() {
      return {
        async makeUsingStub(_root: string, stub: string) { made.push(stub) },
        async defineEnvVariables(variables) { envVariables = variables },
        async defineEnvValidations({ variables }) { envValidations = variables },
        async registerMiddleware(stack, entries) {
          for (const entry of entries) middleware.push({ stack, ...entry })
        },
      }
    },
  })
  assert.equal(made.length, 11)
  assert.deepEqual(envVariables, { APP_URL: 'http://localhost:3333' })
  assert.deepEqual(envValidations, { APP_URL: 'Env.schema.string()' })
  for (const s of made) assert.ok(existsSync(join(stubsRoot, s)), `Missing stub: ${s}`)
  assert.ok(!made.some((s) => s.includes('email_verifications')))
  assert.ok(made.includes('views/mails/email_verification.stub'))
  assert.ok(made.includes('views/mails/email_verification_text.stub'))
  assert.ok(made.includes('views/mails/password_reset.stub'))
  assert.ok(made.includes('views/mails/password_reset_text.stub'))
  assert.ok(made.includes('validators/password_reset.stub'))
  assert.ok(!made.some((s) => s.includes('forgot_password_validator.stub')))
  assert.ok(!made.some((s) => s.includes('reset_password_validator.stub')))
  assert.deepEqual(middleware, [
    { stack: 'named', name: 'verified', path: 'adonisjs-auth-mail/verified_middleware' },
  ])
})

test('password reset migration keeps only the minimal token columns plus id', () => {
  const migration = readFileSync(join(stubsRoot, 'migrations/create_password_resets_table.stub'), 'utf8')
  const columns = [...migration.matchAll(/table\.(?:increments|string|timestamp)\('([^']+)'/g)].map(
    ([, column]) => column
  )
  assert.deepEqual(columns, ['id', 'email', 'token', 'created_at'])
})

test('auth mail config groups email verification and password reset options', () => {
  const config = readFileSync(join(stubsRoot, 'config/auth_mail.stub'), 'utf8')
  assert.match(config, /^  emailVerification: \{/m)
  assert.match(config, /^  passwordReset: \{/m)
  assert.doesNotMatch(config, /^\s+(?:secret|appUrl):/m)
  assert.doesNotMatch(config, /#start\/env/)
  assert.doesNotMatch(config, /^\s+(?:mailer|from):/m)
  assert.match(config, /^    path: '\/email\/verify\/:token',$/m)
  assert.match(config, /^    path: '\/password\/reset\/:token',$/m)
  assert.match(config, /^      htmlView: 'mails\/password_reset',$/m)
  assert.doesNotMatch(config, /^\s+(?:url|message)\s*[:(]/m)
  assert.doesNotMatch(config, /^\s+store:/m)
  assert.doesNotMatch(config, /^\s+userModel:/m)
  assert.doesNotMatch(config, /^  (?:verificationExpiresIn|resetExpiresIn|resetThrottle|resetStore):/m)
})
