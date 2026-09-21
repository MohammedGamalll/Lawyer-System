import { describe, expect, it } from 'vitest'
import {
  adminTasksRollTableHtml,
  executionTasksRollTableHtml,
  hearingRollTableHtml,
  stripPlacePrefix
} from '../src/lib/printKit'
import { buildPrintHtml } from '../electron/main/services/printHtml'

const t = (k: string, opts?: Record<string, string>) => {
  const map: Record<string, string> = {
    'printKit.courtAndCircuit': 'المحكمة والدائرة',
    'printKit.caseNumber': 'رقم القضية',
    'printKit.caseTypeCol': 'نوع القضية',
    'printKit.clientAndCapacity': 'الموكل وصفته',
    'printKit.opponentAndCapacity': 'الخصم وصفته',
    'printKit.decision': 'القرار',
    'printKit.requiredAction': 'الاجراء المطلوب',
    'printKit.professor': 'الأستاذ',
    'printKit.expertNameLine': 'اسم الخبير',
    'printKit.sifaNumber': 'رقم الصفة',
    'printKit.hearingsLedger': 'كشف جلسات المحكمة',
    'printKit.adminLedger': 'سجل الأعمال الإدارية',
    'printKit.executionLedger': 'سجل الأعمال التنفيذية',
    'printKit.addressCol': 'العنوان',
    'printKit.hasrType': 'نوع الحصر',
    'printKit.hasrNumber': 'رقم الحصر',
    'fields.execution_number': 'رقم التنفيذ',
    'fields.execution_officer': 'معاون التنفيذ',
    'fields.judgment_date': 'تاريخ الحكم',
    'fields.judgment_text': 'منطوق الحكم',
    'nav.hearings': 'الجلسات',
    'nav.tasks': 'الإداري',
    noData: 'لا توجد بيانات'
  }
  let s = map[k] || k
  if (k === 'printKit.hearingsDay') {
    s = `جلسات يوم ${opts?.day || ''} ${opts?.date || ''} ${opts?.place || ''}`
  }
  if (k === 'printKit.hearingsSheet') {
    s = `جلسات يوم ${opts?.day || ''} ${opts?.date || ''}`
  }
  if (k === 'printKit.adminDay') {
    s = `أعمال إدارية يوم ${opts?.day || ''} ${opts?.date || ''}`
  }
  if (k === 'printKit.executionDay') {
    s = `أعمال تنفيذية يوم ${opts?.day || ''} ${opts?.date || ''}`
  }
  return s.replace(/\s+/g, ' ').trim()
}

