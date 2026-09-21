CREATE TABLE IF NOT EXISTS expert_hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  hearing_date TEXT NOT NULL,
  hearing_time TEXT,
  expert_office TEXT,
  expert_name TEXT,
  floor TEXT,
  hall TEXT,
  previous_action TEXT,
  current_action TEXT,
  notes TEXT,
  lawyer_id TEXT REFERENCES lawyers(id),
  status TEXT NOT NULL DEFAULT 'upcoming',
  source_hearing_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_expert_hearings_date ON expert_hearings(hearing_date);
CREATE INDEX IF NOT EXISTS idx_expert_hearings_case ON expert_hearings(case_id);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS opponent_address TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS opponent_phone TEXT;
