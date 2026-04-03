'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Clock, CalendarDays, FileText, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const PRIMARY_ITEMS = [
  { href: '/', label: '首頁', icon: LayoutDashboard },
  { href: '/attendance', label: '打卡', icon: Clock },
  { href: '/leave', label: '請假', icon: CalendarDays },
  { href: '/documents', label: '文件', icon: FileText },
]

export function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-stretch safe-area-inset-bottom">
        {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors',
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          )
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-slate-500 dark:text-slate-400"
        >
          <MoreHorizontal size={20} />
          <span>更多</span>
        </button>
      </nav>

      {/* More drawer */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-800 rounded-t-2xl p-4 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-4 gap-3">
              {[
                { href: '/overtime', label: '加班', emoji: '💼' },
                { href: '/announcements', label: '公告', emoji: '📢' },
                { href: '/contracts', label: '合約', emoji: '📝' },
                { href: '/payroll', label: '薪資', emoji: '💰' },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-700"
                >
                  <span className="text-2xl">{item.emoji}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
