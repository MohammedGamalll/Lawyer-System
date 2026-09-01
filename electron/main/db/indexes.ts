export const PERFORMANCE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_cases_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_cases_office_number ON cases(office_case_number);
CREATE INDEX IF NOT EXISTS idx_cases_year ON cases(case_year);
CREATE INDEX IF NOT EXISTS idx_cases_first_instance ON cases(first_instance_number);
CREATE INDEX IF NOT EXISTS idx_cases_appeal ON cases(appeal_number);
CREATE INDEX IF NOT EXISTS idx_cases_cassation ON cases(cassation_number);
CREATE INDEX IF NOT EXISTS idx_cases_category ON cases(category);
CREATE INDEX IF NOT EXISTS idx_cases_filing ON cases(filing_date);
CREATE INDEX IF NOT EXISTS idx_cases_archived ON cases(is_archived, deleted_at);
CREATE INDEX IF NOT EXISTS idx_clients_nickname ON clients(nickname);
CREATE INDEX IF NOT EXISTS idx_clients_deleted ON clients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_opponents_name ON opponents(full_name);
CREATE INDEX IF NOT EXISTS idx_opponents_national ON opponents(national_id);
CREATE INDEX IF NOT EXISTS idx_opponents_nickname ON opponents(nickname);
CREATE INDEX IF NOT EXISTS idx_opponents_deleted ON opponents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_hearings_venue ON hearings(venue);
CREATE INDEX IF NOT EXISTS idx_hearings_deleted ON hearings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_case ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_venue ON tasks(venue);
CREATE INDEX IF NOT EXISTS idx_tasks_work_kind ON tasks(work_kind);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_case_clients_case ON case_clients(case_id, client_id);
CREATE INDEX IF NOT EXISTS idx_case_opponents_case ON case_opponents(case_id, opponent_id);
`
