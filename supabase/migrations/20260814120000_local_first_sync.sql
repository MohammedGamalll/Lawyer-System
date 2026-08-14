-- Local-first office sync schema

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  module TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  last_login_device TEXT,
  avatar_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS number_sequences (
  name TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT '',
  current_value INTEGER NOT NULL DEFAULT 0,
  padding INTEGER NOT NULL DEFAULT 4,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  client_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  trade_name TEXT,
  national_id TEXT,
  phone TEXT,
  phone2 TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  governorate TEXT,
  district TEXT,
  client_type TEXT NOT NULL DEFAULT 'individual',
  profession TEXT,
  birth_date TEXT,
  extra_data TEXT,
  notes TEXT,
  commercial_register TEXT,
  tax_id TEXT,
  manager_name TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS client_contacts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS lawyers (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  full_name TEXT NOT NULL,
  photo_path TEXT,
  bar_number TEXT,
  specialization TEXT,
  phone TEXT,
  email TEXT,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  salary DOUBLE PRECISION,
  hire_date TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  photo_path TEXT,
  license_no TEXT,
  qualification TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS leaves (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS opponents (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  national_id TEXT,
  phone TEXT,
  address TEXT,
  lawyer_name TEXT,
  extra_data TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS case_types (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  internal_file_number TEXT,
  title TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id),
  primary_lawyer_id TEXT REFERENCES lawyers(id),
  assistant_lawyer_id TEXT REFERENCES lawyers(id),
  case_type_id TEXT REFERENCES case_types(id),
  category TEXT,
  court TEXT,
  circuit TEXT,
  governorate TEXT,
  court_address TEXT,
  circuit_number TEXT,
  litigation_degree TEXT,
  filing_date TEXT,
  received_date TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  case_value DOUBLE PRECISION,
  opponent_name TEXT,
  opponent_lawyer TEXT,
  opponent_case_number TEXT,
  description TEXT,
  summary TEXT,
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS case_links (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  related_case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS case_opponents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  opponent_id TEXT NOT NULL REFERENCES opponents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (case_id, opponent_id)
);

CREATE TABLE IF NOT EXISTS hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  hearing_date TEXT NOT NULL,
  hearing_time TEXT,
  hearing_type TEXT,
  lawyer_id TEXT REFERENCES lawyers(id),
  status TEXT NOT NULL DEFAULT 'upcoming',
  result TEXT,
  court_decision TEXT,
  postponement_reason TEXT,
  next_hearing_date TEXT,
  what_happened TEXT,
  required_documents TEXT,
  next_actions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  appointment_type TEXT NOT NULL DEFAULT 'client',
  client_id TEXT REFERENCES clients(id),
  lawyer_id TEXT REFERENCES lawyers(id),
  case_id TEXT REFERENCES cases(id),
  date TEXT NOT NULL,
  time TEXT,
  location TEXT,
  purpose TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT REFERENCES users(id),
  case_id TEXT REFERENCES cases(id),
  client_id TEXT REFERENCES clients(id),
  start_date TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  reminder_type TEXT NOT NULL,
  title TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  notify_before_minutes INTEGER NOT NULL DEFAULT 60,
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee_id TEXT REFERENCES users(id),
  case_id TEXT REFERENCES cases(id),
  client_id TEXT REFERENCES clients(id),
  related_type TEXT,
  related_id TEXT,
  is_sent INTEGER NOT NULL DEFAULT 0,
  is_dismissed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  related_type TEXT,
  related_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  client_id TEXT REFERENCES clients(id),
  case_id TEXT REFERENCES cases(id),
  hearing_id TEXT REFERENCES hearings(id),
  contract_id TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  current_version INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS power_of_attorney (
  id TEXT PRIMARY KEY,
  poa_number TEXT NOT NULL UNIQUE,
  poa_type TEXT,
  client_id TEXT REFERENCES clients(id),
  lawyer_id TEXT REFERENCES lawyers(id),
  issuing_authority TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  document_id TEXT REFERENCES documents(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  contract_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id),
  contract_type TEXT,
  start_date TEXT,
  end_date TEXT,
  value DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'active',
  lawyer_id TEXT REFERENCES lawyers(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  lawyer_id TEXT REFERENCES lawyers(id),
  consultation_date TEXT,
  consultation_type TEXT,
  subject TEXT,
  details TEXT,
  recommendations TEXT,
  fees DOUBLE PRECISION,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS correspondence (
  id TEXT PRIMARY KEY,
  correspondence_number TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL DEFAULT 'outgoing',
  correspondence_type TEXT NOT NULL DEFAULT 'letter',
  date TEXT,
  party TEXT,
  subject TEXT,
  responsible_user_id TEXT REFERENCES users(id),
  case_id TEXT REFERENCES cases(id),
  client_id TEXT REFERENCES clients(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS cashboxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'office',
  current_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS case_fees (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  total_fees DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  remaining DOUBLE PRECISION NOT NULL DEFAULT 0,
  due_date TEXT,
  payment_method TEXT,
  installment_count INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payment_number TEXT NOT NULL UNIQUE,
  client_id TEXT REFERENCES clients(id),
  case_id TEXT REFERENCES cases(id),
  amount DOUBLE PRECISION NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'fees',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  cashbox_id TEXT REFERENCES cashboxes(id),
  payment_date TEXT,
  due_date TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  client_id TEXT REFERENCES clients(id),
  case_id TEXT REFERENCES cases(id),
  invoice_date TEXT,
  due_date TEXT,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  payment_id TEXT REFERENCES payments(id),
  client_id TEXT REFERENCES clients(id),
  amount DOUBLE PRECISION NOT NULL,
  receipt_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  voucher_number TEXT NOT NULL UNIQUE,
  voucher_type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  cashbox_id TEXT REFERENCES cashboxes(id),
  related_id TEXT,
  voucher_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_number TEXT NOT NULL UNIQUE,
  category_id TEXT REFERENCES expense_categories(id),
  amount DOUBLE PRECISION NOT NULL,
  cashbox_id TEXT REFERENCES cashboxes(id),
  expense_date TEXT,
  client_id TEXT REFERENCES clients(id),
  case_id TEXT REFERENCES cases(id),
  description TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS cashbox_transactions (
  id TEXT PRIMARY KEY,
  cashbox_id TEXT NOT NULL REFERENCES cashboxes(id),
  transaction_type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  related_type TEXT,
  related_id TEXT,
  description TEXT,
  transaction_date TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT,
  old_values TEXT,
  new_values TEXT,
  device_info TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(full_name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_national ON clients(national_id);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_lawyer ON cases(primary_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_hearings_date ON hearings(hearing_date);
CREATE INDEX IF NOT EXISTS idx_hearings_case ON hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON roles;
CREATE POLICY office_all ON roles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE roles REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE roles;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON permissions;
CREATE POLICY office_all ON permissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE permissions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE permissions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON role_permissions;
CREATE POLICY office_all ON role_permissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE role_permissions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE role_permissions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON users;
CREATE POLICY office_all ON users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE users REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE users;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON user_permissions;
CREATE POLICY office_all ON user_permissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE user_permissions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_permissions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON settings;
CREATE POLICY office_all ON settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE settings REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settings;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE number_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON number_sequences;
CREATE POLICY office_all ON number_sequences FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE number_sequences REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE number_sequences;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON clients;
CREATE POLICY office_all ON clients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE clients REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE clients;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON client_contacts;
CREATE POLICY office_all ON client_contacts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE client_contacts REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE client_contacts;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE lawyers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON lawyers;
CREATE POLICY office_all ON lawyers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE lawyers REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE lawyers;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON employees;
CREATE POLICY office_all ON employees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE employees REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE employees;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON attendance;
CREATE POLICY office_all ON attendance FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE attendance REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON leaves;
CREATE POLICY office_all ON leaves FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE leaves REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE leaves;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE opponents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON opponents;
CREATE POLICY office_all ON opponents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE opponents REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE opponents;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE case_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON case_types;
CREATE POLICY office_all ON case_types FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE case_types REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE case_types;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON cases;
CREATE POLICY office_all ON cases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE cases REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cases;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE case_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON case_links;
CREATE POLICY office_all ON case_links FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE case_links REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE case_links;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE case_opponents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON case_opponents;
CREATE POLICY office_all ON case_opponents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE case_opponents REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE case_opponents;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE hearings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON hearings;
CREATE POLICY office_all ON hearings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE hearings REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE hearings;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON appointments;
CREATE POLICY office_all ON appointments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE appointments REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON tasks;
CREATE POLICY office_all ON tasks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE tasks REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON reminders;
CREATE POLICY office_all ON reminders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE reminders REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE reminders;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON notifications;
CREATE POLICY office_all ON notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON documents;
CREATE POLICY office_all ON documents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE documents REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE documents;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON document_versions;
CREATE POLICY office_all ON document_versions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE document_versions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE document_versions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE power_of_attorney ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON power_of_attorney;
CREATE POLICY office_all ON power_of_attorney FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE power_of_attorney REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE power_of_attorney;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON contracts;
CREATE POLICY office_all ON contracts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE contracts REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contracts;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON consultations;
CREATE POLICY office_all ON consultations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE consultations REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE consultations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE correspondence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON correspondence;
CREATE POLICY office_all ON correspondence FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE correspondence REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE correspondence;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE cashboxes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON cashboxes;
CREATE POLICY office_all ON cashboxes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE cashboxes REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cashboxes;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE case_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON case_fees;
CREATE POLICY office_all ON case_fees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE case_fees REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE case_fees;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON payments;
CREATE POLICY office_all ON payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE payments REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE payments;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON invoices;
CREATE POLICY office_all ON invoices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE invoices REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON invoice_items;
CREATE POLICY office_all ON invoice_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE invoice_items REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE invoice_items;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON receipts;
CREATE POLICY office_all ON receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE receipts REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE receipts;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON vouchers;
CREATE POLICY office_all ON vouchers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE vouchers REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE vouchers;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON expense_categories;
CREATE POLICY office_all ON expense_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE expense_categories REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE expense_categories;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON expenses;
CREATE POLICY office_all ON expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE expenses REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE cashbox_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON cashbox_transactions;
CREATE POLICY office_all ON cashbox_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE cashbox_transactions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cashbox_transactions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS office_all ON audit_logs;
CREATE POLICY office_all ON audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;


CREATE OR REPLACE FUNCTION allocate_next_number(seq_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  rec number_sequences%ROWTYPE;
  next_val integer;
BEGIN
  SELECT * INTO rec FROM number_sequences WHERE name = seq_name FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown sequence %', seq_name;
  END IF;
  next_val := rec.current_value + 1;
  UPDATE number_sequences
    SET current_value = next_val, updated_at = (now() AT TIME ZONE 'utc')::text
    WHERE name = seq_name;
  RETURN rec.prefix || lpad(next_val::text, rec.padding, '0');
END;
$$;

CREATE OR REPLACE FUNCTION upsert_with_number(p_table text, p_row jsonb, p_seq text, p_number_col text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  allowed text[] := ARRAY['clients','cases','invoices','receipts','vouchers','payments','expenses','power_of_attorney','contracts','correspondence'];
  new_num text;
  result jsonb;
  set_sql text;
BEGIN
  IF NOT (p_table = ANY(allowed)) THEN
    RAISE EXCEPTION 'table not allowed %', p_table;
  END IF;
  SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ')
    INTO set_sql
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name <> 'id';
  BEGIN
    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
      p_table, p_table, set_sql
    ) USING p_row;
  EXCEPTION WHEN unique_violation THEN
    new_num := allocate_next_number(p_seq);
    p_row := jsonb_set(p_row, ARRAY[p_number_col], to_jsonb(new_num));
    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
      p_table, p_table, set_sql
    ) USING p_row;
  END;
  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_table) INTO result USING p_row->>'id';
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_next_number(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_with_number(text, jsonb, text, text) TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
