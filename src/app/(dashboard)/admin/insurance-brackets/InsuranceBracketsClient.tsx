'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PensionSection, type PensionBracket } from './PensionSection'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LaborBracket {
  id: string
  effective_year: number
  grade: number
  grade_label?: string | null
  insured_salary: number
  employee_share: number
  employer_share: number
  created_at: string
}

interface HealthBracket {
  id: string
  effective_year: number
  grade: number
  grade_label?: string | null
  insured_salary: number
  employee_share: number
  employee_dependents: number
  employer_share: number
  created_at: string
}

interface LaborRow {
  grade: number
  /** 級別的原始文字：官方表第 1 級之前的「部分工時」等非數字級別存於此 */
  grade_label: string | null
  insured_salary: number
  employee_share: number
  employer_share: number
}

interface HealthRow {
  grade: number
  grade_label: string | null
  insured_salary: number
  employee_share: number
  employee_dependents: number
  employer_share: number
}

interface Props {
  initialLaborBrackets: LaborBracket[]
  initialHealthBrackets: HealthBracket[]
  /** 勞退月提繳工資分級表（欄位與勞健保不同，另一個區塊處理）*/
  initialPensionBrackets?: PensionBracket[]
  readOnly?: boolean
}

// ─── Column header aliases ────────────────────────────────────────────────────

const GRADE_KEYS = ['grade', '等級', 'Grade', '級距']
const SALARY_KEYS = ['insuredsalary', '投保薪資', 'insured_salary', 'salary', '月投保薪資']
const EMP_SHARE_KEYS = ['employeeshare', '個人負擔', 'employee_share', '員工負擔', '被保險人自付']
const EMP_DEPENDENTS_KEYS = ['employeedependents', '眷屬', 'employee_dependents', '眷屬負擔', '眷口數']
const EMP_EMPLOYER_KEYS = ['employershare', '雇主負擔', 'employer_share', '雇主自付']

/** 只接受試算表；官方級距表多為 PDF，需先另存為 xlsx/csv */
const SPREADSHEET_EXTS = ['xlsx', 'xls', 'csv']

/** 範本欄名（第一個別名即為範本使用的中文欄名）*/
const TEMPLATE_HEADERS = {
  labor: ['等級', '投保薪資', '個人負擔', '雇主負擔'],
  health: ['等級', '投保薪資', '個人負擔', '眷屬負擔', '雇主負擔'],
} as const

/**
 * 產生空白範本：只有欄名、不放任何示範數字。
 * 刻意不填示範值——級距金額填錯一格就是全員保費算錯，而範本裡的假數字若沒被刪掉
 * 就會直接變成一筆有效級距。欄名足以說明格式，數字一律由官方級距表填入。
 */
function downloadTemplate(type: 'labor' | 'health') {
  const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS[type]]])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, type === 'labor' ? '勞保級距' : '健保級距')
  XLSX.writeFile(wb, type === 'labor' ? 'labor-insurance-brackets-template.xlsx' : 'health-insurance-brackets-template.xlsx')
}

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

// ─── Upload Panel ─────────────────────────────────────────────────────────────

interface UploadPanelProps {
  type: 'labor' | 'health'
  label: string
  onSuccess: () => void
}

