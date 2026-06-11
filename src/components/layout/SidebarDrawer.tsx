'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Menu } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import type { User } from '@/types'
import type { FeatureFlags } from '@/lib/feature-flag-keys'

interface SidebarDrawerProps {
  user: User
  features: FeatureFlags
}

/**
 * Tablet (md–lg) navigation: a 56px top app bar with a hamburger trigger that
 * opens the full Sidebar as a left slide-in drawer overlay.
 * Hidden on phones (<md, BottomNav) and desktop (>=lg, fixed Sidebar).
 */
export function SidebarDrawer({ user, features }: SidebarDrawerProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  // Auto-close on route change: adjust state during render when the pathname
  // differs from the one the drawer was opened on (avoids an extra effect pass).
  const [openedAtPathname, setOpenedAtPathname] = useState(pathname)
  if (pathname !== openedAtPathname) {
    setOpenedAtPathname(pathname)
    setOpen(false)
  }

  // ESC to close + body scroll lock while open
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <>
      {/* Top app bar — tablet only */}
      <header className="hidden md:flex lg:hidden shrink-0 items-center gap-2 h-14 px-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('openMenu')}
          aria-expanded={open}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <Link
          href="/"
          className="font-semibold text-slate-900 dark:text-slate-100 text-lg font-[Lexend] hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          myOPS
        </Link>
      </header>

      {/* Slide-in drawer overlay — tablet only */}
      {open && (
        <div
          className="hidden md:block lg:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={t('openMenu')}
        >
          {/* Backdrop mask: tap to close */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
            onClick={close}
            aria-hidden="true"
          />
          {/* Drawer panel: reuses the full Sidebar in drawer mode */}
          <div className="absolute inset-y-0 left-0 shadow-xl motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-250 motion-safe:ease-in-out">
            <Sidebar user={user} features={features} variant="drawer" onClose={close} />
          </div>
        </div>
      )}
    </>
  )
}
