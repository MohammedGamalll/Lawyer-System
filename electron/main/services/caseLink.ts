import { notDeleted } from '../db/ids'

export function sqlClientOwnsCase(caseAlias = 'c'): string {
  return `(${caseAlias}.client_id = ? OR EXISTS (
    SELECT 1 FROM case_clients x
    WHERE x.case_id = ${caseAlias}.id AND x.client_id = ? AND ${notDeleted('x')}
  ))`
}
