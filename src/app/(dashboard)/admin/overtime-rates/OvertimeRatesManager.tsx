'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'

// 費率為勞基法分段（平日前2h/後2h、休息日三段、國定假日），只可調倍率、不可停用
// （停用某一段會導致計薪錯誤；DB 亦無 is_active 欄位）
interface OvertimeRate {
  id: string
  ot_type: string
  multiplier: number
}

export function OvertimeRatesManager({ rates, readOnly }: { rates: OvertimeRate[]; readOnly?: boolean }) {
  const router = useRouter()
  const t = useTranslations('admin.overtimeRatesMgmt')
  const tc = useTranslations('common')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const getVal = (rate: OvertimeRate) => rate.id in edits ? edits[rate.id] : String(rate.multiplier)

  const handleSave = async (id: string) => {
    const edit = edits[id]
    if (edit === undefined) return
    setSaving(id)
    const res = await fetch(`/api/admin/overtime-rates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ multiplier: parseFloat(edit) }),
    })
    const { error } = await res.json()
    setSaving(null)
    if (error) { toast.error(error); return }
    toast.success(t('updateSuccess'))
    const rest = { ...edits }
    delete rest[id]
    setEdits(rest)
    router.refresh()
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('headers.type')}</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{t('headers.multiplier')}</th>
              {!readOnly && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rates.map(rate => {
              const changed = rate.id in edits
              return (
                <tr key={rate.id} className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {rate.ot_type}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {readOnly ? (
                      <span className="text-sm text-slate-700 dark:text-slate-300">{getVal(rate)}</span>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        max="5"
                        value={getVal(rate)}
                        onChange={e => setEdits(prev => ({ ...prev, [rate.id]: e.target.value }))}
                        className="w-20 text-center h-8 mx-auto"
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-3">
                      {changed && (
                        <Button size="sm" className="h-8 min-h-0" onClick={() => handleSave(rate.id)} disabled={saving === rate.id}>
                          <Save size={13} className="mr-1" />{saving === rate.id ? '...' : tc('save')}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">{t('multiplierHint')}</p>
    </div>
  )
}
