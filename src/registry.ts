import type { PgBoss } from 'pg-boss'
import type {
  PgBossDefinedQueueRegistry,
  PgBossQueueConfig,
  PgBossQueueDefinition,
  PgBossQueueMap,
  PgBossQueueRegistry,
  PgBossWorkerRegistration,
  TypedPgBoss,
} from './types.js'

export function queue<Data = object>(
  definition: Omit<PgBossQueueConfig<Data>, '__data'> = {},
): PgBossQueueConfig<Data> {
  return definition
}

function shouldCreateQueue(definition: PgBossQueueConfig) {
  return definition.create === true
}

function getQueueDefinition(
  name: string,
  definition: PgBossQueueConfig,
): PgBossQueueDefinition | null {
  if (!shouldCreateQueue(definition)) {
    return null
  }

  return {
    ...(definition.options ?? {}),
    name,
  }
}

function applyQueueDefinition<Definition extends object>(
  name: string,
  workerDefinition: Definition,
): Omit<Definition, 'queue'> & {
  queue: string
} {
  const { queue: _queue, ...definition } = workerDefinition as Definition & {
    queue?: unknown
  }

  return {
    ...definition,
    queue: name,
  }
}

function createPgBossQueueRegistry<
  Context = unknown,
  const Registry extends PgBossQueueRegistry = PgBossQueueRegistry,
>(registry: Registry): PgBossDefinedQueueRegistry<Registry, Context> {
  const definitions = Object.entries(registry)
    .map(([name, definition]) => getQueueDefinition(name, definition))
    .filter((definition): definition is PgBossQueueDefinition => definition !== null)

  return {
    queues: registry,
    definitions,
    worker(name: string, definition: PgBossWorkerRegistration<any, any, any>) {
      if (typeof definition === 'function') {
        return (context: unknown) => applyQueueDefinition(name, definition(context))
      }

      return applyQueueDefinition(name, definition)
    },
  } as unknown as PgBossDefinedQueueRegistry<Registry, Context>
}

export function definePgBossQueues<Context>(): <const Registry extends PgBossQueueRegistry>(
  registry: Registry,
) => PgBossDefinedQueueRegistry<Registry, Context>
export function definePgBossQueues<const Registry extends PgBossQueueRegistry>(
  registry: Registry,
): PgBossDefinedQueueRegistry<Registry>
export function definePgBossQueues<Context, const Registry extends PgBossQueueRegistry>(
  registry?: Registry,
) {
  if (registry === undefined) {
    return <const Registry extends PgBossQueueRegistry>(registry: Registry) =>
      createPgBossQueueRegistry<Context, Registry>(registry)
  }

  return createPgBossQueueRegistry(registry)
}

export function asTypedPgBoss<Queues extends PgBossQueueMap>(boss: PgBoss): TypedPgBoss<Queues> {
  return boss as TypedPgBoss<Queues>
}
