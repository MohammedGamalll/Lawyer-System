import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react'
import { Toaster } from 'sonner'
import { useApp } from './store'
import { canAccessPage } from '@shared/permissions'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import i18n from './i18n'
import { applyFontSize } from './lib/uiPrefs'
import { invoke } from './lib/api'
import { notifyDataChanged } from './lib/bus'
import { useSyncStore, type SyncSnapshot } from './store/sync'
import { useUpdateStore } from './store/updater'
import { UpdateBanner } from './components/UpdateBanner'

const AlertsPage = lazy(() => import('./pages/Alerts').then((m) => ({ default: m.AlertsPage })))
const HomePage = lazy(() => import('./pages/Home').then((m) => ({ default: m.HomePage })))
const DashboardPage = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })))
const ClientsPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.ClientsPage })))
const ClientProfilePage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.ClientProfilePage })))
const CasesPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.CasesPage })))
const CaseProfilePage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.CaseProfilePage })))
const HearingsPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.HearingsPage })))
const ExpertsPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.ExpertsPage })))
const TasksPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.TasksPage })))
const ExecutionPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.ExecutionPage })))
const RemindersPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.RemindersPage })))
const LawyersPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.LawyersPage })))
const EmployeesPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.EmployeesPage })))
const OpponentsPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.OpponentsPage })))
const OpponentProfilePage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.OpponentProfilePage })))
const PoaPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.PoaPage })))
const ContractsPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.ContractsPage })))
const ConsultationsPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.ConsultationsPage })))
const CorrespondencePage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.CorrespondencePage })))
const AppointmentsPage = lazy(() => import('./pages/Modules').then((m) => ({ default: m.AppointmentsPage })))
const CalendarPage = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.CalendarPage })))
const DocumentsPage = lazy(() => import('./pages/FinanceDocs').then((m) => ({ default: m.DocumentsPage })))
const AccountsPage = lazy(() => import('./pages/FinanceDocs').then((m) => ({ default: m.AccountsPage })))
const ExpensesPage = lazy(() => import('./pages/FinanceDocs').then((m) => ({ default: m.ExpensesPage })))
const CashboxPage = lazy(() => import('./pages/FinanceDocs').then((m) => ({ default: m.CashboxPage })))
const InvoicesPage = lazy(() => import('./pages/FinanceDocs').then((m) => ({ default: m.InvoicesPage })))
const ReportsPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.ReportsPage })))
const ArchivePage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.ArchivePage })))
const UsersPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.UsersPage })))
const AuditPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AuditPage })))
const SettingsPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.SettingsPage })))
const SearchPage = lazy(() => import('./pages/Search').then((m) => ({ default: m.SearchPage })))
const StaffFormPage = lazy(() => import('./pages/StaffForm').then((m) => ({ default: m.StaffFormPage })))

const PAGE: Record<string, LazyExoticComponent<ComponentType>> = {
  alerts: AlertsPage,
  home: HomePage,
  dashboard: DashboardPage,
  clients: ClientsPage,
  clientProfile: ClientProfilePage,
  cases: CasesPage,
  caseProfile: CaseProfilePage,
  hearings: HearingsPage,
  experts: ExpertsPage,
  calendar: CalendarPage,
  tasks: TasksPage,
  execution: ExecutionPage,
  reminders: RemindersPage,
  documents: DocumentsPage,
  poa: PoaPage,
  contracts: ContractsPage,
  opponents: OpponentsPage,
  opponentProfile: OpponentProfilePage,
  lawyers: LawyersPage,
  lawyerProfile: StaffFormPage,
  employees: EmployeesPage,
  employeeProfile: StaffFormPage,
  staffForm: StaffFormPage,
  consultations: ConsultationsPage,
  correspondence: CorrespondencePage,
  accounts: AccountsPage,
  cashbox: CashboxPage,
  expenses: ExpensesPage,
  invoices: InvoicesPage,
  reports: ReportsPage,
  archive: ArchivePage,
  users: UsersPage,
  settings: SettingsPage,
  audit: AuditPage,
  appointments: AppointmentsPage,
  search: SearchPage
}

export default function App() {
  const { user, page, toast, setUpdateReady } = useApp()
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
  const Active = PAGE[page]
  return (
    <>
      <Toaster richColors position="bottom-left" />
      <UpdateBanner />
      <Layout>
        {!allowed ? (
          <div className="p-10 text-lg text-navy-700 dark:text-white">{i18n.t('forbidden')}</div>
        ) : (
          <Suspense fallback={<div className="p-10 text-navy-500">{i18n.t('loading')}</div>}>
            {Active ? <Active /> : null}
          </Suspense>
        )}
      </Layout>
    </>
  )
}
