import { z } from 'zod'

export const msg = {
  required: 'هذا الحقل مطلوب',
  phone: 'رقم الهاتف غير صالح',
  nationalId: 'الرقم القومي يجب أن يتكون من 14 رقماً',
  email: 'البريد الإلكتروني غير صالح',
  min6: 'يجب ألا يقل عن 6 أحرف',
  amount: 'المبلغ يجب أن يكون أكبر من صفر',
  date: 'التاريخ غير صالح'
}

const empty = (v: unknown) => v === '' || v === undefined || v === null
export const optStr = z.preprocess((v) => (empty(v) ? undefined : v), z.string().optional())
export const optNum = z.preprocess((v) => (empty(v) ? undefined : Number(v)), z.number().optional())
export const reqStr = z.string({ required_error: msg.required }).trim().min(1, msg.required)
export const reqNum = z.coerce.number({ required_error: msg.required, invalid_type_error: msg.required })
export const reqRoleId = z.preprocess((v) => (empty(v) ? undefined : Number(v)), z.number({ required_error: msg.required }).int().positive(msg.required))
export const optPassword = z.preprocess((v) => (empty(v) ? undefined : v), z.string().min(6, msg.min6).optional())
export const activeFlag = z.preprocess((v) => {
  if (v === false || v === 0 || v === '0') return 0
  if (empty(v)) return 1
  return 1
}, z.number())

const phoneRe = /^(01[0-2,5][0-9]{8}|0[2-9][0-9]{7,8}|\+?[1-9][0-9]{7,14})?$/

export const phoneSchema = z.preprocess(
  (v) => (empty(v) ? undefined : String(v).trim()),
  z.string().regex(phoneRe, msg.phone).optional()
)

export const nationalIdSchema = z.preprocess((v) => {
  if (empty(v)) return undefined
  return String(v).trim()
}, z.string().regex(/^\d{14}$/, msg.nationalId).optional())

export const emailSchema = z.preprocess(
  (v) => (empty(v) ? undefined : String(v).trim()),
  z.string().email(msg.email).optional()
)

export const clientSchema = z.object({
  full_name: reqStr,
  trade_name: optStr,
  national_id: nationalIdSchema,
  phone: phoneSchema,
  phone2: phoneSchema,
  whatsapp: phoneSchema,
  email: emailSchema,
  address: optStr,
  governorate: optStr,
  district: optStr,
  client_type: optStr,
  profession: optStr,
  birth_date: optStr,
  extra_data: optStr,
  notes: optStr,
  commercial_register: optStr,
  tax_id: optStr,
  manager_name: optStr,
  contacts: z.array(z.object({ name: reqStr, position: optStr, phone: phoneSchema, email: emailSchema })).optional()
})

export const clientUpdateSchema = clientSchema

export const caseSchema = z.object({
  title: reqStr,
  client_id: reqNum,
  primary_lawyer_id: optNum,
  assistant_lawyer_id: optNum,
  case_type_id: optNum,
  category: optStr,
  court: optStr,
  circuit: optStr,
  governorate: optStr,
  court_address: optStr,
  circuit_number: optStr,
  litigation_degree: optStr,
  filing_date: optStr,
  received_date: optStr,
  status: optStr,
  case_value: optNum,
  opponent_name: optStr,
  opponent_lawyer: optStr,
  opponent_case_number: optStr,
  internal_file_number: optStr,
  description: optStr,
  summary: optStr,
  notes: optStr,
  total_fees: optNum,
  fees_due_date: optStr,
  payment_method: optStr,
  installment_count: optNum,
  related_case_id: optNum,
  link_type: optStr
})

export const hearingSchema = z.object({
  case_id: reqNum,
  hearing_date: reqStr,
  hearing_time: optStr,
  hearing_type: optStr,
  lawyer_id: optNum,
  status: optStr,
  result: optStr,
  court_decision: optStr,
  postponement_reason: optStr,
  next_hearing_date: optStr,
  what_happened: optStr,
  required_documents: optStr,
  next_actions: optStr,
  notes: optStr
})

export const taskSchema = z.object({
  title: reqStr,
  description: optStr,
  assignee_id: optNum,
  case_id: optNum,
  client_id: optNum,
  start_date: optStr,
  due_date: optStr,
  priority: optStr,
  status: optStr,
  progress: optNum
})

export const reminderSchema = z.object({
  title: reqStr,
  reminder_type: optStr,
  remind_at: reqStr,
  notify_before_minutes: optNum,
  priority: optStr,
  assignee_id: optNum,
  case_id: optNum,
  client_id: optStr,
  notes: optStr
}).extend({
  client_id: optNum
})

export const appointmentSchema = z.object({
  title: reqStr,
  appointment_type: optStr,
  client_id: optNum,
  lawyer_id: optNum,
  case_id: optNum,
  date: reqStr,
  time: optStr,
  location: optStr,
  purpose: optStr,
  notes: optStr,
  status: optStr
})

