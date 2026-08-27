import type { ComponentType } from 'react'
import {
  LayoutDashboard, Users, Briefcase, Gavel, CalendarDays, ListTodo, Bell, FileText, ScrollText,
  FileSignature, UserX, Scale, IdCard, MessageSquare, Mail, Wallet, Landmark, Receipt, BarChart3,
  Archive, Shield, Settings, ClipboardList, LayoutGrid
} from 'lucide-react'

export const NAV_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  home: LayoutGrid,
  dashboard: LayoutDashboard,
  clients: Users,
  cases: Briefcase,
  hearings: Gavel,
  calendar: CalendarDays,
  tasks: ListTodo,
  reminders: Bell,
  documents: FileText,
  poa: ScrollText,
  contracts: FileSignature,
  opponents: UserX,
  lawyers: Scale,
  employees: IdCard,
  consultations: MessageSquare,
  correspondence: Mail,
  accounts: Wallet,
  cashbox: Landmark,
  expenses: Receipt,
  reports: BarChart3,
  invoices: Receipt,
  appointments: CalendarDays,
  archive: Archive,
  users: Shield,
  audit: ClipboardList,
  settings: Settings
}
