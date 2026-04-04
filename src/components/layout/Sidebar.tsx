'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useLocale } from 'next-intl'
import {
  LayoutDashboard, FileText, Megaphone, FileSignature,
  Clock, CalendarDays, Timer, DollarSign, FolderKanban,
  Settings, MessageSquarePlus, ChevronLeft, ChevronRight,
  Users, Building2, BookOpen, AlertCircle, ClipboardList,
  SlidersHorizontal, MessageCircle, Sun, Moon, Globe, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { User } from '@/types'

interface SidebarProps {
  user: User
}

type NavItem = { href: string; label: string; icon: React.ElementType }

const LANGUAGES = [
  { code: 'zh-TW', label: '中文' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
] as const

function SectionHeader({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 mx-3 border-t border-slate-200 dark:border-slate-700" />
  return (
    <div className="px-4 pt-4 pb-1">
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function NavLink({ href, label, icon: Icon, collapsed, active }: NavItem & { collapsed: boolean; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors duration-150 min-h-[44px]',
        active
          ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
      )}
    >
      <Icon size={20} className="shrink-0" aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </Link>
  )
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const activeLocale = useLocale()
  const [collapsed, setCollapsed] = useState(false)
  const isAdmin = user.role === 'admin'

  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.2.2'
  const deployTimeRaw = process.env.NEXT_PUBLIC_DEPLOY_TIME ?? ''
  let deployTime = ''
  if (deployTimeRaw) {
    const utc = new Date(deployTimeRaw.replace(' ', 'T') + ':00Z')
    const taipei = new Date(utc.getTime() + 8 * 60 * 60 * 1000)
    deployTime = taipei.toISOString().slice(0, 16).replace('T', ' ')
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const handleLanguageChange = async (lang: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('users')
      .update({ language: lang })
      .eq('id', user.id)
    if (error) { toast.error('語言切換失敗'); return }
    // Set locale cookie so next-intl picks it up
    document.cookie = `locale=${lang};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax;Secure`
    window.location.reload()
  }

  const dmsItems: NavItem[] = [
    { href: '/documents',    label: '文件',   icon: FileText },
    { href: '/announcements',label: '公告',   icon: Megaphone },
    { href: '/contracts',    label: '合約',   icon: FileSignature },
  ]

  const hrItems: NavItem[] = [
    { href: '/attendance', label: '打卡',   icon: Clock },
    { href: '/leave',      label: '請假',   icon: CalendarDays },
    { href: '/overtime',   label: '加班',   icon: Timer },
    { href: '/payroll',    label: '薪資',   icon: DollarSign },
    { href: '/projects',   label: '專案',   icon: FolderKanban },
  ]

  const adminItems: NavItem[] = isAdmin ? [
    { href: '/admin/users',                 label: '使用者',   icon: Users },
    { href: '/admin/departments',           label: '部門',     icon: Building2 },
    { href: '/admin/companies',             label: '公司',     icon: Building2 },
    { href: '/admin/leave-types',           label: '假別管理', icon: ClipboardList },
    { href: '/admin/leave-balances',        label: '假別額度', icon: CalendarDays },
    { href: '/admin/overtime-rates',        label: '加班費率', icon: SlidersHorizontal },
    { href: '/admin/insurance-brackets',    label: '勞健保級距', icon: ClipboardList },
    { href: '/admin/bonuses',               label: '獎金管理', icon: DollarSign },
    { href: '/admin/payroll/anomalies',     label: '薪資異常', icon: AlertCircle },
    { href: '/admin/attendance-anomalies',  label: '出勤異常', icon: AlertCircle },
    { href: '/admin/feedback',              label: '回饋管理', icon: MessageCircle },
    { href: '/admin/audit',                 label: '稽核紀錄', icon: BookOpen },
    { href: '/admin/settings',              label: '系統設定', icon: Settings },
  ] : []

  return (
    <aside className={cn(
      'flex flex-col h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-200',
      collapsed ? 'w-16' : 'w-56'
    )}>
      {/* Logo + version */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700">
        {!collapsed && (
          <div>
            <Link href="/" className="font-semibold text-slate-900 dark:text-slate-100 text-lg font-[Lexend] hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              myOPS
            </Link>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
              v{version}{deployTime ? ` · ${deployTime}` : ''}
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? '展開選單' : '收合選單'}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer transition-colors duration-150"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3" aria-label="主選單">
        {/* Dashboard */}
        <NavLink href="/" label="總覽" icon={LayoutDashboard} collapsed={collapsed} active={isActive('/')} />

        {/* DMS */}
        <SectionHeader label="文件管理" collapsed={collapsed} />
        {dmsItems.map(item => (
          <NavLink key={item.href} {...item} collapsed={collapsed} active={isActive(item.href)} />
        ))}

        {/* HR */}
        <SectionHeader label="人資管理" collapsed={collapsed} />
        {hrItems.map(item => (
          <NavLink key={item.href} {...item} collapsed={collapsed} active={isActive(item.href)} />
        ))}

        {/* Other */}
        <SectionHeader label="其他" collapsed={collapsed} />
        <NavLink href="/settings"     label="個人設定" icon={Settings}          collapsed={collapsed} active={isActive('/settings')} />
        <NavLink href="/feedback/new" label="回饋"     icon={MessageSquarePlus} collapsed={collapsed} active={isActive('/feedback/new')} />

        {/* Admin */}
        {adminItems.length > 0 && (
          <>
            <SectionHeader label="管理後台" collapsed={collapsed} />
            {adminItems.map(item => (
              <NavLink key={item.href} {...item} collapsed={collapsed} active={isActive(item.href)} />
            ))}
          </>
        )}
      </nav>

      {/* Theme + Language toggles */}
      {!collapsed && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
          {/* Dark / Light toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? '切換淺色模式' : '切換深色模式'}
            className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Language selector */}
          <div className="flex items-center gap-0.5 ml-auto">
            <Globe size={14} className="text-slate-400 mr-1" aria-hidden="true" />
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer',
                  activeLocale === lang.code
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User info + logout */}
      {!collapsed ? (
        <div className="flex items-center border-t border-slate-200 dark:border-slate-700">
          <Link
            href="/settings"
            className="flex-1 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer block min-w-0"
          >
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
              {user.display_name ?? user.email}
            </p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </Link>
          <button
            onClick={handleLogout}
            aria-label="登出"
            className="p-3 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <div className="border-t border-slate-200 dark:border-slate-700 flex justify-center py-2">
          <button
            onClick={handleLogout}
            aria-label="登出"
            className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-md transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </aside>
  )
}
