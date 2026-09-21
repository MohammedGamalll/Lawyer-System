import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Input, PageHeader } from '../components/ui'

type TabsResult = { tables: string[]; missing: boolean; error?: string }
type TablePage = {
  columns: string[]
  rows: Record<string, string>[]
  total: number
  page: number
  limit: number
  missing: boolean
  error?: string
}

const PAGE_SIZE = 100

export function ArchivePage() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [archived, setArchived] = useState<{ id: string; case_number: string; title: string }[]>([])
  const [tabs, setTabs] = useState<TabsResult>({ tables: [], missing: false })
  const [table, setTable] = useState('')
  const [q, setQ] = useState('')
  const [appliedQ, setAppliedQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<TablePage | null>(null)
  const [loading, setLoading] = useState(false)

  const loadArchived = () =>
    invoke<{ rows: { id: string; case_number: string; title: string }[] }>('cases:list', { pageSize: 50, archived: 1 })
      .then((r) => setArchived(r.rows || []))
      .catch((e) => toast((e as Error).message, 'err'))

  useEffect(() => {
    loadArchived()
    invoke<TabsResult>('archive:getTabs')
      .then((r) => {
        setTabs(r)
        setTable((cur) => cur || r.tables[0] || '')
      })
      .catch((e) => toast((e as Error).message, 'err'))
  }, [])

  useEffect(() => {
    if (!table) {
      setData(null)
      return
    }
    setLoading(true)
    invoke<TablePage>('archive:getTableData', table, page, PAGE_SIZE, appliedQ)
      .then(setData)
      .catch((e) => toast((e as Error).message, 'err'))
      .finally(() => setLoading(false))
  }, [table, page, appliedQ])

  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))
  const columns = data?.columns?.length ? data.columns : data?.rows[0] ? Object.keys(data.rows[0]) : []
  const hint = useMemo(() => {
    if (tabs.missing) return tabs.error || t('archivePage.missing')
    if (!tabs.tables.length) return t('archivePage.noTables')
    if (!loading && data && data.total === 0) return t('archivePage.empty')
    return ''
  }, [tabs, data, loading, t])

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.archive')} />

      <Card>
        <h3 className="mb-3 font-bold">{t('archivePage.appArchived')}</h3>
        {archived.length === 0 ? (
          <p className="text-sm text-navy-500">{t('archivePage.noAppArchived')}</p>
        ) : (
          archived.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b py-2">
              <div>
                {r.case_number} — {r.title}
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await invoke('cases:restore', r.id)
                  toast(t('savedOk'))
                  loadArchived()
                }}
              >
                {t('restore')}
              </Button>
            </div>
          ))
        )}
      </Card>

      <Card>
        <h3 className="mb-1 font-bold">{t('archivePage.legacyTitle')}</h3>
        <p className="mb-3 text-sm text-navy-500">{t('archivePage.legacyHint')}</p>
        {tabs.tables.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-navy-50 p-1 dark:bg-navy-800">
            {tabs.tables.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setTable(name)
                  setPage(1)
                }}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  table === name
                    ? 'bg-white font-semibold shadow-sm dark:bg-navy-900 dark:text-white'
                    : 'text-navy-700 dark:text-navy-100'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="mb-3 flex flex-wrap gap-2">
          <Input
            className="max-w-md"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setAppliedQ(q)
                setPage(1)
              }
            }}
            placeholder={t('archivePage.searchHint')}
          />
          <Button
            onClick={() => {
              setAppliedQ(q)
              setPage(1)
            }}
          >
            {t('searchPage.run')}
          </Button>
        </div>
        {hint && <p className="mb-3 text-sm text-navy-500">{hint}</p>}
        <div className="max-h-[60vh] overflow-auto rounded border border-navy-200 dark:border-navy-700">
          <table className="min-w-full border-collapse text-start text-sm">
            <thead className="sticky top-0 bg-navy-50 dark:bg-navy-800">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="whitespace-nowrap border-b px-2 py-1.5 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((row, i) => (
                <tr key={i} className="odd:bg-white even:bg-navy-50/40 dark:odd:bg-navy-950 dark:even:bg-navy-900">
                  {columns.map((c) => (
                    <td key={c} className="max-w-[18rem] truncate whitespace-nowrap border-b px-2 py-1" title={row[c]}>
                      {row[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            {t('archivePage.prev')}
          </Button>
          <span>
            {t('archivePage.pageOf', { page: data?.page || page, pages, total: data?.total ?? 0 })}
          </span>
          <Button variant="outline" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
            {t('archivePage.next')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
