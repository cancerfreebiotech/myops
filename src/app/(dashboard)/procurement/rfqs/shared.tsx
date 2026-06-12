'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AlertTriangle, Lock } from 'lucide-react'
import type { DocStatus } from '@/lib/procurement/doc-types'

// Shared client pieces for the RFQ pages (list + detail): status badge, the
// sectioned 詢價單 form and the row/option types.

export interface UserOption {
  id: string
  display_name: string | null
}

export interface NamedRef { id: string; display_name: string | null }
export type MaybeArray<T> = T | T[] | null

export function one<T>(v: MaybeArray<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export interface RfqListRow {
  id: string
  doc_no: string | null
  status: DocStatus
  current_step: number | null
  request_date: string | null
  requesting_department: string | null
  department: string | null
  urgency: string | null
  expected_delivery_date: string | null
  pr_count: number | null
  created_at: string
  created_by: string | null
  requester: MaybeArray<NamedRef>
  inquirer: MaybeArray<NamedRef>
  created_by_user: MaybeArray<NamedRef>
}

const STATUS_STYLE: Record<DocStatus, string> = {
  draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  in_approval: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  approved: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  rejected: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  voided: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
}

export function RfqStatusBadge({ status }: { status: DocStatus }) {
  const t = useTranslations('procurement.rfqs')
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap', STATUS_STYLE[status])}>
      {t(`statusLabels.${status}` as Parameters<typeof t>[0])}
    </span>
  )
}

type FieldKind = 'text' | 'date' | 'user' | 'textarea'

interface FieldDef { name: string; kind: FieldKind }

/**
 * Editable rfqs header columns grouped into form/detail sections
 * (schema: 20260612000010_procurement_docs.sql; i18n: sections.* / fields.*).
 */
export const RFQ_SECTIONS: { key: string; fields: FieldDef[] }[] = [
  {
    key: 'request',
    fields: [
      { name: 'request_date', kind: 'date' },
      { name: 'requesting_department', kind: 'text' },
      { name: 'department', kind: 'text' },
      { name: 'requester_id', kind: 'user' },
      { name: 'request_notes', kind: 'textarea' },
    ],
  },
  {
    key: 'inquiry',
    fields: [
      { name: 'inquirer_id', kind: 'user' },
      { name: 'urgency', kind: 'text' },
      { name: 'expected_delivery_date', kind: 'date' },
    ],
  },
  {
    key: 'review',
    fields: [
      { name: 'reviewer_id', kind: 'user' },
      { name: 'review_date', kind: 'date' },
      { name: 'review_notes', kind: 'textarea' },
    ],
  },
  {
    key: 'other',
    fields: [
      { name: 'notes', kind: 'textarea' },
    ],
  },
]

export const RFQ_FORM_FIELDS = RFQ_SECTIONS.flatMap(s => s.fields.map(f => f.name))

const NONE = '__none'

interface RfqFormProps {
  value: Record<string, string>
  onChange: (field: string, value: string) => void
  users: UserOption[]
  /** header columns the signed-in user must not edit right now (簽核中欄位鎖定) */
  lockedFields?: readonly string[]
}

/** 詢價單 sectioned form. Locked fields render disabled with a lock marker. */
export function RfqForm({ value, onChange, users, lockedFields = [] }: RfqFormProps) {
  const t = useTranslations('procurement.rfqs')

  const renderField = (field: FieldDef) => {
    const locked = lockedFields.includes(field.name)
    const id = `rfq-${field.name}`
    const label = (
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {t(`fields.${field.name}` as Parameters<typeof t>[0])}
        {locked && <Lock size={12} className="inline ml-1 text-slate-400" aria-label={t('lockedField')} />}
      </label>
    )

    if (field.kind === 'user') {
      const v = value[field.name] ?? ''
      return (
        <div key={field.name}>
          {label}
          <Select
            value={v === '' ? NONE : v}
            onValueChange={next => onChange(field.name, !next || next === NONE ? '' : next)}
            disabled={locked}
          >
            <SelectTrigger id={id} className="w-full min-h-[44px] text-base">
              <SelectValue placeholder={t('selectUser')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('noSelection')}</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.display_name ?? u.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    if (field.kind === 'textarea') {
      return (
        <div key={field.name} className="sm:col-span-2">
          {label}
          <Textarea
            id={id}
            value={value[field.name] ?? ''}
            onChange={e => onChange(field.name, e.target.value)}
            rows={2}
            disabled={locked}
            className="text-base"
          />
        </div>
      )
    }

    return (
      <div key={field.name}>
        {label}
        <Input
          id={id}
          type={field.kind === 'date' ? 'date' : 'text'}
          value={value[field.name] ?? ''}
          onChange={e => onChange(field.name, e.target.value)}
          disabled={locked}
          className="text-base min-h-[44px]"
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 規格畫面提示 (spec §三-1) */}
      <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-3 space-y-1.5">
        <p className="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
          {t('hints.unregisteredProduct')}
        </p>
        <p className="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
          {t('hints.reviewQuantity')}
        </p>
      </div>

      {lockedFields.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Lock size={14} aria-hidden />
          {t('lockedNotice')}
        </p>
      )}

      {RFQ_SECTIONS.map(section => (
        <section key={section.key}>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t(`sections.${section.key}` as Parameters<typeof t>[0])}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.fields.map(renderField)}
          </div>
        </section>
      ))}
    </div>
  )
}
