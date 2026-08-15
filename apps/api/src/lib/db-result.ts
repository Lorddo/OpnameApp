import { ApiError } from './errors.js'

type DbErrorLike = { message: string } | null

export function throwIfDbError(error: DbErrorLike, status: 400 | 500 = 500): asserts error is null {
  if (error) throw new ApiError(status, 'db_error', error.message)
}

export function requireRow<T>(row: T | null | undefined, notFoundMessage: string): T {
  if (!row) throw new ApiError(404, 'not_found', notFoundMessage)
  return row
}
