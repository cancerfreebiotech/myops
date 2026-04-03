'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AlertTriangle, Search, Loader2 } from 'lucide-react'

export function AnomaliesClient() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [stats, setStats] = useState<{ scanned: number; flagged: number } | null>(null)

  const formatCurrency = (n: number | null) =>
    n == null ? '—' : `NT$ ${Number(n).toLocaleString('zh-TW')}`

  const handleScan = async () => {
    setScanning(true)
    setAnomalies([])
    try {
      const res = await fetch('/api/payroll/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
        return
      }
      setAnomalies(json.data.anomalies ?? [])
      setStats({ scanned: json.data.scanned, flagged: json.data.flagged })
      setScanned(true)
      if (json.data.flagged === 0) {
        toast.success(`掃描完成，${json.data.scanned} 筆紀錄無異常`)
      } else {
        toast.error(`發現 ${json.data.flagged} 筆異常紀錄`, { duration: 5000 })
      }
    } catch {
      toast.error('掃描失敗')
    } finally {
      setScanning(false)
    }
  }

  const handleFetch = async () => {
    const res = await fetch(`/api/payroll/anomalies?year=${year}&month=${month}`)
    const json = await res.json()
    if (json.data) setAnomalies(json.data)
    setScanned(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="anom-year" className="text-xs font-medium text-slate-500 dark:text-slate-400">年度</label>
          <select
            id="anom-year"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="block mt-1 h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="anom-month" className="text-xs font-medium text-slate-500 dark:text-slate-400">月份</label>
          <select
            id="anom-month"
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="block mt-1 h-9 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m} 月</option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleScan}
          disabled={scanning}
          className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
        >
          {scanning ? (
            <><Loader2 size={15} className="mr-1.5 animate-spin" /> 掃描中...</>
          ) : (
            <><Search size={15} className="mr-1.5" /> 執行異常掃描</>
          )}
        </Button>
        <Button variant="outline" onClick={handleFetch} className="min-h-[44px]">
          查看已標記異常
        </Button>
      </div>

      {stats && (
        <div className="flex gap-4 text-sm">
          <span className="text-slate-500">已掃描：<strong className="tabular-nums">{stats.scanned}</strong> 筆</span>
          <span className={stats.flagged > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
            異常：<strong className="tabular-nums">{stats.flagged}</strong> 筆
          </span>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">員工</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">實發金額</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">異常項目</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {!scanned ? (
                <tr>
                  <td colSpan={3} className="text-center py-12">
                    <Search size={36} className="mx-auto text-slate-200 dark:text-slate-600 mb-3" />
                    <p className="text-sm text-slate-400">請選擇年月後執行異常掃描</p>
                  </td>
                </tr>
              ) : anomalies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-12">
                    <p className="text-sm text-green-600 font-medium">無異常紀錄</p>
                  </td>
                </tr>
              ) : anomalies.map((a: any) => (
                <tr key={a.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {a.display_name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {formatCurrency(a.net_pay)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {(a.flags ?? []).map((flag: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <AlertTriangle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-orange-700 dark:text-orange-400">{flag}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
