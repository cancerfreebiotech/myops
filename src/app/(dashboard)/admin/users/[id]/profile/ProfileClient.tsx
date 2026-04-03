'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Save, Eye, EyeOff, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Props {
  targetUser: any
  initialProfile: any
}

export function ProfileClient({ targetUser, initialProfile }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [showId, setShowId] = useState(false)
  const [showBank, setShowBank] = useState(false)

  const p = initialProfile ?? {}
  const [form, setForm] = useState({
    hire_date: p.hire_date ?? '',
    termination_date: p.termination_date ?? '',
    birth_date: p.birth_date ?? '',
    phone: p.phone ?? '',
    address: p.address ?? '',
    emergency_contact: p.emergency_contact ?? '',
    emergency_phone: p.emergency_phone ?? '',
    monthly_salary: p.monthly_salary ?? '',
    hourly_rate: p.hourly_rate ?? '',
    labor_pension_self: p.labor_pension_self ?? '0',
    bank_code: p.bank_code ?? '',
    bank_account: p.bank_account ?? '',
    id_number: p.id_number ?? '',
  })

  const dept = Array.isArray(targetUser.department)
    ? targetUser.department[0]?.name
    : targetUser.department?.name

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch(`/api/admin/users/${targetUser.id}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)
    if (json.error) { toast.error(json.error); return }
    toast.success('人事資料已儲存')
    router.refresh()
  }

  const mask = (val: string) => val ? '****' + val.slice(-4) : ''

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <ArrowLeft size={14} /> 返回使用者管理
      </Link>

      {/* User info summary */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-sm font-medium text-slate-600 dark:text-slate-300">
            {(targetUser.display_name ?? '?')[0]}
          </div>
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-200">{targetUser.display_name}</p>
            <p className="text-xs text-slate-400">{targetUser.email} · {dept ?? '—'} · {targetUser.employment_type === 'full_time' ? '正職' : '實習'}</p>
          </div>
        </div>
      </div>

      {/* Section: 基本資訊 */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 font-[Lexend]">基本資訊</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="hire_date" className="text-sm font-medium text-slate-700 dark:text-slate-300">到職日</label>
            <Input id="hire_date" type="date" value={form.hire_date} onChange={e => update('hire_date', e.target.value)} className="mt-1" />
          </div>
          <div>
            <label htmlFor="termination_date" className="text-sm font-medium text-slate-700 dark:text-slate-300">離職日</label>
            <Input id="termination_date" type="date" value={form.termination_date} onChange={e => update('termination_date', e.target.value)} className="mt-1" />
          </div>
          <div>
            <label htmlFor="birth_date" className="text-sm font-medium text-slate-700 dark:text-slate-300">出生日期</label>
            <Input id="birth_date" type="date" value={form.birth_date} onChange={e => update('birth_date', e.target.value)} className="mt-1" />
          </div>
          <div>
            <label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">電話</label>
            <Input id="phone" type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="text-sm font-medium text-slate-700 dark:text-slate-300">地址</label>
            <Input id="address" value={form.address} onChange={e => update('address', e.target.value)} className="mt-1" />
          </div>
        </div>
      </section>

      {/* Section: 緊急聯絡人 */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 font-[Lexend]">緊急聯絡人</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="emergency_contact" className="text-sm font-medium text-slate-700 dark:text-slate-300">姓名</label>
            <Input id="emergency_contact" value={form.emergency_contact} onChange={e => update('emergency_contact', e.target.value)} className="mt-1" />
          </div>
          <div>
            <label htmlFor="emergency_phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">電話</label>
            <Input id="emergency_phone" type="tel" value={form.emergency_phone} onChange={e => update('emergency_phone', e.target.value)} className="mt-1" />
          </div>
        </div>
      </section>

      {/* Section: 薪資設定 */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 font-[Lexend]">薪資設定</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {targetUser.employment_type === 'full_time' ? (
            <div>
              <label htmlFor="monthly_salary" className="text-sm font-medium text-slate-700 dark:text-slate-300">月薪 (NT$)</label>
              <Input id="monthly_salary" type="number" min={0} value={form.monthly_salary} onChange={e => update('monthly_salary', e.target.value)} className="mt-1" />
            </div>
          ) : (
            <div>
              <label htmlFor="hourly_rate" className="text-sm font-medium text-slate-700 dark:text-slate-300">時薪 (NT$)</label>
              <Input id="hourly_rate" type="number" min={0} value={form.hourly_rate} onChange={e => update('hourly_rate', e.target.value)} className="mt-1" />
            </div>
          )}
          <div>
            <label htmlFor="labor_pension_self" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              勞退自提比例 (%)
            </label>
            <Input
              id="labor_pension_self"
              type="number"
              min={0}
              max={6}
              step={0.5}
              value={form.labor_pension_self}
              onChange={e => update('labor_pension_self', e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-slate-400 mt-1">0–6%，由員工自行決定</p>
          </div>
        </div>
      </section>

      {/* Section: 銀行資料 */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 font-[Lexend]">銀行資料</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="bank_code" className="text-sm font-medium text-slate-700 dark:text-slate-300">銀行代碼</label>
            <Input id="bank_code" value={form.bank_code} onChange={e => update('bank_code', e.target.value)} className="mt-1" />
          </div>
          <div>
            <label htmlFor="bank_account" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              銀行帳號
            </label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="bank_account"
                type={showBank ? 'text' : 'password'}
                value={form.bank_account}
                onChange={e => update('bank_account', e.target.value)}
                placeholder={showBank ? '' : mask(form.bank_account)}
              />
              <button
                type="button"
                onClick={() => setShowBank(!showBank)}
                aria-label={showBank ? '隱藏帳號' : '顯示帳號'}
                className="p-2 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showBank ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section: 身分資訊 */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 font-[Lexend]">身分資訊</h3>
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-3 mb-3">
          <p className="text-xs text-orange-700 dark:text-orange-400">敏感資訊，請小心處理。</p>
        </div>
        <div className="max-w-sm">
          <label htmlFor="id_number" className="text-sm font-medium text-slate-700 dark:text-slate-300">身分證字號</label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              id="id_number"
              type={showId ? 'text' : 'password'}
              value={form.id_number}
              onChange={e => update('id_number', e.target.value)}
              placeholder={showId ? '' : mask(form.id_number)}
            />
            <button
              type="button"
              onClick={() => setShowId(!showId)}
              aria-label={showId ? '隱藏身分證號' : '顯示身分證號'}
              className="p-2 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              {showId ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
          {saving ? (
            <><Loader2 size={15} className="mr-1.5 animate-spin" /> 儲存中...</>
          ) : (
            <><Save size={15} className="mr-1.5" /> 儲存</>
          )}
        </Button>
      </div>
    </div>
  )
}
