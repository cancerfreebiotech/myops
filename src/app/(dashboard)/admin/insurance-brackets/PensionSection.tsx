'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// 勞退月提繳工資分級表（Linda 7/30 回報 774a2ea3：沒有地方上傳勞退資料）。
// 與勞健保級距分開一個區塊，因為欄位不同——勞退表沒有「個人負擔／雇主負擔」，
// 只有「月提繳工資」；提繳金額是雇主 6%＋個人自願提繳率（在人事資料設定）。

export interface PensionBracket {
  id: string
  effective_year: number
  grade: number
  grade_label: string | null
  wage_floor: number
  wage_ceiling: number | null
  contribution_wage: number
}

interface PensionRow {
  grade: number
  grade_label: string | null
  wage_floor: number
  wage_ceiling: number | null
  contribution_wage: number
}

const SPREADSHEET_EXTS = ['xlsx', 'xls', 'csv']

const GRADE_KEYS = ['grade', '等級', '級', '級距']
const WAGE_KEYS = ['contributionwage', '月提繳工資', 'contribution_wage', '提繳工資', 'wage']
const FLOOR_KEYS = ['wagefloor', '實際工資下限', 'wage_floor', '下限']
const CEILING_KEYS = ['wageceiling', '實際工資上限', 'wage_ceiling', '上限']

const TEMPLATE_HEADERS = ['等級', '實際工資下限', '實際工資上限', '月提繳工資']

function findKey(headers: string[], aliases: string[]): string | null {
  for (const h of headers) {
    const normalized = h.toLowerCase().replace(/[\s_\-]/g, '')
    for (const alias of aliases) {
      if (normalized === alias.toLowerCase().replace(/[\s_\-]/g, '')) return h
    }
  }
  return null
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/,/g, ''))
    return isNaN(n) ? 0 : n
  }
  return 0
}

const fmt = (n: number | null) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'))

