-- Office feedback: lookups, multi-clients, hearing/task/case extra columns

ALTER TABLE hearings ADD COLUMN IF NOT EXISTS previous_decision TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS hall TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS floor TEXT;

ALTER TABLE cases ADD COLUMN IF NOT EXISTS first_instance_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS first_instance_year TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS appeal_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS appeal_year TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cassation_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cassation_year TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref_type TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref_number TEXT;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS lawyer_phone TEXT;

CREATE TABLE IF NOT EXISTS case_clients (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  capacity_first TEXT,
  capacity_appeal TEXT,
  capacity_cassation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (case_id, client_id)
);

CREATE TABLE IF NOT EXISTS lookup_values (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (kind, value)
);

ALTER TABLE case_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON case_clients;
CREATE POLICY office_all ON case_clients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE case_clients REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE case_clients;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON lookup_values;
CREATE POLICY office_all ON lookup_values FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE lookup_values REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE lookup_values;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;
