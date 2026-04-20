import {getSupabaseBrowserClient} from '../supabase/client'

type RpcArgs = Record<string, unknown>

/**
 * Convert a snake_case string to camelCase.
 */
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase())
}

/**
 * Recursively convert all keys in an object from snake_case to camelCase.
 * Handles nested objects and arrays. Passes through primitives and null.
 */
export function snakeToCamel<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) {
    return value as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => snakeToCamel(item)) as T
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[snakeToCamelKey(key)] = snakeToCamel(val)
    }
    return result as T
  }

  return value as T
}

export const rpcAdapter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic RPC dispatch, typed at call site
  async call<TResult>(name: string, args?: RpcArgs) {
    const {data, error} = await getSupabaseBrowserClient().rpc(name as any, args as any)

    if (error) {
      throw error
    }

    return data as TResult
  },

  /**
   * Call an RPC and auto-convert the response from snake_case to camelCase.
   * Use this for RPCs that return `table(...)` with snake_case columns.
   */
  async callAndTransform<TResult>(name: string, args?: RpcArgs) {
    const {data, error} = await getSupabaseBrowserClient().rpc(name as any, args as any)

    if (error) {
      throw error
    }

    return snakeToCamel<TResult>(data)
  },

  /**
   * Call an RPC that returns table(...) and unwrap the first row.
   * Returns null if the result set is empty. Use for single-row RPCs.
   */
  async callSingle<TResult>(name: string, args?: RpcArgs) {
    const {data, error} = await getSupabaseBrowserClient().rpc(name as any, args as any)

    if (error) {
      throw error
    }

    const rows = data as unknown as unknown[]
    if (!rows || rows.length === 0) {
      return null as TResult
    }

    return snakeToCamel<TResult>(rows[0])
  },
}

export function getErrorMessage(error: unknown, fallback = 'Rocketboard could not complete that request.') {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const objectError = error as Record<string, unknown>

    if (typeof objectError.message === 'string' && objectError.message.trim().length > 0) {
      return objectError.message
    }

    if (typeof objectError.details === 'string' && objectError.details.trim().length > 0) {
      return objectError.details
    }

    if (typeof objectError.hint === 'string' && objectError.hint.trim().length > 0) {
      return objectError.hint
    }
  }

  return fallback
}
