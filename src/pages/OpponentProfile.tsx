import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { opponentSchema } from '@shared/schemas'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, InfoGrid, MiniTable, Modal, PageHeader, UiTabs } from '../components/ui'
import { PartyForm, uploadOpponentPendingDocs } from '../components/PartyForm'
import { ClientDocumentUpload, DocumentPreviewModal, DocumentThumb } from '../components/DocumentTools'
import { PartyRatingCard } from '../components/PartyRating'
import { SimilarClientModal } from '../components/SimilarClientModal'
import { similarFromError, type SimilarHit } from '../lib/similarError'
import { formatCell } from '../lib/datetime'
import { onDataChanged } from '../lib/bus'

export function OpponentProfilePage() {
  const { t, i18n } = useTranslation()
  const { pageMeta, goBack, toast, can } = useApp()
  const [p, setP] = useState<Record<string, unknown> | null>(null)
  const [docs, setDocs] = useState<{ id: string; title: string; category: string }[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [similar, setSimilar] = useState<SimilarHit | null>(null)
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)
  const id = String(pageMeta.id || '')

  const load = async () => {
    const data = await invoke<Record<string, unknown>>('opponents:get', id)
    setP(data)
    const listed = await invoke<{ rows: { id: string; title: string; category: string }[] }>('documents:list', {
      page: 1,
      pageSize: 80,
      filters: { opponent_id: id }
    })
    setDocs(listed.rows || [])
  }

  useEffect(() => {
    load().catch((e) => toast((e as Error).message, 'err'))
  }, [id])
  useEffect(() => onDataChanged(() => load().catch(() => undefined)), [id])

  if (!p) return <div>{t('loading')}</div>
  const o = (p.opponent as Record<string, unknown>) || {}

  const personalFields = [
    { name: 'full_name', label: t('fields.full_name') },
    { name: 'nickname', label: t('fields.nickname') },
    { name: 'id_kind', label: t('fields.id_kind') },
    { name: 'national_id', label: String(o.id_kind) === 'passport' ? t('fields.passport') : t('fields.national_id') },
    ...(String(o.id_kind) === 'passport' ? [{ name: 'passport_country', label: t('fields.passport_country') }] : []),
    { name: 'whatsapp', label: t('fields.whatsapp') },
    { name: 'phone', label: t('fields.phone') },
    { name: 'phone_home', label: t('fields.phone_home') },
    { name: 'phone_work', label: t('fields.phone_work') },
    { name: 'email', label: t('fields.email') },
    { name: 'address', label: t('fields.address') },
    ...(o.address2 ? [{ name: 'address2', label: t('fields.address2') }] : []),
    { name: 'poa_number', label: t('fields.poa_number') },
    { name: 'poa_year', label: t('fields.poa_year') },
    { name: 'poa_letter', label: t('fields.poa_letter') },
    { name: 'poa_office', label: t('fields.poa_office') },
    { name: 'lawyer_name', label: t('fields.lawyer_name') },
    { name: 'lawyer_phone', label: t('fields.lawyer_phone') },
    { name: 'notes', label: t('fields.notes') }
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title={String(o.full_name || '')}
        actions={
          <div className="flex gap-2">
            {can('opponents.manage') && (
              <Button
                variant="gold"
                onClick={() => {
                  setForm({ ...o, id_kind: o.id_kind || 'national_id', __show_address2: Boolean(o.address2) })
                  setFormErrors({})
                  setEditing(true)
                }}
              >
                {t('edit')}
              </Button>
            )}
            <Button variant="outline" onClick={() => goBack()}>
              {t('back')}
            </Button>
          </div>
        }
      />
      {Number(o.is_blacklisted) ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t('party.blacklistWarn')}
          {o.blacklist_note ? ` — ${String(o.blacklist_note)}` : ''}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
        <Card>
          <UiTabs
            tabs={[
              {
                id: 'personal',
                label: t('tabs.personal'),
                body: (
                  <InfoGrid
                    items={personalFields.map((f) => {
                      const text = formatCell(f.name, o[f.name], i18n.language, t)
                      if (f.name === 'id_kind') {
                        const kind = String(o.id_kind || 'national_id')
                        return {
                          label: f.label,
                          value: kind === 'passport' ? t('fields.passport') : t('fields.national_id')
                        }
                      }
                      return { label: f.label, value: text }
                    })}
                  />
                )
              },
              {
                id: 'cases',
                label: t('tabs.cases'),
                body: (
                  <MiniTable
                    rows={(p.cases as object[]) || []}
                    keys={['case_number', 'title', 'status']}
                    onRowClick={(r) => useApp.getState().setPage('caseProfile', { id: r.id })}
                  />
                )
              },
              {
                id: 'documents',
                label: t('tabs.documents'),
                body: (
                  <div className="space-y-3">
                    <ClientDocumentUpload opponentId={id} onDone={() => load()} />
                    {docs.length ? (
                      <div className="space-y-2">
                        {docs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between gap-2 rounded border border-navy-100 px-2 py-1 dark:border-navy-800">
                            <DocumentThumb
                              id={doc.id}
                              title={`${doc.title} — ${doc.category}`}
                              onOpen={() => setPreviewId(doc.id)}
                              onOpenExternal={() =>
                                invoke('documents:open', doc.id).catch((e) => toast((e as Error).message, 'err'))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-navy-400">{t('docs.noClientDocs')}</div>
                    )}
                  </div>
                )
              }
            ]}
          />
        </Card>
        <PartyRatingCard
          rating={Number(o.rating || 0)}
          blacklisted={Boolean(Number(o.is_blacklisted))}
          note={String(o.blacklist_note || '')}
          canEdit={can('opponents.manage')}
          onChange={async (patch) => {
            try {
              await invoke('opponents:update', id, { ...o, ...patch })
              toast(t('savedOk'))
              await load()
            } catch (e) {
              const hit = similarFromError(e)
              if (hit) {
                setSimilar(hit)
                return
              }
              toast((e as Error).message, 'err')
            }
          }}
        />
      </div>
      <Modal open={editing} title={t('edit')} onClose={() => setEditing(false)} wide>
        <PartyForm
          entity="opponent"
          values={form}
          partyId={id}
          errors={formErrors}
          onChange={(n, v) => {
            setFormErrors((prev) => {
              if (!prev[n]) return prev
              const next = { ...prev }
              delete next[n]
              return next
            })
            setForm((prev) => ({ ...prev, [n]: v }))
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditing(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={async () => {
              const parsed = opponentSchema.safeParse(form)
              if (!parsed.success) {
                const errs: Record<string, string> = {}
                for (const issue of parsed.error.issues) {
                  const key = String(issue.path[0] || '')
                  if (key && !errs[key]) errs[key] = issue.message
                }
                setFormErrors(errs)
                toast(parsed.error.issues[0]?.message || t('error'), 'err')
                return
              }
              const payload: Record<string, unknown> = { ...parsed.data }
              for (const k of Object.keys(payload)) {
                if (k.startsWith('__')) delete payload[k]
              }
              try {
                await invoke('opponents:update', id, payload)
                await uploadOpponentPendingDocs(id, form)
                toast(t('savedOk'))
                setEditing(false)
                await load()
              } catch (e) {
                const hit = similarFromError(e)
                if (hit) {
                  setSimilar(hit)
                  setPendingPayload(payload)
                  return
                }
                toast((e as Error).message, 'err')
              }
            }}
          >
            {t('save')}
          </Button>
        </div>
      </Modal>
      <DocumentPreviewModal id={previewId} onClose={() => setPreviewId(null)} />
      <SimilarClientModal
        open={!!similar}
        name={similar?.full_name}
        code={similar?.client_number}
        isEdit
        canOpenExisting={Boolean(similar?.id)}
        onClose={() => setSimilar(null)}
        onOpenExisting={() => {
          if (similar?.id) useApp.getState().setPage('opponentProfile', { id: similar.id })
          setSimilar(null)
        }}
        onAddAsNew={async () => {
          if (!pendingPayload) {
            setSimilar(null)
            return
          }
          try {
            await invoke('opponents:update', id, { ...pendingPayload, force_similar: true })
            await uploadOpponentPendingDocs(id, form)
            toast(t('savedOk'))
            setSimilar(null)
            setPendingPayload(null)
            setEditing(false)
            await load()
          } catch (e) {
            toast((e as Error).message, 'err')
          }
        }}
      />
    </div>
  )
}
