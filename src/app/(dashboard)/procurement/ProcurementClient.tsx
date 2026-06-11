'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, Package, ClipboardCheck, Inbox, ChevronRight } from 'lucide-react'
import { DOC_TYPE_META, type DocType } from '@/lib/procurement/doc-types'
import { cn } from '@/lib/utils'

interface InboxItem {
  doc_type: DocType
  doc_id: string
  doc_no: string
  step_no: number
  applicant: { id: string | null; display_name: string | null }
  arrived_at: string
}

/**
 * Detail routes per document type. Phase A ships the evaluation forms only;
 * the remaining document types open in Phase B (rows shown disabled).
 */
function docDetailHref(item: InboxItem): string | null {
  switch (item.doc_type) {
    case 'vendor_evaluation':
      return `/procurement/evaluations/vendor/${item.doc_id}`
    case 'product_evaluation':
      return `/procurement/evaluations/product/${item.doc_id}`
    default:
      return null // Phase B
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // YYYY-MM-DD HH:mm (Asia/Taipei)
  return d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function ProcurementClient() {
  const t = useTranslations('procurement')
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/procurement/inbox')
        if (res.status === 403) {
          // No procurement access and nothing pending — show an empty inbox
          if (!cancelled) setItems([])
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setItems(json.data ?? [])
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const quickLinks = [
    { href: '/procurement/vendors', icon: Building2, label: t('nav.vendors'), desc: t('nav.vendorsDesc') },
    { href: '/procurement/products', icon: Package, label: t('nav.products'), desc: t('nav.productsDesc') },
    { href: '/procurement/evaluations', icon: ClipboardCheck, label: t('nav.evaluations'), desc: t('nav.evaluationsDesc') },
  ]

  return (
    <div className="space-y-6">
      {/* Quick entry cards */}
      <section aria-label={t('nav.quickLinks')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickLinks.map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 p-4 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors duration-150 active:scale-[0.97] cursor-pointer"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                <Icon size={20} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{desc}</p>
              </div>
              <ChevronRight size={16} className="ml-auto shrink-0 text-slate-400" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {/* Approval inbox */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Inbox size={20} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t('inbox.title')}</h2>
          {items !== null && items.length > 0 && (
            <span className="ml-auto text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900 tabular-nums">
              {t('inbox.pendingCount', { count: items.length })}
            </span>
          )}
        </div>

        {error ? (
          <p className="px-4 py-8 text-sm text-red-600 dark:text-red-400 text-center" role="alert">
            {t('inbox.loadError')}
          </p>
        ) : items === null ? (
          <div className="p-4 space-y-2" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-sm text-slate-500 dark:text-slate-400 text-center">{t('inbox.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('inbox.docNo')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('inbox.docType')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('inbox.applicant')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('inbox.arrivedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const href = docDetailHref(item)
                  const typeLabel = t(DOC_TYPE_META[item.doc_type].labelKey as Parameters<typeof t>[0])
                  return (
                    <tr
                      key={`${item.doc_type}:${item.doc_id}`}
                      className={cn(
                        'border-b border-slate-100 dark:border-slate-700/60 last:border-b-0',
                        href ? 'hover:bg-slate-50 dark:hover:bg-slate-700/40' : 'opacity-60'
                      )}
                    >
                      <td className="px-4 py-3 font-medium tabular-nums whitespace-nowrap">
                        {href ? (
                          <Link
                            href={href}
                            className="inline-flex items-center min-h-[44px] -my-3 text-blue-600 dark:text-blue-400 hover:underline focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                          >
                            {item.doc_no}
                          </Link>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">{item.doc_no}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        <span className="inline-flex items-center gap-2">
                          {typeLabel}
                          {!href && (
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                              {t('inbox.phaseB')}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {item.applicant.display_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDateTime(item.arrived_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
