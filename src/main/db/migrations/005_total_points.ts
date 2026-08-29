/** Gradebook worth per test (null = show correct/possible and percent only). */
export const version = 5
export const sql = `
ALTER TABLE tests ADD COLUMN total_points REAL;
`
