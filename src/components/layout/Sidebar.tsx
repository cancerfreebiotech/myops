'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard, FileText, Megaphone, FileSignature,
  Clock, CalendarDays, Timer, DollarSign, FolderKanban,
  Settings, Shield, MessageSquarePlus, ChevronLeft, ChevronRight,
  Users, Building2, BookOpen, AlertCircle, ClipboardList, SlidersHorizontal, MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { User } from '@/types'

interface SidebarProps {
  user: User
}

export function Sidebar({ user }: SidebarProps) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isAdmin = user.role === 'admin'

  const navItems = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/documents', label: t('documents'), icon: FileText },
    { href: '/announcements', label: t('announcements'), icon: Megaphone },
    { href: '/contracts', label: t('contracts'), icon: FileSignature },
    { href: '/attendance', label: t('attendance'), icon: Clock },
    { href: '/leave', label: t('leave'), icon: CalendarDays },
    { href: '/overtime', label: t('overtime'), icon: Timer },
    { href: '/payroll', label: t('payroll'), icon: DollarSign },
    { href: '/projects', label: t('projects'), icon: FolderKanban },
    { href: '/settings', label: t('settings'), icon: Settings },
    { href: '/feedback/new', label: t('feedback'), icon: MessageSquarePlus },
  ]

  const adminItems = isAdmin ? [
    { href: '/admin/users', label: '使用者管理', icon: Users },
    { href: '/admin/departments', label: '部門管理', icon: Building2 },
    { href: '/admin/companies', label: '公司管理', icon: Building2 },
    { href: '/admin/leave-types', label: '假別管理', icon: ClipboardList },
    { href: '/admin/leave-balances', label: '假別額度', icon: CalendarDays },
    { href: '/admin/overtime-rates', label: '加班費率', icon: SlidersHorizontal },
    { href: '/admin/attendance-anomalies', label: '出勤異常', icon: AlertCircle },
    { href: '/admin/feedback', label: '回饋管理', icon: MessageCircle },
    { href: '/admin/audit', label: '稽核紀錄', icon: BookOpen },
    { href: '/admin/settings', label: '系統設定', icon: Settings },
  ] : []

  return (
    <aside className={cn(
      'flex flex-col h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-200',
      collapsed ? 'w-16' : 'w-56'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700">
        {!collapsed && (
          <span className="font-semibold text-slate-900 dark:text-slate-100 text-lg font-[Lexend]">myOPS</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors min-h-[44px]',
                active
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
        {adminItems.length > 0 && (
          <>
            {!collapsed && (
              <div className="px-4 pt-4 pb-1">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={12} /> 管理
                </p>
              </div>
            )}
            {collapsed && <div className="my-2 mx-3 border-t border-slate-200 dark:border-slate-700" />}
            {adminItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-colors min-h-[40px]',
                    active
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 truncate">{user.display_name ?? user.email}</p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
        </div>
      )}
    </aside>
  )
}
