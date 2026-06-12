'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, ExternalLink } from 'lucide-react'
import { useTableSort, usePagination, SortableHeader, TableSearch, TablePagination } from '@/components/procurement/table-tools'

interface UserJoin { display_name: string | null }

export interface Vendor {
  id: string
  created_at: string | null
  updated_at: string | null
  filled_by: UserJoin | UserJoin[] | null
  [field: string]: unknown
}

interface FieldDef {
  field: string
  labelKey: string
  kind?: 'file' | 'textarea' | 'user'
}

// 37 business fields, grouped 基本 / 聯絡 / 帳務 / 銀行
const SECTIONS: { titleKey: string; fields: FieldDef[] }[] = [
  {
    titleKey: 'sectionBasic',
    fields: [
      { field: 'vendor_code', labelKey: 'code' },
      { field: 'name', labelKey: 'name' },
      { field: 'short_name', labelKey: 'shortName' },
      { field: 'vendor_category', labelKey: 'category' },
      { field: 'country', labelKey: 'country' },
      { field: 'tax_id', labelKey: 'taxId' },
      { field: 'paid_in_capital', labelKey: 'paidInCapital' },
      { field: 'last_year_revenue', labelKey: 'lastYearRevenue' },
      { field: 'filling_department', labelKey: 'fillingDepartment' },
      { field: 'filled_by_id', labelKey: 'filledBy', kind: 'user' },
      { field: 'filler_signature_url', labelKey: 'fillerSignature', kind: 'file' },
      { field: 'notes', labelKey: 'notes', kind: 'textarea' },
    ],
  },
  {
    titleKey: 'sectionContact',
    fields: [
      { field: 'phone', labelKey: 'phone' },
      { field: 'fax', labelKey: 'fax' },
      { field: 'contact_person', labelKey: 'contactPerson' },
      { field: 'contact_phone', labelKey: 'contactPhone' },
      { field: 'contact_mobile', labelKey: 'contactMobile' },
      { field: 'contact_email', labelKey: 'contactEmail' },
    ],
  },
  {
    titleKey: 'sectionBilling',
    fields: [
      { field: 'accounting_contact', labelKey: 'accountingContact' },
      { field: 'accounting_phone', labelKey: 'accountingPhone' },
      { field: 'accounting_mobile', labelKey: 'accountingMobile' },
      { field: 'accounting_email', labelKey: 'accountingEmail' },
      { field: 'billing_postal_code', labelKey: 'billingPostalCode' },
      { field: 'billing_city_district', labelKey: 'billingCityDistrict' },
      { field: 'street_address', labelKey: 'streetAddress' },
      { field: 'full_billing_address', labelKey: 'fullBillingAddress' },
      { field: 'payment_method', labelKey: 'paymentMethod' },
      { field: 'payment_terms', labelKey: 'paymentTerms' },
      { field: 'closing_day', labelKey: 'closingDay' },
      { field: 'incoterms', labelKey: 'incoterms' },
    ],
  },
  {
    titleKey: 'sectionBank',
    fields: [
      { field: 'bank_name', labelKey: 'bankName' },
      { field: 'bank_branch', labelKey: 'bankBranch' },
      { field: 'bank_swift_code', labelKey: 'bankSwiftCode' },
      { field: 'bank_account_no', labelKey: 'bankAccountNo' },
      { field: 'bank_account_name', labelKey: 'bankAccountName' },
      { field: 'bankbook_copy_url', labelKey: 'bankbookCopy', kind: 'file' },
      { field: 'invoice_seal_url', labelKey: 'invoiceSeal', kind: 'file' },
    ],
  },
]

// filled_by_id is server-managed (defaults to the creating user) — excluded from the form
const FORM_FIELDS = SECTIONS.flatMap(s => s.fields).filter(f => f.kind !== 'user')

const SEARCH_FIELDS = ['vendor_code', 'name', 'short_name', 'vendor_category', 'contact_person', 'phone', 'contact_phone']

function emptyForm(): Record<string, string> {
  return Object.fromEntries(FORM_FIELDS.map(f => [f.field, '']))
}

function filledByName(v: Vendor): string | null {
  const u = Array.isArray(v.filled_by) ? v.filled_by[0] : v.filled_by
  return u?.display_name ?? null
}

function text(v: unknown): string {
  return v == null ? '' : String(v)
}

