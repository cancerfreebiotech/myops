'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Eye, EyeOff, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

const SENSITIVE_KEYS = ['gemini_api_key', 'teams_bot_secret']
const SETTING_LABELS: Record<string, string> = {
  gemini_api_key: 'Gemini API Key（AI 翻譯）',
  mfa_grace_period_minutes: 'MFA 寬限期（分鐘）',
  auto_clock_in_time: '自動上班補打時間（HH:MM，台灣時間）',
  auto_clock_out_time: '自動下班補打時間（HH:MM，台灣時間）',
  announcement_reminder_days: '公告未確認提醒間隔（天）',
  contract_expiry_warn_days: '合約到期提醒天數',
  teams_webhook_url: 'Teams Webhook URL',
  teams_bot_id: 'Teams Bot ID',
  teams_bot_secret: 'Teams Bot Secret',
  app_url: '系統網址',
  payroll_day: '發薪日（每月幾號）',
  overtime_advance_hours: '加班申請需提前幾小時',
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

  const groups: Record<string, Setting[]> = {
    'AI 功能': settings.filter(s => s.key.includes('gemini')),
    '打卡設定': settings.filter(s => s.key.includes('clock')),
    '通知設定': settings.filter(s => ['announcement_reminder_days', 'contract_expiry_warn_days', 'teams_webhook_url', 'teams_bot_id', 'teams_bot_secret'].includes(s.key)),
    '系統參數': settings.filter(s => ['mfa_grace_period_minutes', 'app_url', 'payroll_day', 'overtime_advance_hours'].includes(s.key)),
  }

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
