'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'

export type SortDir = 'asc' | 'desc'

// ISO date / datetime strings (e.g. 2026-06-13 or 2026-06-13T08:00:00Z) compare correctly as plain strings
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

/** null/undefined always last; numbers numerically; ISO dates lexicographically; strings via zh locale. */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  if (ISO_DATE.test(sa) && ISO_DATE.test(sb)) return sa < sb ? -1 : sa > sb ? 1 : 0
  return sa.localeCompare(sb, 'zh-Hant')
}

export function useTableSort<T>(
  rows: T[],
  defaultKey?: string,
  defaultDir: SortDir = 'asc',
): { sorted: T[]; sortKey: string | null; sortDir: SortDir; toggleSort: (key: string) => void } {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey ?? null)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey]
      const bv = (b as Record<string, unknown>)[sortKey]
      // null/undefined stay last regardless of direction
      if (av == null || bv == null) return compareValues(av, bv)
      const cmp = compareValues(av, bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggleSort }
}

export function SortableHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: string
  currentKey: string | null
  dir: SortDir
  onSort: (key: string) => void
  className?: string
}) {
  const active = currentKey === sortKey
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`text-left font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex min-h-[44px] w-full cursor-pointer items-center gap-1 px-4 py-3 text-left transition-colors duration-150 hover:text-slate-900 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${active ? 'text-slate-900 dark:text-slate-100' : ''}`}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp size={14} aria-hidden className="shrink-0 text-blue-600 dark:text-blue-400" />
          ) : (
            <ArrowDown size={14} aria-hidden className="shrink-0 text-blue-600 dark:text-blue-400" />
          )
        ) : (
          <ArrowUpDown size={14} aria-hidden className="shrink-0 text-slate-300 dark:text-slate-600" />
        )}
      </button>
    </th>
  )
}

export function TableSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const t = useTranslations('procurement.table')
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden />
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8 pr-9 text-base md:text-base min-h-[44px] text-slate-900 dark:text-slate-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('clearSearch')}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors duration-150 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  )
}

export function usePagination<T>(
  rows: T[],
  pageSize = 20,
): { pageRows: T[]; page: number; setPage: (page: number) => void; totalPages: number; total: number } {
  const [page, setPage] = useState(1)

  // back to page 1 whenever the underlying rows change (search / sort / data refresh);
  // adjust state during render instead of in an effect (react-hooks/set-state-in-effect)
  const [prevRows, setPrevRows] = useState(rows)
  if (rows !== prevRows) {
    setPrevRows(rows)
    setPage(1)
  }

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)

  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  )

  return { pageRows, page: safePage, setPage, totalPages, total }
}

export function TablePagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}) {
  const t = useTranslations('procurement.table')
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-3 mt-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t('pageInfo', { page, totalPages, total })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label={t('prevPage')}
          className="min-h-[44px] min-w-[44px] cursor-pointer"
        >
          <ChevronLeft size={16} aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label={t('nextPage')}
          className="min-h-[44px] min-w-[44px] cursor-pointer"
        >
          <ChevronRight size={16} aria-hidden />
        </Button>
      </div>
    </div>
  )
}
