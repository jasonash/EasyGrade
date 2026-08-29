/** Answer-sheet-only tests: kind, default bubble count, link, attachment; per-question label style and override flag. */
export const version = 4
export const sql = `
ALTER TABLE tests ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE tests ADD COLUMN default_choice_count INTEGER;
ALTER TABLE tests ADD COLUMN link_url TEXT;
ALTER TABLE tests ADD COLUMN attachment_json TEXT;
ALTER TABLE questions ADD COLUMN label_style TEXT NOT NULL DEFAULT 'letters';
ALTER TABLE questions ADD COLUMN count_overridden INTEGER NOT NULL DEFAULT 0;
`
