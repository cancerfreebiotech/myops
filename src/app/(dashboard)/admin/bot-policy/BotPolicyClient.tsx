'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DOC_TYPES, DOC_TYPE_META, hasAmountField, type DocType } from '@/lib/procurement/doc-types'
import type { BotApprovalPolicy } from '@/lib/bot-approval-policy'

interface Props {
  policy: BotApprovalPolicy
}

export function BotPolicyClient({ policy }: Props) {
  const router = useRouter()
  const t = useTranslations('admin.botPolicy')
  const tDoc = useTranslations('procurement')
  const tc = useTranslations('common')

  const [oneTap, setOneTap] = useState<Record<DocType, boolean>>(
    Object.fromEntries(DOC_TYPES.map(dt => [dt, policy[dt]?.one_tap ?? false])) as Record<DocType, boolean>
  )
  const [threshold, setThreshold] = useState<Record<DocType, string>>(
    Object.fromEntries(
      DOC_TYPES.map(dt => [dt, policy[dt]?.amount_threshold !== undefined ? String(policy[dt].amount_threshold) : '']),
    ) as Record<DocType, string>
  )
  const [saving, setSaving] = useState(false)

  const buildPolicy = (
    nextOneTap: Record<DocType, boolean>,
    nextThreshold: Record<DocType, string>,
  ): BotApprovalPolicy => {
    return Object.fromEntries(
      DOC_TYPES.map(dt => {
        const entry: { one_tap: boolean; amount_threshold?: number } = { one_tap: nextOneTap[dt] ?? false }
        if (hasAmountField(dt)) {
          const raw = nextThreshold[dt]?.trim()
          if (raw) {
            const n = Number(raw)
            if (Number.isFinite(n) && n > 0) entry.amount_threshold = n
          }
        }
        return [dt, entry]
      }),
    ) as BotApprovalPolicy
  }

  const persist = async (next: BotApprovalPolicy) => {
    setSaving(true)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'bot_approval_policy', value: JSON.stringify(next) }),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return false }
    toast.success(tc('saved'))
    router.refresh()
    return true
  }

  const handleToggle = async (dt: DocType) => {
    const next = { ...oneTap, [dt]: !oneTap[dt] }
    setOneTap(next)
    const ok = await persist(buildPolicy(next, threshold))
    if (!ok) setOneTap(oneTap) // revert on failure
  }

  const handleSaveThreshold = async () => {
    await persist(buildPolicy(oneTap, threshold))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Explanation banner */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-5 py-4 flex gap-3">
        <ShieldCheck size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{t('howItWorks')}</p>
          <p className="text-sm text-blue-800/80 dark:text-blue-300/80">{t('howItWorksBody')}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('docTypesTitle')}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('docTypesDesc')}</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {DOC_TYPES.map(dt => {
            const enabled = oneTap[dt] ?? false
            const hasAmount = hasAmountField(dt)
            const label = tDoc(DOC_TYPE_META[dt].labelKey)
            return (
              <div key={dt} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                    <p className="text-xs text-slate-400">
                      {enabled ? t('modeOneTap') : t('modeDeepLink')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggle(dt)}
                    disabled={saving}
                    className={[
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 shrink-0',
                      enabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-600',
                      saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    ].join(' ')}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={t('toggleAria', { doc: label })}
                  >
                    <span
                      className={[
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        enabled ? 'translate-x-6' : 'translate-x-1',
                      ].join(' ')}
                    />
                  </button>
                </div>

                {hasAmount && enabled && (
                  <div className="mt-3 pl-0">
                    <label
                      htmlFor={`threshold-${dt}`}
                      className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1.5"
                    >
                      {t('thresholdLabel')}
                    </label>
                    <p className="text-xs text-slate-400 mb-2">{t('thresholdHelp')}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`threshold-${dt}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={threshold[dt] ?? ''}
                        onChange={e => setThreshold(v => ({ ...v, [dt]: e.target.value }))}
                        className="flex-1 text-base tabular-nums min-h-[44px]"
                        placeholder={t('thresholdPlaceholder')}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[44px] shrink-0"
                        onClick={() => handleSaveThreshold()}
                        disabled={saving}
                      >
                        <Save size={13} className="mr-1" />
                        {saving ? tc('saving') : tc('save')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
