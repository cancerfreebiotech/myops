'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Eye, EyeOff, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

const SENSITIVE_KEYS = ['gemini_api_key', 'teams_bot_secret']
const SETTING_LABELS: Record<string, string> = {
  // AI
  gemini_api_key: 'Gemini API Key（AI 翻譯）',
  // 打卡
  default_clock_in_time: '預設上班時間（HH:MM，台灣時間）',
  default_clock_out_time: '預設下班時間（HH:MM，台灣時間）',
  auto_clock_check_delay_minutes: '自動打卡檢查延遲（分鐘）',
  intern_missed_clock_alert_threshold: '實習生漏打卡警告門檻（次）',
  fulltime_auto_clock_alert_days: '正職自動打卡警告天數',
  // 通知
  contract_reminder_days_first: '合約到期第一次提醒（天前）',
  contract_reminder_days_second: '合約到期第二次提醒（天前）',
  daily_digest_time: 'Daily Digest 發送時間（HH:MM）',
  teams_webhook_url: 'Teams Webhook URL',
  teams_bot_id: 'Teams Bot ID',
  teams_bot_secret: 'Teams Bot Secret',
  // 系統
  maintenance_mode: '維護模式（true/false）',
  mfa_approval_session_minutes: 'MFA 審批 Session 有效期（分鐘）',
  overtime_min_advance_hours: '加班申請最少提前（小時）',
  project_ot_coo_threshold_hours: '專案加班 COO 審批門檻（小時）',
  payroll_pay_day: '發薪日（每月幾號）',
  payroll_auto_generate_day: '薪資自動產出日（每月幾號）',
}

interface Setting { key: string; value: string; description?: string }

export function SettingsClient({ settings }: { settings: Setting[] }) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map(s => [s.key, s.value ?? '']))
  )
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const handleSave = async (key: string) => {
    setSaving(key)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: values[key] }),
    })
    const { error } = await res.json()
    setSaving(null)
    if (error) { toast.error(error); return }
    toast.success('已儲存')
    router.refresh()
  }

  const groupDefs: [string, (key: string) => boolean][] = [
    ['AI 功能', k => k.includes('gemini')],
    ['打卡設定', k => k.includes('clock') || k.includes('intern_missed') || k.includes('fulltime_auto')],
    ['通知設定', k => k.includes('contract_reminder') || k.includes('daily_digest') || k.includes('teams_')],
    ['系統參數', k => ['maintenance_mode', 'mfa_approval_session_minutes', 'overtime_min_advance_hours', 'project_ot_coo_threshold_hours', 'payroll_pay_day', 'payroll_auto_generate_day'].includes(k)],
  ]
  const grouped = new Set<string>()
  const groups: Record<string, Setting[]> = {}
  for (const [name, matcher] of groupDefs) {
    groups[name] = settings.filter(s => {
      if (matcher(s.key)) { grouped.add(s.key); return true }
      return false
    })
  }
  // Catch-all for any settings not in a group
  const ungrouped = settings.filter(s => !grouped.has(s.key))
  if (ungrouped.length > 0) groups['其他'] = ungrouped

  return (
    <div className="space-y-6 max-w-2xl">
      {Object.entries(groups).map(([groupName, groupSettings]) => {
        if (groupSettings.length === 0) return null
        return (
          <div key={groupName} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{groupName}</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {groupSettings.map(setting => {
                const isSensitive = SENSITIVE_KEYS.includes(setting.key)
                const showValue = showKeys[setting.key]
                const label = SETTING_LABELS[setting.key] ?? setting.key
                const currentVal = values[setting.key] ?? ''
                const displayVal = isSensitive && !showValue && currentVal
                  ? '•'.repeat(Math.min(currentVal.length, 24))
                  : currentVal

                return (
                  <div key={setting.key} className="px-5 py-4">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5">
                      {label}
                    </label>
                    {setting.description && (
                      <p className="text-xs text-slate-400 mb-2">{setting.description}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={isSensitive && !showValue ? 'password' : 'text'}
                          value={isSensitive && !showValue ? displayVal : currentVal}
                          onChange={e => !(!showValue && isSensitive) && setValues(v => ({ ...v, [setting.key]: e.target.value }))}
                          onFocus={() => isSensitive && setShowKeys(k => ({ ...k, [setting.key]: true }))}
                          className="pr-10"
                          placeholder={`輸入 ${label}`}
                        />
                        {isSensitive && (
                          <button
                            type="button"
                            onClick={() => setShowKeys(k => ({ ...k, [setting.key]: !k[setting.key] }))}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showValue ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[36px] shrink-0"
                        onClick={() => handleSave(setting.key)}
                        disabled={saving === setting.key}
                      >
                        <Save size={13} className="mr-1" />
                        {saving === setting.key ? '儲存中' : '儲存'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
