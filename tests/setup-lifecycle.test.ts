import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PgBoss } from 'pg-boss'
import { definePgBossQueues, queue, setupPgBoss } from '../src/index.js'
import { connectionString, createSchemaName, createStartedBoss } from './helpers/database.js'

test('setupPgBoss can own the start and stop lifecycle while resolving worker factories', async () => {
  const boss = new PgBoss({
    connectionString,
    schema: createSchemaName(),
  })
  const queues = definePgBossQueues({
    email: queue<{ userId: string }>({ create: true, options: { retryLimit: 1 } }),
    external: queue({ create: false }),
  })
  const context = { service: 'mailer' }
  const worker = queues.worker('email', (receivedContext: typeof context) => {
    assert.equal(receivedContext, context)

    return {
      name: 'email-worker',
      offWorkOptions: { wait: true },
      schedule: {
        cron: '0 * * * *',
      },
      async handler() {},
    }
  })

  const setup = await setupPgBoss(boss, {
    context,
    start: true,
    stopOnClose: true,
    stopOptions: { close: true },
    queueRegistry: queues,
    workers: [worker],
  })

  assert.equal((await boss.getQueue('email'))?.retryLimit, 1)
  assert.equal((await boss.getSchedules('email')).length, 1)
  assert.deepEqual(setup.workers[0], {
    name: 'email-worker',
    queue: 'email',
    offWorkOptions: { wait: true },
    schedule: { cron: '0 * * * *' },
    handler: setup.workers[0]?.handler,
  })

  await setup.close()
})

test('setupPgBoss can register nothing without owning start or stop', async (t) => {
  const boss = await createStartedBoss()
  t.after(async () => {
    await boss.stop({ close: true })
  })

  const setup = await setupPgBoss(boss)

  await setup.close()

  assert.equal(setup.boss, boss)
  assert.deepEqual(setup.workers, [])
  assert.equal(
    (await boss.getQueues()).every((queue) => queue.name.startsWith('__pgboss__')),
    true,
  )
})

test('setupPgBoss does not start an already managed boss when start is false', async (t) => {
  const boss = await createStartedBoss()
  const originalStart = boss.start
  let startCalled = false

  t.after(async () => {
    boss.start = originalStart
    await boss.stop({ close: true })
  })

  boss.start = async () => {
    startCalled = true
    throw new Error('setupPgBoss should not call start() when start is false')
  }

  const queues = definePgBossQueues({
    email: queue<{ userId: string }>({ create: true }),
  })

  const setup = await setupPgBoss(boss, {
    start: false,
    queueRegistry: queues,
  })

  await setup.close()

  assert.equal(startCalled, false)
  assert.equal((await boss.getQueue('email'))?.name, 'email')
})
