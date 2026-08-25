/** Per-batch import problems (files that could not be read), shown on the Grading page. */
export const version = 2
export const sql = `
ALTER TABLE scan_batches ADD COLUMN errors_json TEXT NOT NULL DEFAULT '[]';
`
