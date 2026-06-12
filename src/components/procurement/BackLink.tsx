'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'

// 採購模組共用「返回上一頁」— router.back()，無瀏覽歷史時退回 fallbackHref 列表頁。
export function BackLink({ fallbackHref }: { fallbackHref?: string }) {
  const router = useRouter()
  const t = useTranslations('common')

  const handleClick = () => {
    if (fallbackHref && window.history.length <= 1) {
      router.push(fallbackHref)
      return
    }
    router.back()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 min-h-[44px] text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer rounded transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
    >
      <ArrowLeft size={16} aria-hidden />
      {t('back')}
    </button>
  )
}
