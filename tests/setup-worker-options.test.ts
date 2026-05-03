import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PgBoss } from 'pg-boss'
import { registerPgBossWorker } from '../src/index.js'

test('worker registration warns when nested includeMetadata is ignored', async (t) => {
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (message?: unknown, ...optionalParams: unknown[]) => {
    warnings.push([message, ...optionalParams].map(String).join(' '))
  }
  t.after(() => {
    console.warn = originalWarn
  })

  const workCalls: { options: { includeMetadata?: boolean; pollingIntervalSeconds?: number } }[] =
    []
  const boss = {
    async schedule() {},
    async work(
      _name: string,
      options: { includeMetadata?: boolean; pollingIntervalSeconds?: number },
    ) {
      workCalls.push({ options })
      return 'worker-id'
    },
  } as unknown as Pick<PgBoss, 'schedule' | 'work'>

  await registerPgBossWorker(boss, {
    name: 'metadata-worker',
    includeMetadata: true,
    options: {
      includeMetadata: false,
      pollingIntervalSeconds: 0.5,
    },
    async handler() {},
  })
  await registerPgBossWorker(boss, {
    name: 'plain-worker',
    options: {
      includeMetadata: true,
      pollingIntervalSeconds: 0.5,
    },
    async handler() {},
  })

  assert.deepEqual(warnings, [
    'pg-boss-registry: worker.options.includeMetadata is ignored; use worker.includeMetadata instead.',
    'pg-boss-registry: worker.options.includeMetadata is ignored; use worker.includeMetadata instead.',
  ])
  assert.deepEqual(
    workCalls.map((call) => call.options.includeMetadata),
    [true, false],
  )
})