export function VendorsClient({ vendors, canManage }: { vendors: Vendor[]; canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('procurement.vendors')
  const tc = useTranslations('common')

  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<Vendor | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [form, setForm] = useState<Record<string, string>>(emptyForm())
  const [saving, setSaving] = useState(false)

  // _phone mirrors the displayed phone column (contact_phone falling back to phone) for sorting
  const augmented = useMemo<(Vendor & { _phone: string | null })[]>(
    () => vendors.map(v => ({ ...v, _phone: text(v.contact_phone) || text(v.phone) || null })),
    [vendors],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return augmented
    return augmented.filter(v => SEARCH_FIELDS.some(f => text(v[f]).toLowerCase().includes(q)))
  }, [augmented, search])

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, 'vendor_code', 'asc')
  const { pageRows, page, setPage, totalPages, total } = usePagination(sorted)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (v: Vendor) => {
    setEditing(v)
    setForm(Object.fromEntries(FORM_FIELDS.map(f => [f.field, text(v[f.field])])))
    setDetail(null)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(t('nameRequired')); return }
    setSaving(true)
    const url = editing ? `/api/procurement/vendors/${editing.id}` : '/api/procurement/vendors'
    const res = await fetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(editing ? t('updated') : t('created'))
    setFormOpen(false)
    router.refresh()
  }

  const renderValue = (v: Vendor, f: FieldDef) => {
    if (f.kind === 'user') {
      const name = filledByName(v)
      return name ?? <span className="text-slate-400 dark:text-slate-500">—</span>
    }
    const raw = text(v[f.field])
    if (!raw) return <span className="text-slate-400 dark:text-slate-500">—</span>
    if (f.kind === 'file') {
      return (
        <a
          href={raw}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('viewFile')} <ExternalLink size={14} aria-hidden />
        </a>
      )
    }
    return raw
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <TableSearch value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        <p className="text-sm text-slate-500 dark:text-slate-400 sm:ml-auto">{t('totalCount', { count: filtered.length })}</p>
        {canManage && (
          <Button onClick={openCreate} className="min-h-[44px]">
            <Plus size={16} className="mr-1" /> {t('addVendor')}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <SortableHeader label={t('codeHeader')} sortKey="vendor_code" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('shortNameHeader')} sortKey="short_name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('nameHeader')} sortKey="name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('categoryHeader')} sortKey="vendor_category" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('contactHeader')} sortKey="contact_person" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('phoneHeader')} sortKey="_phone" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                {canManage && <th className="px-4 py-3"><span className="sr-only">{tc('actions')}</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    {search.trim() ? t('noSearchResults') : t('noVendors')}
                  </td>
                </tr>
              )}
              {pageRows.map(v => (
                <tr
                  key={v.id}
                  onClick={() => setDetail(v)}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{text(v.vendor_code) || '—'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{text(v.short_name) || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setDetail(v) }}
                      className="text-left hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded cursor-pointer"
                    >
                      {text(v.name)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{text(v.vendor_category) || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{text(v.contact_person) || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{text(v.contact_phone) || text(v.phone) || '—'}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); openEdit(v) }}
                        aria-label={t('editVendor')}
                      >
                        <Pencil size={13} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      {/* Detail dialog — all 37 fields, grouped */}
      <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {text(detail.name)}
                  {text(detail.vendor_code) && (
                    <span className="ml-2 font-mono text-xs font-normal text-slate-500 dark:text-slate-400">{text(detail.vendor_code)}</span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-2">
                {SECTIONS.map(section => (
                  <section key={section.titleKey}>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-3">
                      {t(section.titleKey)}
                    </h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                      {section.fields.map(f => (
                        <div key={f.field} className={f.kind === 'textarea' ? 'sm:col-span-2' : undefined}>
                          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t(f.labelKey)}</dt>
                          <dd className="text-sm text-slate-800 dark:text-slate-200 mt-0.5 break-words whitespace-pre-wrap">
                            {renderValue(detail, f)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t('createdAt')}: {text(detail.created_at).slice(0, 10) || '—'}　{t('updatedAt')}: {text(detail.updated_at).slice(0, 10) || '—'}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>{tc('close')}</Button>
                {canManage && (
                  <Button onClick={() => openEdit(detail)}>
                    <Pencil size={14} className="mr-1" /> {tc('edit')}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('editVendor') : t('addVendor')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {SECTIONS.map(section => (
              <section key={section.titleKey}>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-3">
                  {t(section.titleKey)}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {section.fields.filter(f => f.kind !== 'user').map(f => (
                    <div key={f.field} className={f.kind === 'textarea' ? 'sm:col-span-2' : undefined}>
                      <label htmlFor={`vf-${f.field}`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t(f.labelKey)}
                        {f.field === 'name' && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {f.kind === 'textarea' ? (
                        <Textarea
                          id={`vf-${f.field}`}
                          value={form[f.field] ?? ''}
                          onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                          className="mt-1"
                          rows={3}
                        />
                      ) : (
                        <Input
                          id={`vf-${f.field}`}
                          type={f.kind === 'file' ? 'url' : 'text'}
                          value={form[f.field] ?? ''}
                          onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                          className="mt-1"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? tc('saving') : tc('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
