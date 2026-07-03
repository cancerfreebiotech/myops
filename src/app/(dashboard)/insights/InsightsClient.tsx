'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface InsightsData {
  months: string[]
  monthlyOT: { month: string; hours: number }[]
  monthlyAttendance: { month: string; days: number }[]
  monthlyProcurement: { month: string; amount: number }[]
  leaveByType: Record<string, number>
  expenseByCategory: Record<string, number>
  otByProject: Record<string, number>
  year: string
}

const EXPENSE_CATEGORY_KEYS: Record<string, string> = {
  transport: 'catTransport', travel: 'catTravel', meal: 'catMeal',
  supplies: 'catSupplies', other: 'catOther',
}

export function InsightsClient() {
  const t = useTranslations('insights')
  const te = useTranslations('expense')
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/insights')
        if (!res.ok) throw new Error()
        const json = await res.json()
        setData(json.data)
      } catch {
        toast.error(t('loadFailed'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [t])

  if (loading) return <p className="text-sm text-slate-400">…</p>
  if (!data) return <p className="text-sm text-slate-400 text-center py-8">{t('loadFailed')}</p>

  const fmtMonth = (m: string) => `${Number(m.slice(5))}${t('monthSuffix')}`
  const fmtAmount = (n: number) => `NT$${Math.round(n).toLocaleString()}`

  // 橫條圖：值相對於該組最大值的百分比
  const Bars = ({ items, unit, isAmount }: { items: { label: string; value: number }[]; unit?: string; isAmount?: boolean }) => {
    const max = Math.max(...items.map(i => i.value), 1)
    return (
      <div className="space-y-2">
        {items.map(i => (
          <div key={i.label} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0 truncate">{i.label}</span>
            <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500/80 dark:bg-blue-400/70 rounded"
                style={{ width: `${(i.value / max) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300 w-24 text-right shrink-0">
              {isAmount ? fmtAmount(i.value) : `${Math.round(i.value * 10) / 10}${unit ?? ''}`}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const currentMonth = data.months[data.months.length - 1]
  const totalExpense = Object.values(data.expenseByCategory).reduce((a, b) => a + b, 0)
  const totalLeaveDays = Object.values(data.leaveByType).reduce((a, b) => a + b, 0)

  const stats = [
    { label: t('statAttendance'), value: String(data.monthlyAttendance.find(m => m.month === currentMonth)?.days ?? 0) },
    { label: t('statOT'), value: `${data.monthlyOT.find(m => m.month === currentMonth)?.hours ?? 0}h` },
    { label: t('statLeave', { year: data.year }), value: `${totalLeaveDays}${t('daysUnit')}` },
    { label: t('statExpense', { year: data.year }), value: fmtAmount(totalExpense) },
  ]

  const sortedEntries = (rec: Record<string, number>) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))

  return (
    <div className="space-y-4 pb-8">
      {/* 摘要卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{s.value}</p>
              <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('chartOT')}</CardTitle></CardHeader>
          <CardContent>
            <Bars items={data.monthlyOT.map(m => ({ label: fmtMonth(m.month), value: m.hours }))} unit="h" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('chartAttendance')}</CardTitle></CardHeader>
          <CardContent>
            <Bars items={data.monthlyAttendance.map(m => ({ label: fmtMonth(m.month), value: m.days }))} unit={t('daysUnit')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('chartProcurement')}</CardTitle></CardHeader>
          <CardContent>
            <Bars items={data.monthlyProcurement.map(m => ({ label: fmtMonth(m.month), value: m.amount }))} isAmount />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('chartLeave', { year: data.year })}</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.leaveByType).length === 0
              ? <p className="text-sm text-slate-400">{t('noData')}</p>
              : <Bars items={sortedEntries(data.leaveByType)} unit={t('daysUnit')} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('chartExpense', { year: data.year })}</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.expenseByCategory).length === 0
              ? <p className="text-sm text-slate-400">{t('noData')}</p>
              : <Bars
                  items={sortedEntries(data.expenseByCategory).map(e => ({
                    label: EXPENSE_CATEGORY_KEYS[e.label] ? te(EXPENSE_CATEGORY_KEYS[e.label]) : e.label,
                    value: e.value,
                  }))}
                  isAmount
                />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t('chartProjectOT')}</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.otByProject).length === 0
              ? <p className="text-sm text-slate-400">{t('noData')}</p>
              : <Bars items={sortedEntries(data.otByProject)} unit="h" />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
