import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import {
  registerPgBossQueue,
  registerPgBossQueues,
  registerPgBossSchedule,
  registerPgBossSchedules,
} from '../src/index.js'
import { assertDatabaseAvailable, createStartedBoss } from './helpers/database.js'

before(assertDatabaseAvailable)

test('queue and schedule registration helpers persist definitions in postgres', async (t) => {
  const boss = await createStartedBoss()
  t.after(async () => {
    await boss.stop({ close: true })
  })

  await registerPgBossQueues(boss)
  await registerPgBossQueue(boss, 'email/send')
  await registerPgBossQueue(boss, { name: 'reports/daily', retryLimit: 3 })
  await registerPgBossQueues(boss, [{ name: 'cleanup', expireInSeconds: 60 }])

  await registerPgBossSchedules(boss)
  await registerPgBossSchedule(boss, {
    name: 'disabled-schedule',
    cron: '* * * * *',
    enabled: false,
  })
  await registerPgBossSchedule(boss, {
    name: 'email/send',
    cron: '* * * * *',
    options: {
      retryLimit: 1,
    },
  })
  await registerPgBossSchedules(boss, [
    {
      name: 'reports/daily',
      cron: '0 8 * * *',
      data: { source: 'test' },
      key: 'daily-report',
      options: { tz: 'UTC' },
    },
  ])

  const emailQueue = await boss.getQueue('email/send')
  const reportQueue = await boss.getQueue('reports/daily')
  const cleanupQueue = await boss.getQueue('cleanup')
  const emailSchedules = await boss.getSchedules('email/send')
  const reportSchedules = await boss.getSchedules('reports/daily', 'daily-report')
  const disabledSchedules = await boss.getSchedules('disabled-schedule')

  assert.equal(emailQueue?.name, 'email/send')
  assert.equal(reportQueue?.retryLimit, 3)
  assert.equal(cleanupQueue?.expireInSeconds, 60)
  assert.equal(emailSchedules.length, 1)
  assert.equal(emailSchedules[0]?.cron, '* * * * *')
  assert.equal(emailSchedules[0]?.data, null)
  assert.equal((emailSchedules[0]?.options as { retryLimit?: number } | undefined)?.retryLimit, 1)
  assert.equal(reportSchedules.length, 1)
  assert.deepEqual(reportSchedules[0]?.data, { source: 'test' })
  assert.equal((reportSchedules[0]?.options as { tz?: string } | undefined)?.tz, 'UTC')
  assert.equal(disabledSchedules.length, 0)
})
