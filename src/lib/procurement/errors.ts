// Shared error helpers for the procurement module.

/**
 * SQLSTATE 42501 = "insufficient_privilege" — a row-level-security / permission
 * denial on a write. After the createServiceClient()→procurementWriteClient()
 * fix this should be unreachable on procurement writes, so surfacing it (instead
 * of a generic "server error") makes any future regression — e.g. a new table
 * added without the write client — immediately diagnosable from the UI.
 */
export function isWritePermissionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '42501'
  )
}
