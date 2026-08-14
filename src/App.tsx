import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { useApp } from './store'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import {
  ClientsPage,
  ClientProfilePage,
  CasesPage,
  CaseProfilePage,
  HearingsPage,
  TasksPage,
  RemindersPage,
  LawyersPage,
  LawyerProfilePage,
  EmployeesPage,
  EmployeeProfilePage,
  OpponentsPage,
  PoaPage,
  ContractsPage,
  ConsultationsPage,
  CorrespondencePage,
  AppointmentsPage
} from './pages/Modules'
import { CalendarPage } from './pages/Calendar'
import { DocumentsPage, AccountsPage, InvoicesPage, CashboxPage } from './pages/FinanceDocs'
import { ReportsPage, ArchivePage, UsersPage, AuditPage, SettingsPage } from './pages/Admin'
import { SearchPage } from './pages/Search'
import i18n from './i18n'

export default function App() {
  const { user, page, toast, setUpdateReady } = useApp()

  useEffect(() => {
    if (!window.api?.on) return
    const off1 = window.api.on('updater:available', (info: unknown) => {
      const version = String((info as { version?: string })?.version || '')
      setUpdateReady(version)
      toast(i18n.t('updateAvailable'))
    })
    const off2 = window.api.on('updater:downloaded', (info: unknown) => {
      const version = String((info as { version?: string })?.version || '')
      setUpdateReady(version)
      toast(i18n.t('updateDownloaded'))
    })
    return () => {
      off1?.()
      off2?.()
    }
  }, [setUpdateReady, toast])

  if (!user) {
    return (
      <>
        <Toaster richColors position="bottom-left" />
        <LoginPage />
      </>
    )
  }
  return (
    <>
      <Toaster richColors position="bottom-left" />
      <Layout>
        {page === 'dashboard' && <DashboardPage />}
        {page === 'clients' && <ClientsPage />}
        {page === 'clientProfile' && <ClientProfilePage />}
        {page === 'cases' && <CasesPage />}
        {page === 'caseProfile' && <CaseProfilePage />}
        {page === 'hearings' && <HearingsPage />}
        {page === 'calendar' && <CalendarPage />}
        {page === 'tasks' && <TasksPage />}
        {page === 'reminders' && <RemindersPage />}
        {page === 'documents' && <DocumentsPage />}
        {page === 'poa' && <PoaPage />}
        {page === 'contracts' && <ContractsPage />}
        {page === 'opponents' && <OpponentsPage />}
        {page === 'lawyers' && <LawyersPage />}
        {page === 'lawyerProfile' && <LawyerProfilePage />}
        {page === 'employees' && <EmployeesPage />}
        {page === 'employeeProfile' && <EmployeeProfilePage />}
        {page === 'consultations' && <ConsultationsPage />}
        {page === 'correspondence' && <CorrespondencePage />}
        {page === 'accounts' && <AccountsPage />}
        {page === 'cashbox' && <CashboxPage />}
        {page === 'invoices' && <InvoicesPage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'archive' && <ArchivePage />}
        {page === 'users' && <UsersPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'audit' && <AuditPage />}
        {page === 'appointments' && <AppointmentsPage />}
        {page === 'search' && <SearchPage />}
      </Layout>
    </>
  )
}
