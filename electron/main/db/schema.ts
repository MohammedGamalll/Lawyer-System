import { PERFORMANCE_INDEXES } from './indexes'

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

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

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  device_info TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  username TEXT,
  success INTEGER NOT NULL,
  device_info TEXT,
  created_at TEXT NOT NULL
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
  nickname TEXT,
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
  id_kind TEXT NOT NULL DEFAULT 'national_id',
  passport_country TEXT,
  phone_home TEXT,
  phone_work TEXT,
  address2 TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(full_name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_national ON clients(national_id);

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
  sort_order INTEGER NOT NULL DEFAULT 0,
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
  salary REAL,
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
  nickname TEXT,
  national_id TEXT,
  phone TEXT,
  address TEXT,
  lawyer_name TEXT,
  lawyer_phone TEXT,
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
  office_case_number TEXT,
  case_year TEXT,
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
  first_instance_number TEXT,
  first_instance_year TEXT,
  appeal_number TEXT,
  appeal_year TEXT,
  cassation_number TEXT,
  cassation_year TEXT,
  extra_ref_type TEXT,
  extra_ref_number TEXT,
  extra_ref2_type TEXT,
  extra_ref2_number TEXT,
  extra_ref3_type TEXT,
  extra_ref3_number TEXT,
  session_place TEXT,
  previous_circuit TEXT,
  opponent_capacity_first TEXT,
  opponent_capacity_appeal TEXT,
  opponent_capacity_cassation TEXT,
  filing_date TEXT,
  received_date TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  case_value REAL,
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

CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_lawyer ON cases(primary_lawyer_id);

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
  capacity_first TEXT,
  capacity_appeal TEXT,
  capacity_cassation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (case_id, opponent_id)
);

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

CREATE TABLE IF NOT EXISTS hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  hearing_date TEXT NOT NULL,
  hearing_time TEXT,
  hearing_type TEXT,
  previous_decision TEXT,
  hall TEXT,
  floor TEXT,
  venue TEXT,
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

CREATE INDEX IF NOT EXISTS idx_hearings_date ON hearings(hearing_date);
CREATE INDEX IF NOT EXISTS idx_hearings_case ON hearings(case_id);

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
  venue TEXT,
  case_subject TEXT,
  assignee_id TEXT REFERENCES users(id),
  case_id TEXT REFERENCES cases(id),
  client_id TEXT REFERENCES clients(id),
  start_date TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new',
  progress INTEGER NOT NULL DEFAULT 0,
  work_kind TEXT NOT NULL DEFAULT 'admin',
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
  value REAL,
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
  fees REAL,
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
  current_balance REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS case_fees (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  total_fees REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  remaining REAL NOT NULL DEFAULT 0,
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
  amount REAL NOT NULL,
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
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
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
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  payment_id TEXT REFERENCES payments(id),
  client_id TEXT REFERENCES clients(id),
  amount REAL NOT NULL,
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
  amount REAL NOT NULL,
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
  amount REAL NOT NULL,
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
  amount REAL NOT NULL,
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

CREATE TABLE IF NOT EXISTS local_sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON local_sync_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS legacy_import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  entity_hint TEXT,
  payload_json TEXT NOT NULL,
  mapped_table TEXT,
  mapped_id TEXT,
  link_status TEXT NOT NULL DEFAULT 'linked',
  created_at TEXT NOT NULL,
  UNIQUE (source_file, source_row)
);

CREATE INDEX IF NOT EXISTS idx_legacy_import_batch ON legacy_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_legacy_import_mapped ON legacy_import_rows(mapped_table, mapped_id);

CREATE TABLE IF NOT EXISTS legacy_import_entities (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (batch_id, table_name, record_id)
);

CREATE TABLE IF NOT EXISTS legal_indexes (
  id TEXT PRIMARY KEY,
  codes TEXT,
  number TEXT,
  year TEXT,
  entity TEXT,
  classification TEXT,
  subject TEXT,
  source_row INTEGER,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_indexes_number ON legal_indexes(number);

CREATE TABLE IF NOT EXISTS lookup_values (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (kind, value)
);
` + PERFORMANCE_INDEXES

export const SYNC_TABLES = [
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'user_permissions',
  'settings',
  'number_sequences',
  'clients',
  'client_contacts',
  'lawyers',
  'employees',
  'attendance',
  'leaves',
  'opponents',
  'case_types',
  'cases',
  'case_links',
  'case_opponents',
  'case_clients',
  'hearings',
  'appointments',
  'tasks',
  'reminders',
  'notifications',
  'documents',
  'document_versions',
  'power_of_attorney',
  'contracts',
  'consultations',
  'correspondence',
  'cashboxes',
  'case_fees',
  'payments',
  'invoices',
  'invoice_items',
  'receipts',
  'vouchers',
  'expense_categories',
  'expenses',
  'cashbox_transactions',
  'audit_logs',
  'lookup_values'
] as const

export const NUMBERED_TABLES: Record<string, string> = {
  clients: 'client',
  cases: 'case',
  invoices: 'invoice',
  receipts: 'receipt',
  vouchers: 'voucher',
  payments: 'payment',
  expenses: 'expense',
  power_of_attorney: 'poa',
  contracts: 'contract',
  correspondence: 'correspondence'
}

export const CASE_TYPE_SEEDS = [
  'جنائي', 'مدني', 'تجاري', 'عمالي', 'أحوال شخصية', 'أسرة', 'إيجارات', 'عقارات',
  'شركات', 'ضرائب', 'بنوك', 'تأمين', 'إداري', 'دستوري', 'دولي', 'ملكية فكرية',
  'إلكتروني / Cyber Crime', 'قضايا شيكات', 'قضايا نصب', 'قضايا تعويضات', 'قضايا تنفيذ', 'قضايا أخرى'
]

export const EXPENSE_CATEGORY_SEEDS = [
  'إيجار', 'كهرباء', 'مياه', 'إنترنت', 'رواتب', 'مواصلات', 'رسوم محاكم',
  'رسوم حكومية', 'طباعة', 'مستلزمات مكتبية', 'صيانة', 'تسويق', 'مصروفات أخرى'
]
