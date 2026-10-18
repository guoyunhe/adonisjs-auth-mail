import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { configure, stubsRoot } from '../src/index.js'

test('configure generates all stubs and env', async () => {
  const made: string[] = []
  let env = false
  await configure({
    async createCodemods() {
      return {
        async makeUsingStub(_root: string, stub: string) { made.push(stub) },
        async defineEnvVariables() { env = true },
        async defineEnvValidations() {},
      }
    },
  })
  assert.equal(made.length, 8)
  assert.ok(env)
  for (const s of made) assert.ok(existsSync(join(stubsRoot, s)), `Missing stub: ${s}`)
})
