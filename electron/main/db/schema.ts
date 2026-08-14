export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  module TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  last_login_device TEXT,
  avatar_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  device_info TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  success INTEGER NOT NULL,
  device_info TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS number_sequences (
  name TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT '',
  current_value INTEGER NOT NULL DEFAULT 0,
  padding INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(full_name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_national ON clients(national_id);

CREATE TABLE IF NOT EXISTS client_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS lawyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  full_name TEXT NOT NULL,
  photo_path TEXT,
  bar_number TEXT,
  specialization TEXT,
  phone TEXT,
  email TEXT,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  salary REAL,
  hire_date TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS opponents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  national_id TEXT,
  phone TEXT,
  address TEXT,
  lawyer_name TEXT,
  extra_data TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number TEXT NOT NULL UNIQUE,
  internal_file_number TEXT,
  title TEXT NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  primary_lawyer_id INTEGER REFERENCES lawyers(id),
  assistant_lawyer_id INTEGER REFERENCES lawyers(id),
  case_type_id INTEGER REFERENCES case_types(id),
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
  created_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_lawyer ON cases(primary_lawyer_id);

CREATE TABLE IF NOT EXISTS case_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  related_case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_opponents (
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  opponent_id INTEGER NOT NULL REFERENCES opponents(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, opponent_id)
);

CREATE TABLE IF NOT EXISTS hearings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id),
  hearing_date TEXT NOT NULL,
  hearing_time TEXT,
  hearing_type TEXT,
  lawyer_id INTEGER REFERENCES lawyers(id),
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
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hearings_date ON hearings(hearing_date);
CREATE INDEX IF NOT EXISTS idx_hearings_case ON hearings(case_id);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  appointment_type TEXT NOT NULL DEFAULT 'client',
  client_id INTEGER REFERENCES clients(id),
  lawyer_id INTEGER REFERENCES lawyers(id),
  case_id INTEGER REFERENCES cases(id),
  date TEXT NOT NULL,
  time TEXT,
  location TEXT,
  purpose TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id INTEGER REFERENCES users(id),
  case_id INTEGER REFERENCES cases(id),
  client_id INTEGER REFERENCES clients(id),
  start_date TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_type TEXT NOT NULL,
  title TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  notify_before_minutes INTEGER NOT NULL DEFAULT 60,
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee_id INTEGER REFERENCES users(id),
  case_id INTEGER REFERENCES cases(id),
  client_id INTEGER REFERENCES clients(id),
  related_type TEXT,
  related_id INTEGER,
  is_sent INTEGER NOT NULL DEFAULT 0,
  is_dismissed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  related_type TEXT,
  related_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  client_id INTEGER REFERENCES clients(id),
  case_id INTEGER REFERENCES cases(id),
  hearing_id INTEGER REFERENCES hearings(id),
  contract_id INTEGER,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  current_version INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS power_of_attorney (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poa_number TEXT NOT NULL UNIQUE,
  poa_type TEXT,
  client_id INTEGER REFERENCES clients(id),
  lawyer_id INTEGER REFERENCES lawyers(id),
  issuing_authority TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  document_id INTEGER REFERENCES documents(id),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  contract_type TEXT,
  start_date TEXT,
  end_date TEXT,
  value REAL,
  status TEXT NOT NULL DEFAULT 'active',
  lawyer_id INTEGER REFERENCES lawyers(id),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  lawyer_id INTEGER REFERENCES lawyers(id),
  consultation_date TEXT,
  consultation_type TEXT,
  subject TEXT,
  details TEXT,
  recommendations TEXT,
  fees REAL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS correspondence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correspondence_number TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL DEFAULT 'outgoing',
  correspondence_type TEXT NOT NULL DEFAULT 'letter',
  date TEXT,
  party TEXT,
  subject TEXT,
  responsible_user_id INTEGER REFERENCES users(id),
  case_id INTEGER REFERENCES cases(id),
  client_id INTEGER REFERENCES clients(id),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cashboxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'office',
  current_balance REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS case_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  total_fees REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  remaining REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  payment_method TEXT,
  installment_count INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_number TEXT NOT NULL UNIQUE,
  client_id INTEGER REFERENCES clients(id),
  case_id INTEGER REFERENCES cases(id),
  amount REAL NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'fees',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  cashbox_id INTEGER REFERENCES cashboxes(id),
  payment_date TEXT,
  due_date TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  client_id INTEGER REFERENCES clients(id),
  case_id INTEGER REFERENCES cases(id),
  invoice_date TEXT,
  due_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,
  payment_id INTEGER REFERENCES payments(id),
  client_id INTEGER REFERENCES clients(id),
  amount REAL NOT NULL,
  receipt_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_number TEXT NOT NULL UNIQUE,
  voucher_type TEXT NOT NULL,
  amount REAL NOT NULL,
  cashbox_id INTEGER REFERENCES cashboxes(id),
  related_id INTEGER,
  voucher_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_number TEXT NOT NULL UNIQUE,
  category_id INTEGER REFERENCES expense_categories(id),
  amount REAL NOT NULL,
  cashbox_id INTEGER REFERENCES cashboxes(id),
  expense_date TEXT,
  client_id INTEGER REFERENCES clients(id),
  case_id INTEGER REFERENCES cases(id),
  description TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cashbox_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashbox_id INTEGER NOT NULL REFERENCES cashboxes(id),
  transaction_type TEXT NOT NULL,
  amount REAL NOT NULL,
  related_type TEXT,
  related_id INTEGER,
  description TEXT,
  transaction_date TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  description TEXT,
  old_values TEXT,
  new_values TEXT,
  device_info TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`

export const CASE_TYPE_SEEDS = [
  'جنائي', 'مدني', 'تجاري', 'عمالي', 'أحوال شخصية', 'أسرة', 'إيجارات', 'عقارات',
  'شركات', 'ضرائب', 'بنوك', 'تأمين', 'إداري', 'دستوري', 'دولي', 'ملكية فكرية',
  'إلكتروني / Cyber Crime', 'قضايا شيكات', 'قضايا نصب', 'قضايا تعويضات', 'قضايا تنفيذ', 'قضايا أخرى'
]

export const EXPENSE_CATEGORY_SEEDS = [
  'إيجار', 'كهرباء', 'مياه', 'إنترنت', 'رواتب', 'مواصلات', 'رسوم محاكم',
  'رسوم حكومية', 'طباعة', 'مستلزمات مكتبية', 'صيانة', 'تسويق', 'مصروفات أخرى'
]
