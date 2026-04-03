'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'

const OT_TYPE_LABELS: Record<string, string> = {
  weekday: '平日加班', weekend: '假日加班', holiday: '國定假日加班',
  project: '專案加班', on_call: '值班', emergency: '緊急加班',
}

export function OvertimeRatesManager({ rates }: { rates: any[] }) {
  const router = useRouter()
  const [edits, setEdits] = useState<Record<string, { multiplier: string; is_active: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const getVal = (rate: any, field: 'multiplier' | 'is_active') => {
    if (rate.id in edits) return edits[rate.id][field]
    return field === 'multiplier' ? String(rate.multiplier) : rate.is_active
  }

  const handleSave = async (id: string) => {
    const edit = edits[id]
    if (!edit) return
    setSaving(id)
    const res = await fetch(`/api/admin/overtime-rates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ multiplier: parseFloat(edit.multiplier), is_active: edit.is_active }),
    })
    const { error } = await res.json()
    setSaving(null)
    if (error) { toast.error(error); return }
    toast.success('費率已更新')
    const { [id]: _, ...rest } = edits
    setEdits(rest)
    router.refresh()
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">加班類型</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">費率倍數</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">啟用</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rates.map(rate => {
              const changed = rate.id in edits
              return (
                <tr key={rate.id} className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {OT_TYPE_LABELS[rate.ot_type] ?? rate.ot_type}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={getVal(rate, 'multiplier') as string}
                      onChange={e => setEdits(prev => ({
                        ...prev,
                        [rate.id]: { multiplier: e.target.value, is_active: (prev[rate.id]?.is_active ?? rate.is_active) }
                      }))}
                      className="w-20 text-center h-8 mx-auto"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={getVal(rate, 'is_active') as boolean}
                      onChange={e => setEdits(prev => ({
                        ...prev,
                        [rate.id]: { multiplier: (prev[rate.id]?.multiplier ?? String(rate.multiplier)), is_active: e.target.checked }
                      }))}
                      className="accent-blue-600 w-4 h-4"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {changed && (
                      <Button size="sm" className="h-8 min-h-0" onClick={() => handleSave(rate.id)} disabled={saving === rate.id}>
                        <Save size={13} className="mr-1" />{saving === rate.id ? '...' : '儲存'}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">費率倍數 = 時薪 × 倍數，例如 1.33 = 1.33 倍</p>
    </div>
  )
}
