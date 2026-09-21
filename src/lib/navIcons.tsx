import type { ComponentType } from 'react'
import {
  LayoutDashboard, Users, Briefcase, Gavel, CalendarDays, ListTodo, Bell, FileText, ScrollText,
  FileSignature, UserX, IdCard, MessageSquare, Mail, Wallet, Landmark, Receipt, BarChart3,
  Archive, Shield, Settings, ClipboardList, LayoutGrid, Hammer, FileSearch
} from 'lucide-react'
import lawyerNav from '../assets/lawyer-nav.png'

function LawyerIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: 'hidden',
        border: '1.5px solid #c9a227',
        background: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
      aria-hidden
    >
      <img
        src={lawyerNav}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block', padding: 2 }}
      />
    </span>
  )
}

export const NAV_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  alerts: Bell,
  home: LayoutGrid,
  dashboard: LayoutDashboard,
  clients: Users,
  cases: Briefcase,
  hearings: Gavel,
  experts: FileSearch,
  calendar: CalendarDays,
  tasks: ListTodo,
  execution: Hammer,
  reminders: Bell,
  documents: FileText,
  poa: ScrollText,
  contracts: FileSignature,
  opponents: UserX,
  lawyers: LawyerIcon,
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
