import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import {
  asTypedPgBoss,
  definePgBossQueues,
  type PgBossQueuesFromRegistry,
  queue,
  setupPgBoss,
} from '../src/index.js'
import { assertDatabaseAvailable, createStartedBoss } from './helpers/database.js'

type EmailJob = {
  userId: string
}

type CleanupJob = {
  olderThanDays: number
}

before(assertDatabaseAvailable)

test('typed boss keeps the pg-boss instance while typed queue APIs hit postgres', async (t) => {
  const boss = await createStartedBoss()
  t.after(async () => {
    await boss.stop({ close: true })
  })

  const queues = definePgBossQueues({
    'email/send': queue<EmailJob>({ create: true }),
    cleanup: queue<CleanupJob>({ create: true }),
    heartbeat: queue<undefined>({ create: true }),
  })
  const cleanupWorker = queues.worker('cleanup', {
    name: 'cleanup-worker',
    schedule: {
      name: 'cleanup',
      cron: '0 0 * * *',
      data: {
        olderThanDays: 30,
      },
      key: 'nightly-cleanup',
      options: {
        tz: 'UTC',
      },
    },
    async handler() {},
  })
  type Queues = PgBossQueuesFromRegistry<typeof queues>

  const setup = await setupPgBoss(boss, {
    queueRegistry: queues,
    workers: [cleanupWorker],
  })

  const typedBoss = asTypedPgBoss<Queues>(boss)

  assert.equal(typedBoss, boss)
  assert.equal((await typedBoss.getQueue('email/send'))?.name, 'email/send')
  assert.equal((await typedBoss.getQueueStats('cleanup')).name, 'cleanup')
  assert.equal((await typedBoss.getSchedules('cleanup', 'nightly-cleanup')).length, 1)

  const emailJobId = await typedBoss.send('email/send', { userId: 'user_123' })
  const cleanupJobId = await typedBoss.send({
    name: 'cleanup',
    data: { olderThanDays: 7 },
  })
  const heartbeatJobId = await typedBoss.send('heartbeat')
  const insertedJobIds = await typedBoss.insert('email/send', [
    { data: { userId: 'inserted-user' } },
  ])

  assert.equal(typeof emailJobId, 'string')
  assert.equal(typeof cleanupJobId, 'string')
  assert.equal(typeof heartbeatJobId, 'string')
  assert.equal(
    insertedJobIds === undefined || insertedJobIds === null || insertedJobIds.length === 1,
    true,
  )

  const fetchedEmailJobs = await typedBoss.fetch('email/send', { batchSize: 2 })

  assert.equal(fetchedEmailJobs.length, 2)
  assert.deepEqual(fetchedEmailJobs.map((job) => job.data.userId).sort(), [
    'inserted-user',
    'user_123',
  ])

  const cleanupJob = await typedBoss.getJobById('cleanup', cleanupJobId as string)
  const cleanupJobs = await typedBoss.findJobs('cleanup')
  const heartbeatJobs = await typedBoss.fetch('heartbeat')

  assert.deepEqual(cleanupJob?.data, { olderThanDays: 7 })
  assert.equal(
    cleanupJobs.some((job) => job.id === cleanupJobId),
    true,
  )
  assert.equal(heartbeatJobs[0]?.data, null)

  await typedBoss.schedule('email/send', '0 8 * * *', { userId: 'daily-user' })
  assert.equal((await typedBoss.getSchedules('email/send')).length, 1)

  await setup.close()
})
