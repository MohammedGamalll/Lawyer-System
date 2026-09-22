-- Align remote Postgres with local SQLite (schema.ts + patch.ts). Idempotent.

CREATE TABLE IF NOT EXISTS expert_hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  hearing_date TEXT NOT NULL,
  hearing_time TEXT,
  expert_office TEXT,
  expert_name TEXT,
  venue TEXT,
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
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (kind, value)
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS id_kind TEXT NOT NULL DEFAULT 'national_id';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS passport_country TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone_home TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone_work TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address2 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS poa_number TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS poa_year TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS poa_letter TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS poa_office TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_blacklisted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS blacklist_note TEXT;

ALTER TABLE opponents ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS id_kind TEXT NOT NULL DEFAULT 'national_id';
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS passport_country TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS phone2 TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS phone_home TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS phone_work TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS address2 TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS lawyer_phone TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS poa_number TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS poa_year TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS poa_letter TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS poa_office TEXT;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS is_blacklisted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS blacklist_note TEXT;

ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS phone_home TEXT;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS phone_other TEXT;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS salary DOUBLE PRECISION;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS bar_degree TEXT;
ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS duties TEXT;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_home TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_other TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE cases ADD COLUMN IF NOT EXISTS office_case_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_year TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS first_instance_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS first_instance_year TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS appeal_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS appeal_year TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cassation_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cassation_year TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref_type TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref2_type TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref2_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref3_type TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS extra_ref3_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS police_station TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS session_place TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS previous_circuit TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS opponent_capacity_first TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS opponent_capacity_appeal TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS opponent_capacity_cassation TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS judgment_date TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS judgment_text TEXT;

ALTER TABLE case_opponents ADD COLUMN IF NOT EXISTS capacity_first TEXT;
ALTER TABLE case_opponents ADD COLUMN IF NOT EXISTS capacity_appeal TEXT;
ALTER TABLE case_opponents ADD COLUMN IF NOT EXISTS capacity_cassation TEXT;
ALTER TABLE case_opponents ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE hearings ADD COLUMN IF NOT EXISTS previous_decision TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS hall TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS floor TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS expert_name TEXT;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS expert_office TEXT;

ALTER TABLE expert_hearings ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE expert_hearings ADD COLUMN IF NOT EXISTS source_hearing_id TEXT;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS case_subject TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_kind TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hearing_id TEXT REFERENCES hearings(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_kind TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS police_report_no TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS police_station TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS police_report_kind TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_number TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_officer TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS judgment_date TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS judgment_text TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS opponent_address TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS opponent_phone TEXT;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS opponent_id TEXT REFERENCES opponents(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lawyer_id TEXT REFERENCES lawyers(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS employee_id TEXT REFERENCES employees(id);

ALTER TABLE power_of_attorney ADD COLUMN IF NOT EXISTS poa_year TEXT;
ALTER TABLE power_of_attorney ADD COLUMN IF NOT EXISTS poa_letter TEXT;
ALTER TABLE power_of_attorney ADD COLUMN IF NOT EXISTS poa_office TEXT;

ALTER TABLE lookup_values ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS case_dues (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  amount DOUBLE PRECISION NOT NULL,
  due_type TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_case_dues_case ON case_dues(case_id);

ALTER TABLE case_dues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON case_dues;
CREATE POLICY office_all ON case_dues FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE case_dues REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE case_dues;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE expert_hearings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON expert_hearings;
CREATE POLICY office_all ON expert_hearings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE expert_hearings REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE expert_hearings;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
