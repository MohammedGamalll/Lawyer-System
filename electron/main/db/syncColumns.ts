import { SYNC_TABLES } from './schema'

/** Columns the remote PostgREST API must expose for each synced table. */
export const EXPECTED_SYNC_COLUMNS: Record<(typeof SYNC_TABLES)[number], string[]> = {
  roles: ['id', 'code', 'name_ar', 'name_en', 'is_system', 'created_at', 'updated_at', 'deleted_at'],
  permissions: ['id', 'code', 'name_ar', 'name_en', 'module', 'created_at', 'updated_at', 'deleted_at'],
  role_permissions: ['id', 'role_id', 'permission_id', 'created_at', 'updated_at', 'deleted_at'],
  users: ['id', 'username', 'password_hash', 'full_name', 'email', 'phone', 'role_id', 'is_active', 'created_at', 'updated_at', 'deleted_at'],
  user_permissions: ['id', 'user_id', 'permission_id', 'granted', 'created_at', 'updated_at', 'deleted_at'],
  settings: ['key', 'value', 'updated_at', 'deleted_at'],
  number_sequences: ['name', 'prefix', 'current_value', 'padding', 'updated_at', 'deleted_at'],
  clients: [
    'id', 'client_number', 'full_name', 'nickname', 'national_id', 'id_kind', 'phone', 'created_at', 'updated_at', 'deleted_at'
  ],
  client_contacts: ['id', 'client_id', 'name', 'created_at', 'updated_at', 'deleted_at'],
  lawyers: ['id', 'full_name', 'national_id', 'sort_order', 'created_at', 'updated_at', 'deleted_at'],
  employees: ['id', 'full_name', 'national_id', 'created_at', 'updated_at', 'deleted_at'],
  attendance: ['id', 'employee_id', 'date', 'created_at', 'updated_at', 'deleted_at'],
  leaves: ['id', 'employee_id', 'start_date', 'end_date', 'created_at', 'updated_at', 'deleted_at'],
  opponents: [
    'id', 'full_name', 'nickname', 'id_kind', 'lawyer_phone', 'is_blacklisted', 'created_at', 'updated_at', 'deleted_at'
  ],
  case_types: ['id', 'name_ar', 'created_at', 'updated_at', 'deleted_at'],
  cases: [
    'id',
    'case_number',
    'office_case_number',
    'case_year',
    'session_place',
    'extra_ref2_type',
    'extra_ref2_number',
    'extra_ref3_type',
    'extra_ref3_number',
    'police_station',
    'judgment_date',
    'opponent_capacity_first',
    'created_at',
    'updated_at',
    'deleted_at'
  ],
  case_links: ['id', 'case_id', 'related_case_id', 'link_type', 'created_at', 'updated_at', 'deleted_at'],
  case_opponents: [
    'id', 'case_id', 'opponent_id', 'capacity_first', 'capacity_appeal', 'capacity_cassation', 'sort_order', 'created_at', 'updated_at', 'deleted_at'
  ],
  case_clients: ['id', 'case_id', 'client_id', 'is_primary', 'created_at', 'updated_at', 'deleted_at'],
  hearings: [
    'id', 'case_id', 'hearing_date', 'venue', 'previous_decision', 'expert_name', 'expert_office', 'created_at', 'updated_at', 'deleted_at'
  ],
  expert_hearings: [
    'id', 'case_id', 'hearing_date', 'venue', 'expert_office', 'expert_name', 'created_at', 'updated_at', 'deleted_at'
  ],
  appointments: ['id', 'title', 'date', 'created_at', 'updated_at', 'deleted_at'],
  tasks: [
    'id',
    'title',
    'venue',
    'case_subject',
    'work_kind',
    'hearing_id',
    'execution_kind',
    'notes',
    'opponent_address',
    'created_at',
    'updated_at',
    'deleted_at'
  ],
  reminders: ['id', 'title', 'remind_at', 'created_at', 'updated_at', 'deleted_at'],
  notifications: ['id', 'title', 'created_at', 'updated_at', 'deleted_at'],
  documents: ['id', 'title', 'opponent_id', 'lawyer_id', 'employee_id', 'created_at', 'updated_at', 'deleted_at'],
  document_versions: ['id', 'document_id', 'version', 'created_at', 'updated_at', 'deleted_at'],
  power_of_attorney: ['id', 'poa_number', 'poa_year', 'poa_letter', 'poa_office', 'created_at', 'updated_at', 'deleted_at'],
  contracts: ['id', 'contract_number', 'title', 'created_at', 'updated_at', 'deleted_at'],
  consultations: ['id', 'created_at', 'updated_at', 'deleted_at'],
  correspondence: ['id', 'created_at', 'updated_at', 'deleted_at'],
  cashboxes: ['id', 'created_at', 'updated_at', 'deleted_at'],
  case_fees: ['id', 'case_id', 'created_at', 'updated_at', 'deleted_at'],
  payments: ['id', 'created_at', 'updated_at', 'deleted_at'],
  case_dues: ['id', 'case_id', 'amount', 'due_type', 'created_at', 'updated_at', 'deleted_at'],
  invoices: ['id', 'invoice_number', 'created_at', 'updated_at', 'deleted_at'],
  invoice_items: ['id', 'invoice_id', 'created_at', 'updated_at', 'deleted_at'],
  receipts: ['id', 'created_at', 'updated_at', 'deleted_at'],
  vouchers: ['id', 'created_at', 'updated_at', 'deleted_at'],
  expense_categories: ['id', 'name_ar', 'created_at', 'updated_at', 'deleted_at'],
  expenses: ['id', 'created_at', 'updated_at', 'deleted_at'],
  cashbox_transactions: ['id', 'created_at', 'updated_at', 'deleted_at'],
  audit_logs: ['id', 'action', 'created_at', 'updated_at', 'deleted_at'],
  lookup_values: ['id', 'kind', 'value', 'sort_order', 'created_at', 'updated_at', 'deleted_at']
}
