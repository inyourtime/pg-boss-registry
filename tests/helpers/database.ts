import { randomUUID } from 'node:crypto'
import { PgBoss } from 'pg-boss'

export const connectionString =
  process.env.POSTGRES_URL ?? 'postgres://postgres:postgres@localhost:54329/postgres'

export function createSchemaName() {
  return `pbr_${randomUUID().replaceAll('-', '_').slice(0, 24)}`
}

export async function assertDatabaseAvailable() {
  const boss = new PgBoss({
    connectionString,
    schema: createSchemaName(),
  })

  try {
    await boss.start()
    await boss.stop({ close: true })
  } catch (error) {
    throw new Error(
      `Postgres is not available for integration tests. Run "npm run db:up" first. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

export async function createStartedBoss() {
  const boss = new PgBoss({
    connectionString,
    schema: createSchemaName(),
  })

  await boss.start()

  return boss
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 5000,
) {
  const startedAt = Date.now()

  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(message)
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
