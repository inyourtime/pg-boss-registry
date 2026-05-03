import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { definePgBossQueues, queue, setupPgBoss } from '../src/index.js'
import { assertDatabaseAvailable, createStartedBoss, waitFor } from './helpers/database.js'

before(assertDatabaseAvailable)

test('queue registry can be defined with a shared worker factory context type', () => {
  const defineQueues = definePgBossQueues<{ service: string }>()
  const queueRegistry = defineQueues({
    email: queue<{ userId: string }>({ create: true }),
  })
  const workerFactory = queueRegistry.worker('email', (context) => ({
    name: `${context.service}-email-worker`,
    async handler() {},
  }))
  const worker = workerFactory({ service: 'mailer' })

  assert.deepEqual(queueRegistry.definitions, [{ name: 'email' }])
  assert.deepEqual(worker, {
    name: 'mailer-email-worker',
    queue: 'email',
    handler: worker.handler,
  })
})

test('context-typed queue registry registers queues and workers against postgres', async (t) => {
  const boss = await createStartedBoss()
  t.after(async () => {
    await boss.stop({ close: true })
  })

  const defineQueues = definePgBossQueues<{ service: string }>()
  const queueRegistry = defineQueues({
    email: queue<{ userId: string }>({ create: true }),
  })
  const processed: { service: string; userId: string }[] = []
  const worker = queueRegistry.worker('email', (context) => ({
    name: `${context.service}-email-worker`,
    options: {
      pollingIntervalSeconds: 0.5,
    },
    async handler(jobs) {
      for (const job of jobs) {
        processed.push({ service: context.service, userId: job.data.userId })
      }
    },
  }))

  const setup = await setupPgBoss(boss, {
    context: { service: 'mailer' },
    queueRegistry,
    workers: [worker],
  })
  t.after(setup.close)

  await boss.send('email', { userId: 'user_123' })

  await waitFor(
    () => processed.some((job) => job.service === 'mailer' && job.userId === 'user_123'),
    'context-typed registry worker did not process the postgres job',
  )

  assert.equal((await boss.getQueue('email'))?.name, 'email')
  assert.deepEqual(processed, [{ service: 'mailer', userId: 'user_123' }])
})

test('queue registry produces definitions that can be created in postgres', async (t) => {
  const boss = await createStartedBoss()
  t.after(async () => {
    await boss.stop({ close: true })
  })

  const queueConfig = { create: true, options: { retryLimit: 1 } }
  const worker = { async handler() {}, name: 'queue' }
  const workerFactory = () => worker
  const queueRegistry = definePgBossQueues({
    existing: { create: false },
    noOptions: { create: true },
    queue: queueConfig,
    registryName: {
      create: true,
      options: { name: 'optionsName', retryLimit: 3 },
    },
    'manual/queue': queue({ create: true, options: { retryLimit: 2 } }),
  })

  assert.equal(queue(queueConfig), queueConfig)
  assert.deepEqual(queue(), {})
  assert.equal(queueRegistry.queues.queue, queueConfig)
  assert.deepEqual(queueRegistry.definitions, [
    { name: 'noOptions' },
    { name: 'queue', retryLimit: 1 },
    { name: 'registryName', retryLimit: 3 },
    { name: 'manual/queue', retryLimit: 2 },
  ])
  assert.deepEqual(queueRegistry.worker('queue', worker), {
    ...worker,
    queue: 'queue',
  })
  assert.deepEqual(queueRegistry.worker('queue', workerFactory)({}), {
    ...worker,
    queue: 'queue',
  })

  await setupPgBoss(boss, {
    queueRegistry,
  })

  const manualQueue = await boss.getQueue('manual/queue')
  const noOptionsQueue = await boss.getQueue('noOptions')
  const registryQueue = await boss.getQueue('queue')
  const registryNameQueue = await boss.getQueue('registryName')
  const skippedQueue = await boss.getQueue('existing')

  assert.equal(manualQueue?.retryLimit, 2)
  assert.equal(noOptionsQueue?.name, 'noOptions')
  assert.equal(registryQueue?.retryLimit, 1)
  assert.equal(registryNameQueue?.name, 'registryName')
  assert.equal(registryNameQueue?.retryLimit, 3)
  assert.equal(skippedQueue, null)
})
