import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { configure, stubsRoot } from '../src/index.js'

test('configure generates all stubs and env', async () => {
  const made: string[] = []
  const middleware: { stack: string; name: string; path: string }[] = []
  let env = false
  await configure({
    async createCodemods() {
      return {
        async makeUsingStub(_root: string, stub: string) { made.push(stub) },
        async defineEnvVariables() { env = true },
        async defineEnvValidations() {},
        async registerMiddleware(stack, entries) {
          for (const entry of entries) middleware.push({ stack, ...entry })
        },
      }
    },
  })
  assert.equal(made.length, 6)
  assert.ok(env)
  for (const s of made) assert.ok(existsSync(join(stubsRoot, s)), `Missing stub: ${s}`)
  assert.ok(!made.some((s) => s.includes('email_verifications')))
  assert.ok(!made.some((s) => s.includes('email_verification.stub')))
  assert.deepEqual(middleware, [
    { stack: 'named', name: 'verified', path: 'adonisjs-auth-mail/verified_middleware' },
  ])
})