function UploadPanel({ type, label, onSuccess }: UploadPanelProps) {
  const t = useTranslations('admin.insuranceBrackets')
  const tm = useTranslations('admin.insuranceMgmt')
  const fileRef = useRef<HTMLInputElement>(null)
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [preview, setPreview] = useState<(LaborRow | HealthRow)[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [skippedRows, setSkippedRows] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    setParseError(null)
    setPreview(null)
    setSkippedRows(0)
    setFileName(file.name)

    // 先擋檔案格式：accept 只約束「選檔對話框」，拖放進來的檔案完全不受限制。
    // Linda 7/29 回報 b1203e93 就是把勞保局／健保署的官方 PDF 拖進來，
    // XLSX.read 讀 PDF 不會拋錯、只會解出一堆亂碼欄名，最後顯示成
    // 「找不到必要欄位」——訊息完全指錯方向。這裡直接說是檔案格式不支援。
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!SPREADSHEET_EXTS.includes(ext)) {
      setParseError(tm('unsupportedFileType', { ext: ext ? `.${ext}` : file.name }))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (raw.length === 0) {
          setParseError(tm('emptySpreadsheet'))
          return
        }

        const headers = Object.keys(raw[0])

        const gradeKey = findKey(headers, GRADE_KEYS)
        const salaryKey = findKey(headers, SALARY_KEYS)
        const empShareKey = findKey(headers, EMP_SHARE_KEYS)
        const emplShareKey = findKey(headers, EMP_EMPLOYER_KEYS)

        if (!gradeKey || !salaryKey || !empShareKey || !emplShareKey) {
          const missing = [
            !gradeKey && tm('fieldGrade'),
            !salaryKey && tm('fieldInsuredSalary'),
            !empShareKey && tm('fieldEmployeeShare'),
            !emplShareKey && tm('fieldEmployerShare'),
          ].filter(Boolean)
          setParseError(tm('missingColumns', { fields: missing.join(tm('listSeparator')) }))
          return
        }

        // 判斷「這一列是不是級距資料」只看投保薪資，不看等級欄。
        // 官方表第 1 級之前的「部分工時」數級（11,100~28,590）等級欄是文字，
        // 舊寫法用 grade > 0 過濾，那 17 列會被靜默丟掉（Linda 7/30 回報 774a2ea3）。
        // 級別文字保留在 grade_label，排序仍用投保薪資，計算完全不受影響。
        const depKey = type === 'health' ? findKey(headers, EMP_DEPENDENTS_KEYS) : null
        if (type === 'health' && !depKey) {
          setParseError(tm('missingDependentsColumn'))
          return
        }

        const mapped = raw.map(r => {
          const gradeRaw = r[gradeKey]
          const gradeNum = parseNumber(gradeRaw)
          const label = typeof gradeRaw === 'string' ? gradeRaw.trim() : ''
          const base = {
            grade: gradeNum,
            // 等級是文字（部分工時）→ 存原文；是數字 → 不需要另存
            grade_label: gradeNum > 0 ? null : (label || null),
            insured_salary: parseNumber(r[salaryKey]),
            employee_share: parseNumber(r[empShareKey]),
            employer_share: parseNumber(r[emplShareKey]),
          }
          return type === 'labor'
            ? (base as LaborRow)
            : ({ ...base, employee_dependents: parseNumber(r[depKey!]) } as HealthRow)
        })

        const rows = mapped.filter(r => r.insured_salary > 0)
        const dropped = mapped.length - rows.length
        if (rows.length === 0) {
          setParseError(tm('noValidRows'))
          return
        }
        // 略過的列一定要說出來——靜默丟資料比丟資料更糟：Linda 少了 17 級卻毫無提示
        setSkippedRows(dropped)
        setPreview(rows)
      } catch {
        setParseError(tm('parseFailed'))
      }
    }
    reader.readAsArrayBuffer(file)
  }, [type, tm])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleUpload = async () => {
    if (!preview || preview.length === 0) return
    setUploading(true)
    try {
      const res = await fetch('/api/admin/insurance-brackets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, year, rows: preview }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(tm('uploadFailed', { error: json.error ?? tm('unknownError') }), { duration: 5000 })
      } else {
        toast.success(tm('uploadSuccess', { count: json.data.inserted, label, year }))
        setPreview(null)
        setSkippedRows(0)
        setFileName(null)
        if (fileRef.current) fileRef.current.value = ''
        onSuccess()
      }
    } catch {
      toast.error(tm('networkError'), { duration: 5000 })
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setPreview(null)
    setParseError(null)
    setSkippedRows(0)
    setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const isLabor = type === 'labor'

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="bg-slate-700 dark:bg-slate-900 px-5 py-3.5 flex items-center gap-2">
        <FileSpreadsheet size={18} className="text-slate-200 dark:text-slate-300" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-gray-50 dark:text-slate-100 font-[Lexend]">{label} — {t('uploadLabel')}</h2>
      </div>

      <div className="p-5 space-y-4">
        {/* Year selector */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={`year-${type}`} className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('year')} <span className="text-red-500">*</span>
            </label>
            <input
              id={`year-${type}`}
              type="number"
              min={2020}
              max={2099}
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="h-9 w-28 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-800 dark:text-slate-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-600 focus:border-transparent"
            />
          </div>
          {fileName && (
            <div className="flex items-center gap-2 pt-4">
              <FileSpreadsheet size={14} className="text-slate-400" aria-hidden="true" />
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{fileName}</span>
            </div>
          )}
        </div>

        {/* Drop zone */}
        {!preview && !parseError && (
          <div
            role="button"
            tabIndex={0}
            aria-label={tm('dropZoneAria')}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 py-10 cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:outline-none"
          >
            <Upload size={32} className="text-slate-300 dark:text-slate-500" aria-hidden="true" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{tm('dropZoneTitle')}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{tm('supportedFormats')}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {tm('requiredColumns', { columns: TEMPLATE_HEADERS[type].join('、') })}
              </p>
            </div>
          </div>
        )}

        {/* 範本下載：官方級距表是 PDF，直接上傳一定失敗，先給一份填得進去的空白表 */}
        {!preview && (
          <button
            type="button"
            onClick={() => downloadTemplate(type)}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1"
          >
            <FileSpreadsheet size={13} aria-hidden="true" />
            {tm('downloadTemplate')}
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          aria-label={tm('uploadFileAria', { label })}
          onChange={handleInputChange}
          className="sr-only"
        />

        {/* Parse error */}
        {parseError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3" role="alert">
            <AlertCircle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-700 dark:text-red-300">{parseError}</p>
            </div>
            <button
              onClick={handleReset}
              aria-label={tm('clearErrorAria')}
              className="text-red-400 hover:text-red-600 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-600 rounded"
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Preview */}
        {preview && preview.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600 dark:text-green-400" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {tm.rich('parsedRowCount', {
                  count: preview.length,
                  num: (chunks) => <span className="tabular-nums font-semibold">{chunks}</span>,
                })}
              </p>
              <button
                onClick={handleReset}
                aria-label={tm('reselectFileAria')}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-600 rounded px-1"
              >
                {tm('reselect')}
              </button>
            </div>

            {/* 被略過的列一定要顯示：靜默丟掉 17 級部分工時就是這樣發生的 */}
            {skippedRows > 0 && (
              <p className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {tm('skippedRows', { count: skippedRows })}
              </p>
            )}

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-700/50">
                    <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{t('grade')}</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{t('insuredSalary')}</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{t('employeeShare')}</th>
                    {!isLabor && (
                      <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{t('dependents')}</th>
                    )}
                    <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">{t('employerShare')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {preview.slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-3 py-1.5 tabular-nums text-slate-700 dark:text-slate-300">
                        {row.grade_label ?? row.grade}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                        {row.insured_salary.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                        {row.employee_share.toLocaleString()}
                      </td>
                      {!isLabor && (
                        <td className="px-3 py-1.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                          {(row as HealthRow).employee_dependents.toLocaleString()}
                        </td>
                      )}
                      <td className="px-3 py-1.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                        {row.employer_share.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {preview.length > 5 && (
                    <tr>
                      <td
                        colSpan={isLabor ? 4 : 5}
                        className="px-3 py-1.5 text-center text-slate-400 dark:text-slate-500 italic"
                      >
                        {tm('moreRows', { count: preview.length - 5 })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Upload confirm button */}
            <Button
              onClick={handleUpload}
              disabled={uploading}
              aria-label={tm('confirmUploadAria', { year, label })}
              className="w-full bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-gray-50 transition-colors duration-150 cursor-pointer active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" aria-hidden="true" />
                  {tm('uploading')}
                </>
              ) : (
                <>
                  <Upload size={16} className="mr-2" aria-hidden="true" />
                  {tm('confirmUploadButton', { year, label })}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Brackets Table ───────────────────────────────────────────────────────────

interface LaborTableProps {
  brackets: LaborBracket[]
  year: number
}

function LaborTable({ brackets, year }: LaborTableProps) {
  const t = useTranslations('admin.insuranceBrackets')
  const tm = useTranslations('admin.insuranceMgmt')
  const filtered = brackets.filter(b => b.effective_year === year)

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileSpreadsheet size={36} className="text-slate-200 dark:text-slate-600 mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{tm('noYearData', { year, label: t('labor') })}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{tm('uploadHint')}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-700 dark:bg-slate-900">
            <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('grade')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('insuredSalary')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('employeeShare')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('employerShare')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map(b => (
            <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">{b.grade_label ?? b.grade}</td>
              <td className="px-4 py-2.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                NT$ {b.insured_salary.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                NT$ {b.employee_share.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                NT$ {b.employer_share.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface HealthTableProps {
  brackets: HealthBracket[]
  year: number
}

function HealthTable({ brackets, year }: HealthTableProps) {
  const t = useTranslations('admin.insuranceBrackets')
  const tm = useTranslations('admin.insuranceMgmt')
  const filtered = brackets.filter(b => b.effective_year === year)

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileSpreadsheet size={36} className="text-slate-200 dark:text-slate-600 mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{tm('noYearData', { year, label: t('health') })}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{tm('uploadHint')}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-700 dark:bg-slate-900">
            <th className="text-left px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('grade')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('insuredSalary')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('employeeShare')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('dependents')}</th>
            <th className="text-right px-4 py-3 font-medium text-slate-100 whitespace-nowrap">{t('employerShare')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map(b => (
            <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">{b.grade_label ?? b.grade}</td>
              <td className="px-4 py-2.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                NT$ {b.insured_salary.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                NT$ {b.employee_share.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                NT$ {b.employee_dependents.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-right text-slate-700 dark:text-slate-300">
                NT$ {b.employer_share.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function InsuranceBracketsClient({ initialLaborBrackets, initialHealthBrackets, initialPensionBrackets, readOnly }: Props) {
  const t = useTranslations('admin.insuranceBrackets')
  const tm = useTranslations('admin.insuranceMgmt')
  const tc = useTranslations('common')
  const [laborBrackets, setLaborBrackets] = useState<LaborBracket[]>(initialLaborBrackets)
  const [healthBrackets, setHealthBrackets] = useState<HealthBracket[]>(initialHealthBrackets)
  const [viewYear, setViewYear] = useState<number>(new Date().getFullYear())
  const [refreshing, setRefreshing] = useState(false)

  const refreshData = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/insurance-brackets/data')
      if (res.ok) {
        const json = await res.json()
        setLaborBrackets(json.data.labor ?? [])
        setHealthBrackets(json.data.health ?? [])
      }
    } catch {
      // silent — table still shows old data
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Derive available years from loaded data
  const availableYears = Array.from(
    new Set([
      ...laborBrackets.map(b => b.effective_year),
      ...healthBrackets.map(b => b.effective_year),
      new Date().getFullYear(),
    ])
  ).sort((a, b) => b - a)

  return (
    <div className="space-y-8">
      {/* Upload panels */}
      {!readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UploadPanel type="labor" label={t('labor')} onSuccess={refreshData} />
          <UploadPanel type="health" label={t('health')} onSuccess={refreshData} />
        </div>
      )}

      {/* View existing brackets */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 font-[Lexend]">
            {t('existingData')}
          </h2>

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="view-year" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t('year')}
            </label>
            <select
              id="view-year"
              value={viewYear}
              onChange={e => setViewYear(Number(e.target.value))}
              className="h-8 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 pr-7 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-600 cursor-pointer appearance-none"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{tm('yearOption', { y })}</option>
              ))}
            </select>
          </div>

          <button
            onClick={refreshData}
            disabled={refreshing}
            aria-label={tm('refreshAria')}
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50 cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-600 rounded px-2 py-1 transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
            {tc('refresh')}
          </button>
        </div>

        {/* Labor brackets table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{tm('rateTableTitle', { label: t('labor'), year: viewYear })}</h3>
          </div>
          <LaborTable brackets={laborBrackets} year={viewYear} />
        </div>

        {/* Health brackets table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{tm('rateTableTitle', { label: t('health'), year: viewYear })}</h3>
          </div>
          <HealthTable brackets={healthBrackets} year={viewYear} />
        </div>

        {/* 勞退月提繳工資分級表：欄位與勞健保不同（只有月提繳工資），獨立一區 */}
        <PensionSection
          initialBrackets={initialPensionBrackets ?? []}
          viewYear={viewYear}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