export const paymentSchema = z.object({
  client_id: optNum,
  case_id: optNum,
  amount: z.coerce.number().positive(msg.amount),
  payment_type: optStr,
  payment_method: optStr,
  cashbox_id: optNum,
  payment_date: optStr,
  due_date: optStr,
  notes: optStr
}).refine((d) => Boolean(d.client_id || d.case_id), { message: 'لا يمكن تسجيل دفعة بدون عميل أو قضية', path: ['client_id'] })

export const expenseSchema = z.object({
  category_id: optNum,
  amount: z.coerce.number().positive(msg.amount),
  cashbox_id: optNum,
  expense_date: optStr,
  client_id: optNum,
  case_id: optNum,
  description: optStr,
  notes: optStr
})

export const userCreateSchema = z.object({
  username: reqStr,
  password: z.string().min(6, msg.min6),
  full_name: reqStr,
  email: emailSchema,
  phone: phoneSchema,
  role_id: reqRoleId,
  is_active: activeFlag.optional()
})

export const userUpdateSchema = z.object({
  username: optStr,
  password: optPassword,
  full_name: reqStr,
  email: emailSchema,
  phone: phoneSchema,
  role_id: reqRoleId,
  is_active: activeFlag.optional()
})

export const userFormSchema = z.object({
  username: reqStr,
  password: optPassword,
  full_name: reqStr,
  email: emailSchema,
  phone: phoneSchema,
  role_id: reqRoleId,
  is_active: z.any().optional()
})

export const loginSchema = z.object({
  username: reqStr,
  password: z.string().min(1, msg.required)
})

export const passwordChangeSchema = z.object({
  current: z.string().min(1, msg.required),
  next: z.string().min(6, msg.min6)
})

export const lawyerSchema = z.object({
  full_name: reqStr,
  user_id: optNum,
  bar_number: optStr,
  specialization: optStr,
  phone: phoneSchema,
  email: emailSchema,
  hire_date: optStr,
  status: optStr,
  notes: optStr,
  photo_path: optStr
})

export const employeeSchema = z.object({
  full_name: reqStr,
  user_id: optNum,
  job_title: optStr,
  department: optStr,
  salary: optNum,
  hire_date: optStr,
  phone: phoneSchema,
  email: emailSchema,
  status: optStr,
  notes: optStr
})

export const attendanceSchema = z.object({
  employee_id: reqNum,
  date: reqStr,
  check_in: optStr,
  check_out: optStr,
  status: optStr,
  notes: optStr
})

export const leaveSchema = z.object({
  employee_id: reqNum,
  leave_type: reqStr,
  start_date: reqStr,
  end_date: reqStr,
  status: optStr,
  notes: optStr
})

export const opponentSchema = z.object({
  full_name: reqStr,
  national_id: nationalIdSchema,
  phone: phoneSchema,
  address: optStr,
  lawyer_name: optStr,
  extra_data: optStr,
  notes: optStr,
  case_id: optNum
})

export const poaSchema = z.object({
  poa_type: optStr,
  client_id: optNum,
  lawyer_id: optNum,
  issuing_authority: optStr,
  issue_date: optStr,
  expiry_date: optStr,
  status: optStr,
  notes: optStr
})

export const contractSchema = z.object({
  title: reqStr,
  client_id: optNum,
  contract_type: optStr,
  start_date: optStr,
  end_date: optStr,
  value: optNum,
  status: optStr,
  lawyer_id: optNum,
  notes: optStr
})

export const consultationSchema = z.object({
  client_id: optNum,
  lawyer_id: optNum,
  consultation_date: optStr,
  consultation_type: optStr,
  subject: optStr,
  details: optStr,
  recommendations: optStr,
  fees: optNum,
  payment_status: optStr,
  notes: optStr
})

export const correspondenceSchema = z.object({
  direction: optStr,
  correspondence_type: optStr,
  date: optStr,
  party: optStr,
  subject: optStr,
  responsible_user_id: optNum,
  case_id: optNum,
  client_id: optNum,
  notes: optStr
})

export const documentMetaSchema = z.object({
  title: reqStr,
  category: optStr,
  client_id: optNum,
  case_id: optNum,
  hearing_id: optNum,
  contract_id: optNum,
  notes: optStr
})

export const invoiceSchema = z.object({
  client_id: z.preprocess((v) => (empty(v) ? undefined : Number(v)), z.number({ required_error: 'يجب اختيار العميل' }).positive()),
  case_id: optNum,
  invoice_date: optStr,
  due_date: optStr,
  tax: optNum,
  notes: optStr,
  items: z.array(z.object({
    description: reqStr,
    quantity: z.coerce.number().positive(),
    unit_price: z.coerce.number().min(0)
  })).min(1, 'أضف بندًا واحدًا على الأقل')
})

export const contactSchema = z.object({
  name: reqStr,
  position: optStr,
  phone: phoneSchema,
  email: emailSchema
})

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.filter((p) => p !== undefined).join('.') || '_root'
    if (!out[key]) out[key] = issue.message
  }
  return out
}

export class ValidationError extends Error {
  fieldErrors: Record<string, string>
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
  }
}

export function parseSchema<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const fieldErrors = fieldErrorsFromZod(result.error)
    throw new ValidationError(result.error.issues[0]?.message || 'بيانات غير صالحة', fieldErrors)
  }
  return result.data
}