export function PensionSection({
  initialBrackets,
  viewYear,
  readOnly,
}: {
  initialBrackets: PensionBracket[]
  viewYear: number
  readOnly?: boolean
}) {
  const t = useTranslations('admin.pensionBrackets')
  const tm = useTranslations('admin.insuranceMgmt')
  const tc = useTranslations('common')
  const fileRef = useRef<HTMLInputElement>(null)

  const [brackets, setBrackets] = useState<PensionBracket[]>(initialBrackets)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [preview, setPreview] = useState<PensionRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [skippedRows, setSkippedRows] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/insurance-brackets/data')
      if (res.ok) {
        const json = await res.json()
        setBrackets(json.data.pension ?? [])
      }
    } catch {
      // 靜默：畫面仍顯示舊資料
    }
  }, [])

  const handleFile = useCallback((file: File) => {
    setParseError(null)
    setPreview(null)
    setSkippedRows(0)
    setFileName(file.name)

    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!SPREADSHEET_EXTS.includes(ext)) {
      setParseError(tm('unsupportedFileType', { ext: ext ? `.${ext}` : file.name }))
      return
    }

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' })
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
        if (raw.length === 0) { setParseError(tm('emptySpreadsheet')); return }

        const headers = Object.keys(raw[0])
        const wageKey = findKey(headers, WAGE_KEYS)
        if (!wageKey) { setParseError(t('missingWageColumn')); return }
        const gradeKey = findKey(headers, GRADE_KEYS)
        const floorKey = findKey(headers, FLOOR_KEYS)
        const ceilingKey = findKey(headers, CEILING_KEYS)

        const mapped: PensionRow[] = raw.map(r => {
          const gradeRaw = gradeKey ? r[gradeKey] : ''
          const gradeNum = parseNumber(gradeRaw)
          const label = typeof gradeRaw === 'string' ? gradeRaw.trim() : ''
          const ceiling = ceilingKey ? parseNumber(r[ceilingKey]) : 0
          return {
            grade: gradeNum,
            grade_label: gradeNum > 0 ? null : (label || null),
            wage_floor: floorKey ? parseNumber(r[floorKey]) : 0,
            // 最高級是「以上」，沒有上限 → 存 null 而不是 0
            wage_ceiling: ceiling > 0 ? ceiling : null,
            contribution_wage: parseNumber(r[wageKey]),
          }
        })

        const rows = mapped.filter(r => r.contribution_wage > 0)
        if (rows.length === 0) { setParseError(tm('noValidRows')); return }
        setSkippedRows(mapped.length - rows.length)
        setPreview(rows)
      } catch {
        setParseError(tm('parseFailed'))
      }
    }
    reader.readAsArrayBuffer(file)
  }, [t, tm])

  const handleUpload = async () => {
    if (!preview?.length) return
    setUploading(true)
    try {
      const res = await fetch('/api/admin/pension-brackets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, rows: preview }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(tm('uploadFailed', { error: json.error ?? tm('unknownError') }), { duration: 5000 })
      } else {
        toast.success(tm('uploadSuccess', { count: json.data.inserted, label: t('title'), year }))
        setPreview(null)
        setSkippedRows(0)
        setFileName(null)
        if (fileRef.current) fileRef.current.value = ''
        await refresh()
      }
    } catch {
      toast.error(tm('networkError'), { duration: 5000 })
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setPreview(null)
    setParseError(null)
    setSkippedRows(0)
    setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '勞退分級表')
    XLSX.writeFile(wb, 'pension-wage-brackets-template.xlsx')
  }

  const shown = brackets.filter(b => b.effective_year === viewYear)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <div className="bg-slate-700 dark:bg-slate-900 px-5 py-3.5 flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-slate-200 dark:text-slate-300" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-50 dark:text-slate-100 font-[Lexend]">{t('title')}</h2>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('explain')}</p>

          {!readOnly && (
            <>
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="pension-year" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t('applyYear')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="pension-year"
                    type="number"
                    min={2020}
                    max={2099}
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="h-9 w-28 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-800 dark:text-slate-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-600"
                  />
                </div>
                {fileName && (
                  <span className="pt-4 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">{fileName}</span>
                )}
              </div>

              {!preview && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  onDragOver={e => e.preventDefault()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 py-8 cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:outline-none"
                >
                  <Upload size={28} className="text-slate-300 dark:text-slate-500" aria-hidden="true" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{tm('dropZoneTitle')}</p>
                  <p className="text-xs text-slate-400">{tm('requiredColumns', { columns: TEMPLATE_HEADERS.join('、') })}</p>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                className="sr-only"
              />

              {!preview && (
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <FileSpreadsheet size={13} aria-hidden="true" />
                  {tm('downloadTemplate')}
                </button>
              )}

              {parseError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3" role="alert">
                  <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="flex-1 text-sm text-red-700 dark:text-red-300">{parseError}</p>
                  <button onClick={reset} className="text-red-400 hover:text-red-600 cursor-pointer">
                    <RefreshCw size={14} aria-hidden="true" />
                  </button>
                </div>
              )}

              {preview && preview.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-600 dark:text-green-400" aria-hidden="true" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('parsedCount', { count: preview.length })}
                    </p>
                    <button onClick={reset} className="ml-auto text-xs text-slate-400 hover:text-slate-600 cursor-pointer px-1">
                      {tm('reselect')}
                    </button>
                  </div>
                  {skippedRows > 0 && (
                    <p className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      {tm('skippedRows', { count: skippedRows })}
                    </p>
                  )}
                  <Button onClick={handleUpload} disabled={uploading} className="min-h-[40px]">
                    {uploading ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
                    {uploading ? tc('saving') : t('confirmUpload', { year })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 現有資料 */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-700/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('grade')}</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('wageRange')}</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('contributionWage')}</th>
              <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('employer6')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {shown.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">{t('noData', { year: viewYear })}</td></tr>
            ) : shown.map(b => (
              <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <td className="px-3 py-1.5 tabular-nums text-slate-700 dark:text-slate-300">{b.grade_label ?? b.grade}</td>
                <td className="px-3 py-1.5 tabular-nums text-right text-slate-500 dark:text-slate-400">
                  {fmt(b.wage_floor)} – {b.wage_ceiling == null ? t('andAbove') : fmt(b.wage_ceiling)}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-right font-medium text-slate-700 dark:text-slate-300">
                  {fmt(b.contribution_wage)}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-right text-slate-500 dark:text-slate-400">
                  {fmt(Math.round(Number(b.contribution_wage) * 0.06))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
