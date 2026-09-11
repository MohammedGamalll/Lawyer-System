import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { useApp } from './store'
import { canAccessPage } from '@shared/permissions'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { HomePage } from './pages/Home'
import {
  ClientsPage,
  ClientProfilePage,
  CasesPage,
  CaseProfilePage,
  HearingsPage,
  TasksPage,
  RemindersPage,
  LawyersPage,
  EmployeesPage,
  OpponentsPage,
  OpponentProfilePage,
  PoaPage,
  ContractsPage,
  ConsultationsPage,
  CorrespondencePage,
  AppointmentsPage
} from './pages/Modules'
import { CalendarPage } from './pages/Calendar'
import { DocumentsPage, AccountsPage, ExpensesPage, CashboxPage, InvoicesPage } from './pages/FinanceDocs'
import { ReportsPage, ArchivePage, UsersPage, AuditPage, SettingsPage } from './pages/Admin'
import { SearchPage } from './pages/Search'
import { StaffFormPage } from './pages/StaffForm'
import i18n from './i18n'
import { applyFontSize } from './lib/uiPrefs'
import { invoke } from './lib/api'
import { notifyDataChanged } from './lib/bus'
import { useSyncStore, type SyncSnapshot } from './store/sync'
import { useUpdateStore } from './store/updater'
import { UpdateBanner } from './components/UpdateBanner'

export default function App() {
  const { user, page, toast, setUpdateReady } = useApp()
  const [kept, setKept] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (page === 'cases' || page === 'hearings' || page === 'clients') {
      setKept((m) => (m[page] ? m : { ...m, [page]: true }))
    }
  }, [page])
  const allowed = user ? canAccessPage(page, user.roleCode, user.permissions) : false

  useEffect(() => {
    if (!window.api?.on) return
    const updater = useUpdateStore.getState()
    const off1 = window.api.on('updater:checking', () => updater.setChecking())
    const offAvail = window.api.on('updater:available', (info: unknown) => {
      const version = String((info as { version?: string })?.version || '')
      updater.setAvailable(version)
      setUpdateReady(version)
      toast(i18n.t('updateAvailable'))
    })
    const offProg =
      window.api.onUpdateProgress?.((p: { percent: number }) => updater.setProgress(p.percent)) ||
      window.api.on('updater:progress', (p: unknown) => {
        updater.setProgress(Number((p as { percent?: number })?.percent || 0))
      })
    const off2 = window.api.on('updater:downloaded', (info: unknown) => {
      const version = String((info as { version?: string })?.version || '')
      updater.setReady(version)
      setUpdateReady(version)
      toast(i18n.t('updateDownloaded'))
    })
    const offIdle = window.api.on('updater:not-available', () => updater.clear())
    const offErr = window.api.on('updater:error', (msg: unknown) => updater.setError(String(msg || '')))
    const off3 = window.api.on('sync:changed', () => notifyDataChanged())
    const off4 = window.api.on('sync:status', (snap: unknown) => {
      useSyncStore.getState().setSnapshot(snap as SyncSnapshot)
    })
    void useSyncStore.getState().refresh()
    return () => {
      off1?.()
      offAvail?.()
      offProg?.()
      off2?.()
      offIdle?.()
      offErr?.()
      off3?.()
      off4?.()
    }
  }, [setUpdateReady, toast])

  useEffect(() => {
    if (!user) {
      useApp.getState().applyTheme('light')
      return
    }
    invoke<Record<string, string>>('settings:get')
      .then((s) => {
        applyFontSize(Number(s.ui_font_size || 16))
        useApp.getState().applyTheme(s.theme === 'dark' ? 'dark' : 'light')
      })
      .catch(() => undefined)
    void useSyncStore.getState().refresh()
  }, [user])

  if (!user) {
    return (
      <>
        <Toaster richColors position="bottom-left" />
        <UpdateBanner />
        <LoginPage />
      </>
    )
  }
  return (
    <>
      <Toaster richColors position="bottom-left" />
      <UpdateBanner />
      <Layout>
        {!allowed ? (
          <div className="p-10 text-lg text-navy-700 dark:text-white">{i18n.t('forbidden')}</div>
        ) : (
          <>
        {page === 'home' && <HomePage />}
        {page === 'dashboard' && <DashboardPage />}
        {(kept.clients || page === 'clients') && (
          <div className={page === 'clients' ? '' : 'hidden'}>
            <ClientsPage />
          </div>
        )}
        {page === 'clientProfile' && <ClientProfilePage />}
        {(kept.cases || page === 'cases') && (
          <div className={page === 'cases' ? '' : 'hidden'}>
            <CasesPage />
          </div>
        )}
        {page === 'caseProfile' && <CaseProfilePage />}
        {(kept.hearings || page === 'hearings') && (
          <div className={page === 'hearings' ? '' : 'hidden'}>
            <HearingsPage />
          </div>
        )}
        {page === 'calendar' && <CalendarPage />}
        {page === 'tasks' && <TasksPage />}
        {page === 'reminders' && <RemindersPage />}
        {page === 'documents' && <DocumentsPage />}
        {page === 'poa' && <PoaPage />}
        {page === 'contracts' && <ContractsPage />}
        {page === 'opponents' && <OpponentsPage />}
        {page === 'opponentProfile' && <OpponentProfilePage />}
        {page === 'lawyers' && <LawyersPage />}
        {page === 'lawyerProfile' && <StaffFormPage />}
        {page === 'employees' && <EmployeesPage />}
        {page === 'employeeProfile' && <StaffFormPage />}
        {page === 'staffForm' && <StaffFormPage />}
        {page === 'consultations' && <ConsultationsPage />}
        {page === 'correspondence' && <CorrespondencePage />}
        {page === 'accounts' && <AccountsPage />}
        {page === 'cashbox' && <CashboxPage />}
        {page === 'expenses' && <ExpensesPage />}
        {page === 'invoices' && <InvoicesPage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'archive' && <ArchivePage />}
        {page === 'users' && <UsersPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'audit' && <AuditPage />}
        {page === 'appointments' && <AppointmentsPage />}
        {page === 'search' && <SearchPage />}
          </>
        )}
      </Layout>
    </>
  )
}
