import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import {
  asTypedPgBoss,
  closePgBossWorkers,
  definePgBossQueues,
  getPgBossWorkerSchedule,
  type PgBossWorkerDefinition,
  queue,
  registerPgBossQueues,
  registerPgBossWorker,
  registerPgBossWorkers,
  resolvePgBossWorkerDefinition,
} from '../src/index.js'
import { assertDatabaseAvailable, createStartedBoss, waitFor } from './helpers/database.js'

type EmailJob = {
  userId: string
}

before(assertDatabaseAvailable)

test('worker schedules resolve defaults and timezone shortcut', () => {
  const queues = definePgBossQueues({
    'reports/daily': queue<EmailJob>({ create: true }),
  })

  assert.deepEqual(
    getPgBossWorkerSchedule(
      queues.worker('reports/daily', {
        name: 'daily-report',
        schedule: {
          cron: '0 8 * * *',
          data: { userId: 'worker' },
          key: 'daily-report',
          tz: 'Asia/Bangkok',
        },
        async handler() {},
      }),
    ),
    {
      name: 'reports/daily',
      cron: '0 8 * * *',
      data: { userId: 'worker' },
      key: 'daily-report',
      options: { tz: 'Asia/Bangkok' },
    },
  )
  assert.deepEqual(
    getPgBossWorkerSchedule({
      name: 'worker-name',
      schedule: {
        cron: '0 9 * * *',
        data: { userId: 'worker' },
        name: 'scheduled-queue',
      },
      async handler() {},
    }),
    {
      name: 'scheduled-queue',
      cron: '0 9 * * *',
      data: { userId: 'worker' },
    },
  )
  assert.deepEqual(
    getPgBossWorkerSchedule({
      name: 'string-schedule',
      schedule: '*/5 * * * *',
      async handler() {},
    }),
    {
      name: 'string-schedule',
      cron: '*/5 * * * *',
    },
  )
  assert.equal(getPgBossWorkerSchedule({ name: 'queue', async handler() {} }), null)
})

test('worker factories resolve with framework context', () => {
  const context = { framework: 'any' }
  const worker = { name: 'queue', async handler() {} }
  const workerFactory = (receivedContext: typeof context) => {
    assert.equal(receivedContext, context)
    return worker
  }

  assert.equal(resolvePgBossWorkerDefinition(context, worker), worker)
  assert.equal(resolvePgBossWorkerDefinition(context, workerFactory), worker)
})

test('worker registration runs against postgres and close removes active workers', async (t) => {
  const boss = await createStartedBoss()
  t.after(async () => {
    await boss.stop({ close: true })
  })

  const processed: EmailJob[] = []
  const metadataProcessed: EmailJob[] = []
  const queues = definePgBossQueues({
    'email/send': queue<EmailJob>({ create: true, options: { retryLimit: 5 } }),
    metadata: queue<EmailJob>({ create: true, options: { retryLimit: 2 } }),
    'metadata-default-options': queue({ create: true }),
  })
  const disabledWorker: PgBossWorkerDefinition = {
    name: 'disabled-worker',
    enabled: false,
    async handler() {
      throw new Error('disabled worker should not be registered')
    },
  }
  const emailWorker = queues.worker('email/send', {
    name: 'email-worker',
    schedule: '*/5 * * * *',
    options: {
      pollingIntervalSeconds: 0.5,
    },
    async handler(jobs) {
      for (const job of jobs) {
        processed.push(job.data)
      }
    },
  })
  const metadataWorker = queues.worker('metadata', {
    name: 'metadata-worker',
    includeMetadata: true,
    options: {
      includeMetadata: true,
      pollingIntervalSeconds: 0.5,
    },
    async handler(jobs) {
      for (const job of jobs) {
        metadataProcessed.push(job.data)
      }
    },
  })
  const defaultOptionsMetadataWorker = queues.worker('metadata-default-options', {
    name: 'metadata-default-options',
    includeMetadata: true,
    async handler() {},
  })

  await registerPgBossWorkers(boss)
  await registerPgBossWorker(boss, disabledWorker)
  const registeredWorkers = [
    emailWorker,
    metadataWorker,
    defaultOptionsMetadataWorker,
  ] as readonly PgBossWorkerDefinition<any>[]

  await registerPgBossQueues(boss, queues.definitions)
  await registerPgBossWorkers(boss, registeredWorkers)

  assert.equal((await boss.getQueue('email/send'))?.retryLimit, 5)
  assert.equal((await boss.getQueue('metadata'))?.retryLimit, 2)
  assert.equal((await boss.getQueue('metadata-default-options'))?.name, 'metadata-default-options')
  assert.equal((await boss.getSchedules('email/send')).length, 1)

  const typedBoss = asTypedPgBoss<{
    'email/send': EmailJob
    metadata: EmailJob
  }>(boss)

  await typedBoss.send('email/send', { userId: 'worker-user' })
  await typedBoss.send('metadata', { userId: 'metadata-user' })

  await waitFor(
    () => processed.some((job) => job.userId === 'worker-user'),
    'registered worker did not process the queued job',
  )
  await waitFor(
    () => metadataProcessed.some((job) => job.userId === 'metadata-user'),
    'registered metadata worker did not process the queued job',
  )

  assert.equal(
    boss.getWipData().some((worker) => worker.name === 'email/send'),
    true,
  )
  assert.equal(
    boss.getWipData().some((worker) => worker.name === 'metadata'),
    true,
  )

  await closePgBossWorkers(boss, [
    ...registeredWorkers,
    disabledWorker,
    { name: 'opted-out', offWorkOnClose: false, async handler() {} },
  ])

  await waitFor(
    () =>
      !boss
        .getWipData()
        .some((worker) =>
          ['email/send', 'metadata', 'metadata-default-options'].includes(worker.name),
        ),
    'registered workers were not removed by closePgBossWorkers()',
  )
})
