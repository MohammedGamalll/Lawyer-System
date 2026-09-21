import { notDeleted } from '../db/ids'

export function casePrintSelectSql(cs = 'cs'): string {
  return `
              ${cs}.case_number, ${cs}.office_case_number, ${cs}.case_year, ${cs}.internal_file_number,
              ${cs}.title as case_title,
              ${cs}.court as court, ${cs}.court as court_name,
              ${cs}.circuit, ${cs}.circuit_number, ${cs}.session_place,
              ${cs}.litigation_degree,
              ${cs}.police_station as case_police_station,
              ${cs}.first_instance_number, ${cs}.first_instance_year,
              ${cs}.appeal_number, ${cs}.appeal_year,
              ${cs}.cassation_number, ${cs}.cassation_year,
              ${cs}.extra_ref_type, ${cs}.extra_ref_number,
              ${cs}.extra_ref2_type, ${cs}.extra_ref2_number,
              ${cs}.extra_ref3_type, ${cs}.extra_ref3_number,
              ${cs}.category,
              ${cs}.judgment_date as case_judgment_date,
              ${cs}.judgment_text as case_judgment_text,
              ct.name_ar as case_type_name, ct.name_ar as case_type,
              COALESCE(
                NULLIF(TRIM(${cs}.opponent_name), ''),
                (SELECT ox.full_name FROM case_opponents xo
                 JOIN opponents ox ON ox.id = xo.opponent_id
                 WHERE xo.case_id = ${cs}.id AND ${notDeleted('xo')} AND ${notDeleted('ox')}
                 ORDER BY IFNULL(xo.sort_order, 0) LIMIT 1)
              ) as opponent_name,
              COALESCE(
                NULLIF(TRIM(${cs}.opponent_capacity_first), ''),
                (SELECT xo.capacity_first FROM case_opponents xo
                 WHERE xo.case_id = ${cs}.id AND ${notDeleted('xo')}
                 ORDER BY IFNULL(xo.sort_order, 0) LIMIT 1)
              ) as opponent_capacity_first,
              COALESCE(
                NULLIF(TRIM(${cs}.opponent_capacity_appeal), ''),
                (SELECT xo.capacity_appeal FROM case_opponents xo
                 WHERE xo.case_id = ${cs}.id AND ${notDeleted('xo')}
                 ORDER BY IFNULL(xo.sort_order, 0) LIMIT 1)
              ) as opponent_capacity_appeal,
              COALESCE(
                NULLIF(TRIM(${cs}.opponent_capacity_cassation), ''),
                (SELECT xo.capacity_cassation FROM case_opponents xo
                 WHERE xo.case_id = ${cs}.id AND ${notDeleted('xo')}
                 ORDER BY IFNULL(xo.sort_order, 0) LIMIT 1)
              ) as opponent_capacity_cassation,
              (
                SELECT ox.address FROM case_opponents xo
                JOIN opponents ox ON ox.id = xo.opponent_id
                WHERE xo.case_id = ${cs}.id AND ${notDeleted('xo')} AND ${notDeleted('ox')}
                ORDER BY IFNULL(xo.sort_order, 0) LIMIT 1
              ) as opponent_address,
              (
                SELECT ox.phone FROM case_opponents xo
                JOIN opponents ox ON ox.id = xo.opponent_id
                WHERE xo.case_id = ${cs}.id AND ${notDeleted('xo')} AND ${notDeleted('ox')}
                ORDER BY IFNULL(xo.sort_order, 0) LIMIT 1
              ) as opponent_phone,
              COALESCE(
                (SELECT cc.capacity_first FROM case_clients cc
                 WHERE cc.case_id = ${cs}.id AND IFNULL(cc.is_primary,0)=1 AND ${notDeleted('cc')} LIMIT 1),
                (SELECT cc.capacity_first FROM case_clients cc
                 WHERE cc.case_id = ${cs}.id AND ${notDeleted('cc')} ORDER BY cc.sort_order LIMIT 1)
              ) as client_capacity_first,
              COALESCE(
                (SELECT cc.capacity_appeal FROM case_clients cc
                 WHERE cc.case_id = ${cs}.id AND IFNULL(cc.is_primary,0)=1 AND ${notDeleted('cc')} LIMIT 1),
                (SELECT cc.capacity_appeal FROM case_clients cc
                 WHERE cc.case_id = ${cs}.id AND ${notDeleted('cc')} ORDER BY cc.sort_order LIMIT 1)
              ) as client_capacity_appeal,
              COALESCE(
                (SELECT cc.capacity_cassation FROM case_clients cc
                 WHERE cc.case_id = ${cs}.id AND IFNULL(cc.is_primary,0)=1 AND ${notDeleted('cc')} LIMIT 1),
                (SELECT cc.capacity_cassation FROM case_clients cc
                 WHERE cc.case_id = ${cs}.id AND ${notDeleted('cc')} ORDER BY cc.sort_order LIMIT 1)
              ) as client_capacity_cassation`
}

export function casePrintJoinSql(caseIdExpr: string): string {
  return `
       LEFT JOIN cases cs ON cs.id = ${caseIdExpr} AND ${notDeleted('cs')}
       LEFT JOIN case_types ct ON ct.id = cs.case_type_id AND ${notDeleted('ct')}`
}

function nz(v: unknown) {
  const s = String(v ?? '').trim()
  return s && s !== '—' ? s : ''
}

function joinCaps(...vals: unknown[]) {
  return vals.map(nz).filter(Boolean).join(' / ')
}

function systemCode(row: Record<string, unknown>) {
  const cn = String(row.case_number ?? '')
  if (/^CS-/i.test(cn)) return cn.replace(/^(CS|CL)-/i, '')
  const internal = String(row.internal_file_number ?? '').trim()
  return (internal || cn).replace(/^(CS|CL)-/i, '')
}

export function enrichPrintRow(row: Record<string, unknown>): Record<string, unknown> {
  const client_capacity = joinCaps(
    row.client_capacity_first || row.capacity_first,
    row.client_capacity_appeal || row.capacity_appeal,
    row.client_capacity_cassation || row.capacity_cassation
  )
  const opponent_capacity = joinCaps(
    row.opponent_capacity_first,
    row.opponent_capacity_appeal,
    row.opponent_capacity_cassation
  )
  const hasFirst = Boolean(nz(row.first_instance_number))
  return {
    ...row,
    system_code: nz(row.system_code) || systemCode(row),
    court_name: nz(row.court_name) || nz(row.court),
    case_type: nz(row.case_type) || nz(row.case_type_name) || nz(row.category),
    case_subject: nz(row.case_title) || nz(row.case_subject) || nz(row.task_subject),
    required_action: nz(row.required_action) || nz(row.description) || nz(row.title),
    client_capacity,
    opponent_capacity,
    first_instance_number: hasFirst ? row.first_instance_number : row.office_case_number,
    first_instance_year: hasFirst ? row.first_instance_year : row.case_year,
    police_station: nz(row.police_station) || nz(row.case_police_station),
    judgment_date: nz(row.judgment_date) || nz(row.case_judgment_date),
    judgment_text: nz(row.judgment_text) || nz(row.case_judgment_text)
  }
}

export function enrichPrintRows(rows: unknown[]): Record<string, unknown>[] {
  return (rows as Record<string, unknown>[]).map(enrichPrintRow)
}
