/** Initial schema. Matches docs/DATA_MODEL.md. */
export const version = 1
export const sql = `
CREATE TABLE sections (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  school_year TEXT NOT NULL DEFAULT '',
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE students (
  id             INTEGER PRIMARY KEY,
  section_id     INTEGER NOT NULL REFERENCES sections(id),
  code           TEXT NOT NULL UNIQUE,
  last_name      TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  student_number TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_students_section_name ON students(section_id, last_name, first_name);

CREATE TABLE tests (
  id              INTEGER PRIMARY KEY,
  section_id      INTEGER NOT NULL REFERENCES sections(id),
  code            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  instructions    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  layout_version  INTEGER NOT NULL DEFAULT 1,
  layout_json     TEXT,
  finalized_at    TEXT,
  last_printed_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_tests_section ON tests(section_id);

CREATE TABLE questions (
  id             INTEGER PRIMARY KEY,
  test_id        INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  stem           TEXT NOT NULL,
  correct_choice INTEGER NOT NULL,
  points         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (test_id, position)
);

CREATE TABLE choices (
  id          INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  text        TEXT NOT NULL,
  UNIQUE (question_id, position)
);

CREATE TABLE scan_batches (
  id                 INTEGER PRIMARY KEY,
  source_description TEXT NOT NULL,
  page_count         INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  imported_at        TEXT NOT NULL,
  completed_at       TEXT
);

CREATE TABLE scan_pages (
  id                 INTEGER PRIMARY KEY,
  batch_id           INTEGER NOT NULL REFERENCES scan_batches(id) ON DELETE CASCADE,
  page_index         INTEGER NOT NULL,
  image_path         TEXT NOT NULL,
  thumb_path         TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  bucket             TEXT,
  reason             TEXT,
  rotation           INTEGER,
  alignment_quality  TEXT,
  alignment_residual REAL,
  qr_payload         TEXT,
  test_id            INTEGER REFERENCES tests(id),
  student_id         INTEGER REFERENCES students(id),
  assigned_by        TEXT,
  detected_json      TEXT,
  crops_json         TEXT,
  result_id          INTEGER,
  processed_at       TEXT,
  UNIQUE (batch_id, page_index)
);
CREATE INDEX idx_scan_pages_bucket ON scan_pages(bucket);
CREATE INDEX idx_scan_pages_test ON scan_pages(test_id);

CREATE TABLE results (
  id                 INTEGER PRIMARY KEY,
  test_id            INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id         INTEGER NOT NULL REFERENCES students(id),
  scan_page_id       INTEGER REFERENCES scan_pages(id),
  layout_version     INTEGER NOT NULL,
  raw_answers_json   TEXT NOT NULL,
  final_answers_json TEXT NOT NULL,
  correct_count      INTEGER NOT NULL,
  possible_count     INTEGER NOT NULL,
  flags_json         TEXT NOT NULL DEFAULT '[]',
  reviewed           INTEGER NOT NULL DEFAULT 0,
  graded_at          TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (test_id, student_id)
);

CREATE TABLE answer_overrides (
  id                INTEGER PRIMARY KEY,
  result_id         INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  question_position INTEGER NOT NULL,
  raw_choice        INTEGER,
  override_choice   INTEGER,
  note              TEXT,
  created_at        TEXT NOT NULL,
  UNIQUE (result_id, question_position)
);

CREATE TABLE print_runs (
  id               INTEGER PRIMARY KEY,
  test_id          INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  layout_version   INTEGER NOT NULL,
  date_label       TEXT,
  student_ids_json TEXT NOT NULL,
  blank_count      INTEGER NOT NULL,
  printed_at       TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
