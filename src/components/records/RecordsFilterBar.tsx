'use client'

/**
 * RecordsFilterBar / RecordsPagination
 * ------------------------------------
 * 給「全員紀錄」類分頁（打卡／請假／加班／出差）共用的篩選列與分頁列，
 * 視覺對齊打卡紀錄管理（AdminAttendanceClient）的篩選列／分頁列。
 *
 * 設計原則：**純受控**。元件自己不持有篩選狀態、不碰 router、不打 API，
 * 值與 onChange 一律由呼叫端給；因此三個頁面各自的資料流（server searchParams
 * 或 client state）都不用改。
 *
 * 每個欄位都是 optional，**傳了對應的 onChange 才會出現**：
 *   - 月份：`onMonthChange`（值 `month`，格式 `YYYY-MM`，空字串＝全部月份）
 *   - 員工：`onEmployeeChange` + `employees`（值 `employeeId`，預設「全部」哨兵值＝`''`）
 *   - 狀態：`onStatusChange` + `statuses`（值 `status`，預設「全部」哨兵值＝`'all'`）
 * 只傳月份就只顯示月份。額外的自訂欄位用 `children`（會排在狀態後面、樣式自理）。
 *
 * 用法（伺端 searchParams 驅動的頁面）：
 * ```tsx
 * <RecordsFilterBar
 *   month={month}
 *   onMonthChange={m => router.push(`?month=${m}`)}
 *   employees={users.map(u => ({ value: u.id, label: u.display_name }))}
 *   employeeId={userId}
 *   onEmployeeChange={id => router.push(...)}
 *   statuses={[{ value: 'pending', label: t('pending') }]}
 *   status={status}
 *   onStatusChange={s => router.push(...)}
 *   totalCount={filtered.length}
 * />
 * <RecordsPagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
 * ```
 *
 * i18n 一律走 `common.recordFilters`（三語皆已備齊）；`totalCount` / `pageLabel`
 * 是含 `<b>` 的 rich text，元件內部已用 chunk renderer 處理，呼叫端不必管。
 */

import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** 下拉選項；label 請由呼叫端先翻譯好 */
export interface RecordsFilterOption {
  value: string
  label: string
}

export interface RecordsFilterBarProps {
  /** 月份值，格式 `YYYY-MM`；空字串＝全部月份 */
  month?: string
  /** 有傳才顯示月份欄位 */
  onMonthChange?: (month: string) => void
  /** 允許「全部月份」：月份有值時多顯示一顆清除鈕（清成 `''`） */
  allowAllMonths?: boolean

  /** 員工下拉選項（不含「全部員工」，元件會自己補在第一項） */
  employees?: RecordsFilterOption[]
  /** 目前選到的員工值 */
  employeeId?: string
  /** 有傳（且 employees 非空）才顯示員工欄位 */
  onEmployeeChange?: (employeeId: string) => void
  /** 「全部員工」的哨兵值，預設 `''` */
  allEmployeesValue?: string

  /** 狀態下拉選項（不含「全部狀態」，元件會自己補在第一項） */
  statuses?: RecordsFilterOption[]
  /** 目前選到的狀態值 */
  status?: string
  /** 有傳（且 statuses 非空）才顯示狀態欄位 */
  onStatusChange?: (status: string) => void
  /** 「全部狀態」的哨兵值，預設 `'all'` */
  allStatusesValue?: string

  /** 右側「共 N 筆」；為 0 時改顯示篩選提示，不傳則整塊不顯示 */
  totalCount?: number

  /** 額外自訂欄位，排在狀態欄位之後 */
  children?: ReactNode
  className?: string
}

const FIELD_CLASS =
  'h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus:border-transparent cursor-pointer'
const SELECT_CLASS = `${FIELD_CLASS} pr-8 appearance-none`
const LABEL_CLASS = 'text-xs font-medium text-slate-600 dark:text-slate-400'

export function RecordsFilterBar({
  month,
  onMonthChange,
  allowAllMonths = false,
  employees,
  employeeId,
  onEmployeeChange,
  allEmployeesValue = '',
  statuses,
  status,
  onStatusChange,
  allStatusesValue = 'all',
  totalCount,
  children,
  className = '',
}: RecordsFilterBarProps) {
  const t = useTranslations('common.recordFilters')
  // 同一頁可能同時放多個篩選列，id 必須唯一才不會讓 <label for> 指錯欄位
  const uid = useId()

  const showMonth = !!onMonthChange
  const showEmployee = !!onEmployeeChange && !!employees?.length
  const showStatus = !!onStatusChange && !!statuses?.length

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-end gap-4">
        {showMonth && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-month`} className={LABEL_CLASS}>
              {t('monthLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${uid}-month`}
                type="month"
                value={month ?? ''}
                onChange={e => onMonthChange?.(e.target.value)}
                className={FIELD_CLASS}
              />
              {allowAllMonths && !!month && (
                <button
                  type="button"
                  onClick={() => onMonthChange?.('')}
                  className="text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md px-2 py-1.5 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {t('allMonths')}
                </button>
              )}
            </div>
          </div>
        )}

        {showEmployee && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-employee`} className={LABEL_CLASS}>
              {t('employeeLabel')}
            </label>
            <select
              id={`${uid}-employee`}
              value={employeeId ?? allEmployeesValue}
              onChange={e => onEmployeeChange?.(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value={allEmployeesValue}>{t('allEmployees')}</option>
              {employees!.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {showStatus && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-status`} className={LABEL_CLASS}>
              {t('statusLabel')}
            </label>
            <select
              id={`${uid}-status`}
              value={status ?? allStatusesValue}
              onChange={e => onStatusChange?.(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value={allStatusesValue}>{t('allStatuses')}</option>
              {statuses!.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {children}

        {totalCount !== undefined && (
          <div className="ml-auto text-sm text-slate-500 dark:text-slate-400 self-end pb-0.5">
            {totalCount === 0 ? (
              t('noRecordsHint')
            ) : (
              t.rich('totalCount', {
                count: totalCount,
                b: chunks => (
                  <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">{chunks}</span>
                ),
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export interface RecordsPaginationProps {
  /** 目前頁碼，1-based */
  page: number
  /** 總頁數（至少 1） */
  totalPages: number
  /** 總筆數，用於「共 N 筆」 */
  totalCount: number
  onPageChange: (page: number) => void
  /** 只有一頁時仍顯示（預設 false＝隱藏，與打卡紀錄管理一致） */
  alwaysShow?: boolean
  className?: string
}

/**
 * 分頁列。通常直接接在表格容器（rounded-xl border ...）內側最下方，
 * 自帶上邊框與淺灰底，因此放在表格 <div> 內即可，不必再包一層。
 */
export function RecordsPagination({
  page,
  totalPages,
  totalCount,
  onPageChange,
  alwaysShow = false,
  className = '',
}: RecordsPaginationProps) {
  const t = useTranslations('common.recordFilters')
  if (!alwaysShow && totalPages <= 1) return null

  const navClass =
    'inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600'

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 ${className}`}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
        {t.rich('pageLabel', {
          page,
          b: chunks => <span className="font-semibold text-slate-700 dark:text-slate-300">{chunks}</span>,
        })}
        &ensp;
        {t.rich('totalCount', {
          count: totalCount,
          b: chunks => <span className="font-semibold text-slate-700 dark:text-slate-300">{chunks}</span>,
        })}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label={t('prevPage')}
          className={navClass}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          {t('prevPage')}
        </button>
        <span className="text-xs text-slate-400 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label={t('nextPage')}
          className={navClass}
        >
          {t('nextPage')}
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
