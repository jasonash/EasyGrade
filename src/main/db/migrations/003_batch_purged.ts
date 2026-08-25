/** Retention purge: when a batch's page images were deleted (results stay). */
export const version = 3
export const sql = `
ALTER TABLE scan_batches ADD COLUMN purged_at TEXT;
`
