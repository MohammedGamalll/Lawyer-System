import type { IpcMain, BrowserWindow } from 'electron'
import { dialog, shell } from 'electron'
import fs from 'fs'
import { IPC } from '@shared/ipc'
import { handle, ok, fail } from './helpers'
import { getSession, toPublicSession } from './session'
import * as auth from '../services/auth'
import * as users from '../services/users'
import * as settings from '../services/settings'
import * as clients from '../services/clients'
import * as cases from '../services/cases'
import * as hearings from '../services/hearings'
import * as people from '../services/people'
import * as schedule from '../services/schedule'
import * as documents from '../services/documents'
import * as legal from '../services/legal'
import * as finance from '../services/finance'
import * as dashboard from '../services/dashboard'
import * as reports from '../services/reports'
import * as importer from '../services/importer'
import * as backup from '../services/backup'
import * as print from '../services/print'
import * as updater from '../services/updater'
import * as demo from '../services/demo'
import * as wipe from '../services/wipe'
import { getInvoice } from '../services/finance'
import { wrapHtml } from '../services/print'
import { getSyncState, runSyncCycle } from '../sync/service'

export function registerIpc(ipc: IpcMain, getWin: () => BrowserWindow | null): void {
  handle(ipc, IPC.auth.login, { auth: false, write: true }, (event, _u, username, password) => {
    const session = auth.login(String(username), String(password), event.sender.id, 'Windows Desktop')
    return ok(session)
  })
  handle(ipc, IPC.auth.logout, { write: true }, (event, user) => {
    auth.logout(user, event.sender.id)
    return ok(true)
  })
  handle(ipc, IPC.auth.me, {}, (event) => {
    const user = getSession(event)
    if (!user) return fail('غير مسجل')
    return ok(toPublicSession(user))
  })
  handle(ipc, IPC.auth.changePassword, { write: true }, (_e, user, current, next) => {
    auth.changePassword(user!, String(current), String(next))
    return ok(true)
  })
  handle(ipc, IPC.auth.resetPassword, { permission: 'users.manage', write: true }, (_e, user, userId, next) => {
    auth.resetPassword(user!, String(userId), String(next))
    return ok(true)
  })

  handle(ipc, IPC.users.list, {}, (_e, _u, q) => ok(users.listUsers(q as never)))
  handle(ipc, IPC.users.get, { permission: 'users.manage' }, (_e, _u, id) => ok(users.getUser(String(id))))
  handle(ipc, IPC.users.create, { permission: 'users.manage', write: true }, (_e, user, data) => ok(users.createUser(user!, data as never)))
  handle(ipc, IPC.users.update, { permission: 'users.manage', write: true }, (_e, user, id, data) => ok(users.updateUser(user!, String(id), data as never)))
  handle(ipc, IPC.users.remove, { permission: 'users.manage', write: true }, (_e, user, id) => {
    users.removeUser(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.users.setPermissions, { permission: 'users.manage', write: true }, (_e, user, id, codes) => {
    users.setUserPermissions(user!, String(id), codes as string[])
    return ok(true)
  })
  handle(ipc, IPC.users.permissions, { permission: 'users.manage' }, () =>
    ok({ roles: users.listRoles(), permissions: users.listPermissions() })
  )
  handle(ipc, IPC.users.roles, {}, () => ok(users.listRoles()))

  handle(ipc, IPC.settings.get, {}, () => ok(settings.getPublicSettings()))
  handle(ipc, IPC.settings.set, { permission: 'settings.manage', write: true }, (_e, user, values) =>
    ok(settings.setSettings(user!, values as never))
  )
  handle(ipc, IPC.settings.saveLogo, { permission: 'settings.manage', write: true }, (_e, user, file) => {
    const dest = print.saveOfficeLogo(file as { name: string; data: number[] })
    settings.setSettings(user!, { office_logo: dest })
    return ok({ path: dest })
  })

  handle(ipc, IPC.clients.list, { permission: 'clients.view' }, (_e, _u, q) => ok(clients.listClients(q as never)))
  handle(ipc, IPC.clients.get, { permission: 'clients.view' }, (_e, _u, id) => ok(clients.getClient(String(id))))
  handle(ipc, IPC.clients.profile, { permission: 'clients.view' }, (_e, _u, id) => ok(clients.clientProfile(String(id))))
  handle(ipc, IPC.clients.search, { permission: 'clients.view' }, (_e, _u, term) => ok(clients.searchClients(String(term))))
  handle(ipc, IPC.clients.create, { permission: 'clients.create', write: true }, (_e, user, data) => ok(clients.createClient(user!, data as never)))
  handle(ipc, IPC.clients.update, { permission: 'clients.update', write: true }, (_e, user, id, data) => ok(clients.updateClient(user!, String(id), data as never)))
  handle(ipc, IPC.clients.remove, { permission: 'clients.delete', write: true }, (_e, user, id) => {
    clients.removeClient(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.clients.importTemplate, { permission: 'clients.create' }, async () =>
    ok(Array.from(await importer.buildTemplate('clients')))
  )
  handle(ipc, IPC.clients.importPreview, { permission: 'clients.create' }, async (_e, _u, buf) =>
    ok(await importer.previewImport('clients', Buffer.from(buf as ArrayBuffer)))
  )
  handle(ipc, IPC.clients.importCommit, { permission: 'clients.create', write: true }, async (_e, user, buf, upd) =>
    ok(await importer.commitImport(user!, 'clients', Buffer.from(buf as ArrayBuffer), Boolean(upd)))
  )
  handle(ipc, IPC.clients.addContact, { permission: 'clients.update', write: true }, (_e, user, clientId, data) =>
    ok(people.addClientContact(user!, String(clientId), data as never))
  )
  handle(ipc, IPC.clients.removeContact, { permission: 'clients.update', write: true }, (_e, _u, id) => {
    people.removeClientContact(String(id))
    return ok(true)
  })

  handle(ipc, IPC.cases.list, { permission: 'cases.view' }, (_e, _u, q) => ok(cases.listCases(q as never, Number((q as { archived?: number })?.archived ?? 0))))
  handle(ipc, IPC.cases.get, { permission: 'cases.view' }, (_e, _u, id) => ok(cases.getCase(String(id))))
  handle(ipc, IPC.cases.create, { permission: 'cases.create', write: true }, (_e, user, data) => ok(cases.createCase(user!, data as never)))
  handle(ipc, IPC.cases.update, { permission: 'cases.update', write: true }, (_e, user, id, data) => ok(cases.updateCase(user!, String(id), data as never)))
  handle(ipc, IPC.cases.remove, { permission: 'cases.delete', write: true }, (_e, user, id) => {
    documents.deleteCaseDocumentsFromDisk(String(id))
    cases.removeCase(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.cases.link, { permission: 'cases.update', write: true }, (_e, user, a, b, t) => {
    cases.linkCases(user!, String(a), String(b), String(t))
    return ok(true)
  })
  handle(ipc, IPC.cases.archive, { permission: 'cases.update', write: true }, (_e, user, id) => {
    cases.archiveCase(user!, String(id), true)
    return ok(true)
  })
  handle(ipc, IPC.cases.restore, { permission: 'archive.view', write: true }, (_e, user, id) => {
    cases.archiveCase(user!, String(id), false)
    return ok(true)
  })
  handle(ipc, IPC.cases.importTemplate, { permission: 'cases.create' }, async () =>
    ok(Array.from(await importer.buildTemplate('cases')))
  )
  handle(ipc, IPC.cases.importPreview, { permission: 'cases.create' }, async (_e, _u, buf) =>
    ok(await importer.previewImport('cases', Buffer.from(buf as ArrayBuffer)))
  )
  handle(ipc, IPC.cases.importCommit, { permission: 'cases.create', write: true }, async (_e, user, buf, upd) =>
    ok(await importer.commitImport(user!, 'cases', Buffer.from(buf as ArrayBuffer), Boolean(upd)))
  )

  handle(ipc, IPC.caseTypes.list, {}, () => ok(cases.listCaseTypes()))
  handle(ipc, IPC.caseTypes.create, { permission: 'settings.manage', write: true }, (_e, user, name) => ok(cases.createCaseType(user!, String(name))))
  handle(ipc, IPC.caseTypes.update, { permission: 'settings.manage', write: true }, (_e, _u, id, data) => {
    cases.updateCaseType(String(id), data as never)
    return ok(true)
  })
  handle(ipc, IPC.caseTypes.remove, { permission: 'settings.manage', write: true }, (_e, _u, id) => {
    cases.removeCaseType(String(id))
    return ok(true)
  })

  handle(ipc, IPC.hearings.list, { permission: 'hearings.view' }, (_e, _u, q) => ok(hearings.listHearings(q as never)))
  handle(ipc, IPC.hearings.get, { permission: 'hearings.view' }, (_e, _u, id) => ok(hearings.getHearing(String(id))))
  handle(ipc, IPC.hearings.create, { permission: 'hearings.create', write: true }, (_e, user, data) => ok(hearings.createHearing(user!, data as never)))
  handle(ipc, IPC.hearings.update, { permission: 'hearings.update', write: true }, (_e, user, id, data) => ok(hearings.updateHearing(user!, String(id), data as never)))
  handle(ipc, IPC.hearings.postpone, { permission: 'hearings.update', write: true }, (_e, user, id, date, time, reason) =>
    ok(hearings.postponeHearing(user!, String(id), String(date), time as string, reason as string))
  )
  handle(ipc, IPC.hearings.remove, { permission: 'hearings.update', write: true }, (_e, user, id) => {
    hearings.removeHearing(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.dashboard.stats, {}, () => ok(dashboard.dashboardStats()))

  handle(ipc, IPC.lawyers.list, { permission: 'lawyers.view' }, (_e, _u, q) => ok(people.listLawyers(q as never)))
  handle(ipc, IPC.lawyers.get, { permission: 'lawyers.view' }, (_e, _u, id) => ok(people.getLawyer(String(id))))
  handle(ipc, IPC.lawyers.create, { permission: 'users.manage', write: true }, (_e, user, data) => ok(people.createLawyer(user!, data as never)))
  handle(ipc, IPC.lawyers.update, { permission: 'users.manage', write: true }, (_e, user, id, data) => ok(people.updateLawyer(user!, String(id), data as never)))
  handle(ipc, IPC.lawyers.remove, { permission: 'users.manage', write: true }, (_e, user, id) => {
    people.removeLawyer(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.lawyers.dashboard, { permission: 'lawyers.view' }, (_e, _u, id) => ok(people.getLawyer(String(id))))
  handle(ipc, IPC.lawyers.saveStaff, { write: true }, (_e, user, data) =>
    ok(people.saveStaff(user!, data as never))
  )
  handle(ipc, IPC.lawyers.savePhoto, { permission: 'users.manage', write: true }, (_e, user, lawyerId, file) => {
    const f = file as { name: string; data: number[] }
    if (!f?.data) throw new Error('لم يتم اختيار صورة')
    return ok(people.setLawyerPhoto(user!, String(lawyerId), f))
  })

  handle(ipc, IPC.employees.list, { permission: 'employees.view' }, (_e, _u, q) => ok(people.listEmployees(q as never)))
  handle(ipc, IPC.employees.get, { permission: 'employees.view' }, (_e, _u, id) => ok(people.getEmployee(String(id))))
  handle(ipc, IPC.employees.staff, {}, (_e, _u, opts) =>
    ok(people.getStaff((opts as { employeeId?: string; lawyerId?: string; userId?: string }) || {}))
  )
  handle(ipc, IPC.employees.savePhoto, { permission: 'employees.manage', write: true }, (_e, user, ids, file) => {
    const f = file as { name: string; data: number[] }
    if (!f?.data) throw new Error('لم يتم اختيار صورة')
    return ok(people.setStaffPhoto(user!, (ids as { employeeId?: string; lawyerId?: string }) || {}, f))
  })
  handle(ipc, IPC.employees.create, { permission: 'employees.manage', write: true }, (_e, user, data) => ok(people.createEmployee(user!, data as never)))
  handle(ipc, IPC.employees.update, { permission: 'employees.manage', write: true }, (_e, user, id, data) => ok(people.updateEmployee(user!, String(id), data as never)))
  handle(ipc, IPC.employees.remove, { permission: 'employees.manage', write: true }, (_e, user, id) => {
    people.removeEmployee(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.employees.attendance, { permission: 'employees.manage', write: true }, (_e, user, data) => ok(people.addAttendance(user!, data as never)))
  handle(ipc, IPC.employees.leave, { permission: 'employees.manage', write: true }, (_e, user, data) => ok(people.addLeave(user!, data as never)))

  handle(ipc, IPC.opponents.list, { permission: 'opponents.view' }, (_e, _u, q) => ok(people.listOpponents(q as never)))
  handle(ipc, IPC.opponents.get, { permission: 'opponents.view' }, (_e, _u, id) => ok(people.getOpponent(String(id))))
  handle(ipc, IPC.opponents.create, { permission: 'opponents.manage', write: true }, (_e, user, data) => ok(people.createOpponent(user!, data as never)))
  handle(ipc, IPC.opponents.update, { permission: 'opponents.manage', write: true }, (_e, user, id, data) => ok(people.updateOpponent(user!, String(id), data as never)))
  handle(ipc, IPC.opponents.remove, { permission: 'opponents.manage', write: true }, (_e, user, id) => {
    people.removeOpponent(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.opponents.linkCase, { permission: 'opponents.manage', write: true }, (_e, user, opponentId, caseId) =>
    ok(people.linkOpponentToCase(user!, String(opponentId), String(caseId)))
  )

  handle(ipc, IPC.tasks.list, { permission: 'tasks.view' }, (_e, user, q) => ok(schedule.listTasks(q as never, user?.id)))
  handle(ipc, IPC.tasks.get, { permission: 'tasks.view' }, (_e, _u, id) => ok(schedule.getTask(String(id))))
  handle(ipc, IPC.tasks.create, { permission: 'tasks.manage', write: true }, (_e, user, data) => ok(schedule.createTask(user!, data as never)))
  handle(ipc, IPC.tasks.update, { permission: 'tasks.manage', write: true }, (_e, user, id, data) => ok(schedule.updateTask(user!, String(id), data as never)))
  handle(ipc, IPC.tasks.remove, { permission: 'tasks.manage', write: true }, (_e, user, id) => {
    schedule.removeTask(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.reminders.list, { permission: 'reminders.view' }, (_e, _u, q) => ok(schedule.listReminders(q as never)))
  handle(ipc, IPC.reminders.get, { permission: 'reminders.view' }, (_e, _u, id) => ok(schedule.getReminder(String(id))))
  handle(ipc, IPC.reminders.create, { permission: 'reminders.view', write: true }, (_e, user, data) => ok(schedule.createReminderRecord(user!, data as never)))
  handle(ipc, IPC.reminders.update, { write: true }, (_e, user, id, data) => ok(schedule.updateReminder(user!, String(id), data as never)))
  handle(ipc, IPC.reminders.dismiss, { write: true }, (_e, _u, id) => {
    schedule.dismissReminder(String(id))
    return ok(true)
  })
  handle(ipc, IPC.reminders.remove, { write: true }, (_e, user, id) => {
    schedule.removeReminder(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.appointments.list, { permission: 'appointments.view' }, (_e, _u, q) => ok(schedule.listAppointments(q as never)))
  handle(ipc, IPC.appointments.get, { permission: 'appointments.view' }, (_e, _u, id) => ok(schedule.getAppointment(String(id))))
  handle(ipc, IPC.appointments.create, { permission: 'appointments.manage', write: true }, (_e, user, data) => ok(schedule.createAppointment(user!, data as never)))
  handle(ipc, IPC.appointments.update, { permission: 'appointments.manage', write: true }, (_e, user, id, data) => ok(schedule.updateAppointment(user!, String(id), data as never)))
  handle(ipc, IPC.appointments.remove, { permission: 'appointments.manage', write: true }, (_e, user, id) => {
    schedule.removeAppointment(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.calendar.events, { permission: 'calendar.view' }, (_e, _u, from, to) => ok(schedule.calendarEvents(String(from), String(to))))
  handle(ipc, IPC.calendar.move, { permission: 'calendar.view', write: true }, (_e, _u, kind, id, date, time) => {
    schedule.moveCalendarEvent(String(kind), String(id), String(date), time as string)
    return ok(true)
  })

  handle(ipc, IPC.notifications.list, {}, (_e, user) => ok(schedule.listNotifications(user!.id)))
  handle(ipc, IPC.notifications.read, { write: true }, (_e, _u, id) => {
    schedule.markNotificationRead(String(id))
    return ok(true)
  })
  handle(ipc, IPC.notifications.readAll, { write: true }, (_e, user) => {
    schedule.markAllNotificationsRead(user!.id)
    return ok(true)
  })

  handle(ipc, IPC.documents.list, { permission: 'documents.view' }, (_e, _u, q) => ok(documents.listDocuments(q as never)))
  handle(ipc, IPC.documents.upload, { permission: 'documents.upload', write: true }, (_e, user, meta, file) => {
    const f = file as { name: string; data: number[]; mime?: string }
    return ok(documents.uploadDocument(user!, meta as never, { name: f.name, data: Buffer.from(f.data), mime: f.mime }))
  })
  handle(ipc, IPC.documents.update, { permission: 'documents.upload', write: true }, (_e, user, id, data, file) => {
    const f = file as { name: string; data: number[]; mime?: string } | undefined
    return ok(
      documents.updateDocument(
        user!,
        String(id),
        data as never,
        f ? { name: f.name, data: Buffer.from(f.data), mime: f.mime } : undefined
      )
    )
  })
  handle(ipc, IPC.documents.remove, { permission: 'documents.delete', write: true }, (_e, user, id) => {
    documents.removeDocument(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.documents.open, { permission: 'documents.view' }, async (_e, _u, id) => ok(await documents.openDocument(String(id))))
  handle(ipc, IPC.documents.versions, { permission: 'documents.view' }, (_e, _u, id) => ok(documents.documentVersions(String(id))))
  handle(ipc, IPC.documents.rename, { permission: 'documents.upload', write: true }, (_e, user, id, title) =>
    ok(documents.renameDocument(user!, String(id), String(title)))
  )
  handle(ipc, IPC.documents.move, { permission: 'documents.upload', write: true }, (_e, user, id, data) =>
    ok(documents.moveDocument(user!, String(id), data as never))
  )
  handle(ipc, IPC.documents.download, { permission: 'documents.view' }, (_e, _u, id, versionId) =>
    ok(documents.downloadDocument(String(id), versionId ? String(versionId) : undefined))
  )

  handle(ipc, IPC.poa.list, { permission: 'poa.view' }, (_e, _u, q) => ok(legal.listPoa(q as never)))
  handle(ipc, IPC.poa.create, { permission: 'poa.manage', write: true }, (_e, user, data) => ok(legal.createPoa(user!, data as never)))
  handle(ipc, IPC.poa.update, { permission: 'poa.manage', write: true }, (_e, user, id, data) => ok(legal.updatePoa(user!, String(id), data as never)))
  handle(ipc, IPC.poa.remove, { permission: 'poa.manage', write: true }, (_e, user, id) => {
    legal.removePoa(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.contracts.list, { permission: 'contracts.view' }, (_e, _u, q) => ok(legal.listContracts(q as never)))
  handle(ipc, IPC.contracts.create, { permission: 'contracts.manage', write: true }, (_e, user, data) => ok(legal.createContract(user!, data as never)))
  handle(ipc, IPC.contracts.update, { permission: 'contracts.manage', write: true }, (_e, user, id, data) => ok(legal.updateContract(user!, String(id), data as never)))
  handle(ipc, IPC.contracts.remove, { permission: 'contracts.manage', write: true }, (_e, user, id) => {
    legal.removeContract(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.consultations.list, { permission: 'consultations.view' }, (_e, _u, q) => ok(legal.listConsultations(q as never)))
  handle(ipc, IPC.consultations.create, { permission: 'consultations.manage', write: true }, (_e, user, data) => ok(legal.createConsultation(user!, data as never)))
  handle(ipc, IPC.consultations.update, { permission: 'consultations.manage', write: true }, (_e, user, id, data) => ok(legal.updateConsultation(user!, String(id), data as never)))
  handle(ipc, IPC.consultations.remove, { permission: 'consultations.manage', write: true }, (_e, user, id) => {
    legal.removeConsultation(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.correspondence.list, { permission: 'correspondence.view' }, (_e, _u, q) => ok(legal.listCorrespondence(q as never)))
  handle(ipc, IPC.correspondence.create, { permission: 'correspondence.manage', write: true }, (_e, user, data) => ok(legal.createCorrespondence(user!, data as never)))
  handle(ipc, IPC.correspondence.update, { permission: 'correspondence.manage', write: true }, (_e, user, id, data) => ok(legal.updateCorrespondence(user!, String(id), data as never)))
  handle(ipc, IPC.correspondence.remove, { permission: 'correspondence.manage', write: true }, (_e, user, id) => {
    legal.removeCorrespondence(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.payments.list, { permission: 'accounts.view' }, (_e, _u, q) => ok(finance.listPayments(q as never)))
  handle(ipc, IPC.payments.balance, { permission: 'accounts.view' }, (_e, _u, clientId, caseId) =>
    ok(finance.paymentBalance(clientId ? String(clientId) : undefined, caseId ? String(caseId) : undefined))
  )
  handle(ipc, IPC.payments.create, { permission: 'accounts.payment', write: true }, (_e, user, data) => ok(finance.createPayment(user!, data as never)))
  handle(ipc, IPC.payments.remove, { permission: 'accounts.payment', write: true }, (_e, user, id) => {
    finance.removePayment(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.expenses.list, { permission: 'accounts.view' }, (_e, _u, q) => ok(finance.listExpenses(q as never)))
  handle(ipc, IPC.expenses.create, { permission: 'accounts.expense', write: true }, (_e, user, data) => ok(finance.createExpense(user!, data as never)))
  handle(ipc, IPC.expenses.remove, { permission: 'accounts.expense', write: true }, (_e, user, id) => {
    finance.removeExpense(user!, String(id))
    return ok(true)
  })
  handle(ipc, IPC.expenses.categories, { permission: 'accounts.view' }, () => ok(finance.expenseCategories()))
  handle(ipc, IPC.expenses.staff, { permission: 'accounts.expense' }, () => ok(people.listPayrollEmployees()))

  handle(ipc, IPC.invoices.list, { permission: 'invoices.view' }, (_e, _u, q) => ok(finance.listInvoices(q as never)))
  handle(ipc, IPC.invoices.get, { permission: 'invoices.view' }, (_e, _u, id) => ok(finance.getInvoice(String(id))))
  handle(ipc, IPC.invoices.create, { permission: 'invoices.manage', write: true }, (_e, user, data) => ok(finance.createInvoice(user!, data as never)))
  handle(ipc, IPC.invoices.update, { permission: 'invoices.manage', write: true }, (_e, user, id, data) => ok(finance.updateInvoice(user!, String(id), data as never)))
  handle(ipc, IPC.invoices.remove, { permission: 'invoices.manage', write: true }, (_e, user, id) => {
    finance.removeInvoice(user!, String(id))
    return ok(true)
  })

  handle(ipc, IPC.cashbox.list, { permission: 'cashbox.view' }, () => ok(finance.listCashboxes()))
  handle(ipc, IPC.cashbox.create, { permission: 'accounts.view', write: true }, (_e, user, data) => ok(finance.createCashbox(user!, data as never)))
  handle(ipc, IPC.cashbox.update, { permission: 'accounts.view', write: true }, (_e, _u, id, data) => ok(finance.updateCashbox(String(id), data as never)))
  handle(ipc, IPC.cashbox.transactions, { permission: 'cashbox.view' }, (_e, _u, id, q) => ok(finance.cashboxTransactions(String(id), q as never)))
  handle(ipc, IPC.cashbox.move, { permission: 'accounts.payment', write: true }, (_e, user, data) => ok(finance.moveCash(user!, data as never)))

  handle(ipc, IPC.reports.run, { permission: 'reports.view' }, (_e, _u, q) => ok(reports.runReport(q as never)))
  handle(ipc, IPC.reports.export, { permission: 'reports.view' }, async (_e, _u, q, format) => {
    const r = await reports.exportReport(q as never, format as 'xlsx' | 'csv')
    const ext = format === 'csv' ? 'csv' : 'xlsx'
    const win = getWin()
    const save = win
      ? await dialog.showSaveDialog(win, {
          defaultPath: `report-${(q as { type?: string }).type || 'data'}.${ext}`,
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
        })
      : await dialog.showSaveDialog({
          defaultPath: `report-${(q as { type?: string }).type || 'data'}.${ext}`,
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
        })
    if (save.canceled || !save.filePath) return ok({ canceled: true })
    fs.copyFileSync(r.file, save.filePath)
    await shell.openPath(save.filePath)
    return ok({ canceled: false, file: save.filePath })
  })
  handle(ipc, IPC.search.global, {}, (_e, _u, term) => ok(reports.globalSearch(String(term))))
  handle(ipc, IPC.search.advanced, { permission: 'cases.view' }, (_e, _u, f) => ok(reports.advancedSearch(f as never)))
  handle(ipc, IPC.audit.list, { permission: 'audit.view' }, (_e, _u, q) => ok(reports.listAudit(q as never)))
  handle(ipc, IPC.audit.remove, { permission: 'audit.delete', write: true }, (_e, user, ids) => {
    if (user!.roleCode !== 'admin') return fail('حذف سجل العمليات متاح للمدير فقط')
    const list = Array.isArray(ids) ? (ids as string[]) : [String(ids)]
    reports.deleteAudit(list)
    return ok(true)
  })

  handle(ipc, IPC.backup.create, { permission: 'backup.manage', write: true }, (_e, user, dir) => ok(backup.createBackup(user!, dir as string)))
  handle(ipc, IPC.backup.list, { permission: 'backup.manage' }, (_e, _u, dir) => ok(backup.listBackups(dir as string)))
  handle(ipc, IPC.backup.restore, { permission: 'backup.manage', write: true }, (_e, user, file) => ok(backup.restoreBackup(user!, String(file))))
  handle(ipc, IPC.backup.schedule, { permission: 'backup.manage', write: true }, (_e, user, sch, dir) =>
    ok(backup.setBackupSchedule(user!, String(sch), String(dir)))
  )

  handle(ipc, IPC.files.gc, { permission: 'settings.manage', write: true }, (_e, user) => ok(documents.garbageCollectOrphans(user)))
  handle(ipc, IPC.files.pick, {}, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (res.canceled || !res.filePaths[0]) return fail('تم الإلغاء')
    const p = res.filePaths[0]
    const buf = fs.readFileSync(p)
    return ok({ name: p.split(/[/\\]/).pop(), data: Array.from(buf), mime: '' })
  })

  handle(ipc, IPC.print.printers, {}, async () => ok(await print.listPrinters(getWin())))
  handle(ipc, IPC.print.pdf, {}, async (_e, _u, kind, title, body, name) => {
    const html = wrapHtml(String(title), String(body), kind as print.PrintKind)
    return ok(await print.savePdf(html, kind as print.PrintKind, String(name || 'doc.pdf'), getWin()))
  })
  handle(ipc, IPC.print.print, {}, async (_e, _u, kind, title, body) => {
    const html = wrapHtml(String(title), String(body), kind as print.PrintKind)
    await print.printHtml(html, kind as print.PrintKind, getWin())
    return ok(true)
  })
  handle(ipc, IPC.print.manual, {}, async () => ok(await print.saveManualPdf(getWin())))
  handle(ipc, IPC.print.preview, { permission: 'invoices.view' }, (_e, _u, invoiceId) => {
    const data = getInvoice(String(invoiceId))
    const inv = data.invoice as { invoice_number: string; client_name: string; total: number; invoice_date: string }
    const items = data.items as { description: string; quantity: number; unit_price: number; total: number }[]
    const rows = items
      .map((i) => `<tr><td>${i.description}</td><td>${i.quantity}</td><td>${i.unit_price}</td><td>${i.total}</td></tr>`)
      .join('')
    const body = `<p>رقم الفاتورة: <b>${inv.invoice_number}</b> — العميل: ${inv.client_name} — التاريخ: ${inv.invoice_date}</p>
      <table><thead><tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="total">الإجمالي: ${inv.total}</p>`
    return ok({ title: 'فاتورة', body, kind: 'invoice' })
  })
  handle(ipc, IPC.print.receipt, { permission: 'accounts.view' }, (_e, _u, paymentId) =>
    ok(finance.receiptPrintPayload(String(paymentId)))
  )
  handle(ipc, IPC.print.voucher, { permission: 'accounts.view' }, (_e, _u, expenseId) =>
    ok(finance.voucherPrintPayload(String(expenseId)))
  )

  handle(ipc, IPC.updater.check, { auth: false }, async () => ok(await updater.checkUpdates()))
  handle(ipc, IPC.updater.version, { auth: false }, () => ok(updater.appVersion()))
  handle(ipc, IPC.updater.install, { auth: false }, () => ok(updater.installUpdate()))
  handle(ipc, IPC.demo.seed, { permission: 'settings.manage', write: true }, (_e, user, mode) => {
    if (String(mode || '') === 'wipe') return ok(wipe.wipeBusinessData(user!))
    return ok(demo.seedDemoData())
  })
  handle(ipc, IPC.demo.wipe, { permission: 'settings.manage', write: true }, (_e, user) => ok(wipe.wipeBusinessData(user!)))

  handle(ipc, IPC.sync.status, {}, () => ok(getSyncState()))
  handle(ipc, IPC.sync.now, { permission: 'settings.manage' }, async () => {
    await runSyncCycle()
    return ok(getSyncState())
  })
}