describe('hearing roll print', () => {
  it('strips محكمة and شرطة from place names', () => {
    expect(stripPlacePrefix('محكمة جنوب الجيزة')).toBe('جنوب الجيزة')
    expect(stripPlacePrefix('قسم شرطة الهرم')).toBe('قسم الهرم')
    expect(stripPlacePrefix('مركز شرطة بنها')).toBe('مركز بنها')
  })

  it('builds rtl six-column table with expert name under opponent', () => {
    const { html, sheetTitle } = hearingRollTableHtml(
      [
        {
          hearing_date: '2026-10-05',
          hearing_type: 'جلسة خبير',
          court: 'محكمة جنوب الجيزة',
          client_name: 'ايمان ناصف محمد',
          opponent_name: 'عطالله علي احمد',
          previous_decision: 'حافظة مستندات',
          court_decision: 'تأجيل للمرافعة',
          expert_name: 'محمد الخبير',
          case_type: 'مدني',
          case_title: 'مطالبة بمبلغ',
          system_code: '07001'
        }
      ],
      t,
      'ar'
    )
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('class="hearings-roll"')
    expect(html).toContain('المحكمة والدائرة')
    expect(html).toContain('القرار')
    expect(html).toContain('جنوب الجيزة')
    expect(html).not.toContain('محكمة جنوب')
    expect(html).toContain('اسم الخبير: محمد الخبير')
    expect(html).toContain('حافظة مستندات')
    expect(html).toContain('تأجيل للمرافعة')
    expect(html).toContain('الأستاذ / ........................................................................')
    expect(html).not.toContain('الأستاذ / محمد')
    expect(html).toContain('class="group-header"')
    expect(html).toContain('width:19%')
    expect(html).toContain('width:20%')
    expect(sheetTitle).toContain('جلسات يوم')
    expect(sheetTitle).toContain('2026/10/5')
    expect(sheetTitle).not.toContain('جنوب الجيزة')
  })

  it('keeps one table and uses a generic title when dates differ', () => {
    const { html, sheetTitle } = hearingRollTableHtml(
      [
        { hearing_date: '2026-10-01', court: 'جنوب القاهرة', client_name: 'أ' },
        { hearing_date: '2026-10-05', court: 'جنوب الجيزة', client_name: 'ب' }
      ],
      t,
      'ar'
    )
    expect(html.match(/class="hearings-roll"/g)?.length).toBe(1)
    expect(html.match(/<thead>/g)?.length).toBe(1)
    expect(html.match(/class="group-header"/g)?.length).toBe(2)
    expect(html).toContain('جلسات يوم')
    expect(html).not.toContain('<h3 class="hr-group">')
    expect(sheetTitle).toBe('كشف جلسات المحكمة')
  })

  it('uses darker borders, gray thead, top alignment, and cell padding', () => {
    const html = buildPrintHtml({
      title: 'كشف جلسات المحكمة',
      body: '<table class="hearings-roll" dir="rtl"></table>',
      kind: 'report',
      office: 'اسم المكتب',
      layout: 'hearingsRoll'
    })
    expect(html).toContain('hearings-roll-page')
    expect(html).toContain('border-collapse: collapse')
    expect(html).toContain('border: 1px solid #999')
    expect(html).toContain('background-color: #f5f5f5')
    expect(html).toContain('padding: 6px 8px')
    expect(html).toContain('vertical-align: top')
    expect(html).toContain('padding: 2px 0')
    expect(html).toContain('justify-content: space-between')
    expect(html).toContain('text-align: left')
    expect(html).not.toContain('اسم المحامي المستلم')
  })

  it('keeps office phones and print datetime on hearings roll', () => {
    const html = buildPrintHtml({
      title: 'كشف جلسات المحكمة',
      body: '',
      kind: 'report',
      office: 'اسم المكتب',
      phone: '0100 — 0111',
      printedAt: '2026-09-21 09:15',
      layout: 'hearingsRoll'
    })
    expect(html).toContain('0100 — 0111')
    expect(html).toContain('2026-09-21 09:15')
    expect(html).toContain('unicode-bidi: isolate')
    expect(html).toContain('class="muted"')
    expect(html).toContain('class="gold"')
  })

  it('builds an execution roll with address column and execution fields', () => {
    const { html, sheetTitle } = executionTasksRollTableHtml(
      [
        {
          due_date: '2026-10-05',
          venue: 'محكمة جنوب الجيزة',
          police_station: 'قسم شرطة الهرم',
          police_report_kind: 'جنحة',
          police_report_no: '12',
          execution_number: '88',
          execution_officer: 'معاون أول',
          client_name: 'ايمان',
          opponent_name: 'عطالله',
          opponent_address: '25 ش النهضة',
          description: 'ضبط واحضار',
          judgment_date: '2026-09-01',
          judgment_text: 'حبس شهر'
        }
      ],
      t,
      'ar'
    )
    expect(html.match(/class="hearings-roll"/g)?.length).toBe(1)
    expect(html).toContain('العنوان')
    expect(html).toContain('25 ش النهضة')
    expect(html).toContain('ضبط واحضار')
    expect(html).toContain('رقم التنفيذ')
    expect(html).toContain('معاون التنفيذ')
    expect(html).toContain('تاريخ الحكم')
    expect(html).toContain('منطوق الحكم')
    expect(html).toContain('قسم الهرم')
    expect(html).toContain('width:25%')
    expect(sheetTitle).toContain('أعمال تنفيذية يوم')
    expect(sheetTitle).not.toContain('الجيزة')
  })

  it('builds a single admin roll with required-action column', () => {
    const { html, sheetTitle } = adminTasksRollTableHtml(
      [
        {
          due_date: '2026-10-01',
          venue: 'محكمة جنوب القاهرة',
          description: 'إيداع اعلان محضري',
          client_name: 'موكل'
        },
        {
          due_date: '2026-10-01',
          venue: 'محكمة جنوب القاهرة',
          description: 'تجديد',
          client_name: 'موكل 2'
        }
      ],
      t,
      'ar'
    )
    expect(html.match(/class="hearings-roll"/g)?.length).toBe(1)
    expect(html.match(/class="group-header"/g)?.length).toBe(1)
    expect(html).toContain('الاجراء المطلوب')
    expect(html).not.toContain('>القرار<')
    expect(html).toContain('إيداع اعلان محضري')
    expect(html).toContain('جنوب القاهرة')
    expect(html).toContain('أعمال إدارية يوم')
    expect(html).not.toContain('محكمة جنوب')
    expect(sheetTitle).toContain('أعمال إدارية يوم')
    expect(sheetTitle).not.toContain('القاهرة')
  })

  it('prints court numbers as formatted text, not escaped html tags', () => {
    const { html } = adminTasksRollTableHtml(
      [
        {
          due_date: '2025-07-15',
          venue: 'جنوب القاهرة',
          first_instance_number: '4523',
          first_instance_year: '2025',
          office_case_number: '4523',
          case_year: '2025',
          description: 'تصوير قضية'
        }
      ],
      t,
      'ar'
    )
    expect(html).toContain('class="court-number"')
    expect(html).toContain('4523 / 2025')
    expect(html).not.toContain('&lt;span')
    expect(html).not.toContain('&lt;span class=&quot;court-number&quot;')
    expect(html).not.toMatch(/&lt;span class=/)
  })

  it('groups admin tasks by date only even when venues differ', () => {
    const { html } = adminTasksRollTableHtml(
      [
        { due_date: '2026-10-01', venue: 'الهرم', description: 'أ' },
        { due_date: '2026-10-01', venue: 'الجيزة', description: 'ب' }
      ],
      t,
      'ar'
    )
    expect(html.match(/class="group-header"/g)?.length).toBe(1)
  })

  it('uses generic admin ledger title across multiple due dates', () => {
    const { sheetTitle } = adminTasksRollTableHtml(
      [
        { due_date: '2026-10-01', venue: 'الهرم', description: 'أ' },
        { due_date: '2026-10-05', venue: 'الجيزة', description: 'ب' }
      ],
      t,
      'ar'
    )
    expect(sheetTitle).toBe('سجل الأعمال الإدارية')
  })
})
