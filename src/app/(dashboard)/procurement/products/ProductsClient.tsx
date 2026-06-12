'use client'

import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { Plus, Pencil, HelpCircle, Trash2, PackageOpen } from 'lucide-react'
import { useTableSort, usePagination, SortableHeader, TableSearch, TablePagination } from '@/components/procurement/table-tools'

export interface Product {
  id: string
  product_code: string | null
  name: string
  spec: string | null
  category: string | null
  product_type: string | null
  brand: string | null
  primary_source: string | null
  item_code: string | null
  description: string | null
  default_department: string | null
  purchase_unit: string | null
  stock_unit: string | null
  units_per_purchase: number | string
  current_stock_qty: number | string | null
}

interface VendorQuote {
  id: string
  vendor_code: string | null
  vendor_name: string | null
  unit: string | null
  unit_price: number | string | null
  quote_date: string | null
  source_rfq_no: string | null
  vendor: { id: string; name: string; vendor_code: string | null } | null
}

interface ProductForm {
  product_code: string
  name: string
  spec: string
  category: string
  product_type: string
  brand: string
  primary_source: string
  item_code: string
  default_department: string
  description: string
  purchase_unit: string
  stock_unit: string
  units_per_purchase: string
}

const EMPTY_FORM: ProductForm = {
  product_code: '', name: '', spec: '', category: '', product_type: '', brand: '',
  primary_source: '', item_code: '', default_department: '', description: '',
  purchase_unit: '', stock_unit: '', units_per_purchase: '1',
}

function formatRate(value: number | string | null | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function formatQty(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatPrice(value: number | string | null): string {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `NT$ ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

/** 雙單位顯示：採購單位 × 換算率 = 庫存單位 */
function unitsDisplay(p: Product): string {
  if (p.purchase_unit && p.stock_unit) {
    return `${p.purchase_unit} × ${formatRate(p.units_per_purchase)} = ${p.stock_unit}`
  }
  return p.stock_unit ?? p.purchase_unit ?? '—'
}

function UnitFieldLabel({ htmlFor, label, hint, hintAria, className }: {
  htmlFor: string; label: string; hint: string; hintAria: string; className: string
}) {
  return (
    <span className="flex items-center gap-1">
      <label htmlFor={htmlFor} className={className}>{label}</label>
      <Tooltip>
        <TooltipTrigger
          aria-label={`${label} — ${hintAria}`}
          className="inline-flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <HelpCircle size={14} />
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    </span>
  )
}

export function ProductsClient({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('procurement.products')
  const tc = useTranslations('common')

  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [detail, setDetail] = useState<Product | null>(null)
  const [quotes, setQuotes] = useState<VendorQuote[] | null>(null)
  const [quotesLoading, setQuotesLoading] = useState(false)

  // _units mirrors the displayed dual-unit column; _stock is the numeric stock qty (display shows 0 for null)
  const augmented = useMemo(
    () => products.map(p => {
      const stock = Number(p.current_stock_qty ?? 0)
      return { ...p, _units: unitsDisplay(p), _stock: Number.isFinite(stock) ? stock : 0 }
    }),
    [products],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return augmented
    return augmented.filter(p =>
      [p.product_code, p.name, p.spec, p.category, p.brand, p.item_code]
        .some(v => v?.toLowerCase().includes(q))
    )
  }, [augmented, search])

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, 'product_code', 'asc')
  const { pageRows, page, setPage, totalPages, total } = usePagination(sorted)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setConfirmingDelete(false)
    setFormOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      product_code: p.product_code ?? '',
      name: p.name,
      spec: p.spec ?? '',
      category: p.category ?? '',
      product_type: p.product_type ?? '',
      brand: p.brand ?? '',
      primary_source: p.primary_source ?? '',
      item_code: p.item_code ?? '',
      default_department: p.default_department ?? '',
      description: p.description ?? '',
      purchase_unit: p.purchase_unit ?? '',
      stock_unit: p.stock_unit ?? '',
      units_per_purchase: String(Number(p.units_per_purchase) || 1),
    })
    setConfirmingDelete(false)
    setFormOpen(true)
  }

  const openDetail = async (p: Product) => {
    setDetail(p)
    setQuotes(null)
    setQuotesLoading(true)
    try {
      const res = await fetch(`/api/procurement/vendor-products?product_id=${p.id}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? t('quotesLoadFailed'))
        setQuotes([])
      } else {
        setQuotes(json.data ?? [])
      }
    } catch {
      toast.error(t('quotesLoadFailed'))
      setQuotes([])
    } finally {
      setQuotesLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(t('errors.nameRequired')); return }
    const rate = Number(form.units_per_purchase)
    if (!Number.isFinite(rate) || rate <= 0) { toast.error(t('errors.invalidUnitsPerPurchase')); return }

    setSaving(true)
    const url = editing ? `/api/procurement/products/${editing.id}` : '/api/procurement/products'
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, units_per_purchase: rate }),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(editing ? t('updated') : t('created'))
    setFormOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!editing) return
    setDeleting(true)
    const res = await fetch(`/api/procurement/products/${editing.id}`, { method: 'DELETE' })
    const { error } = await res.json()
    setDeleting(false)
    if (error) { toast.error(error); return }
    toast.success(t('deleted'))
    setFormOpen(false)
    router.refresh()
  }

  const setField = (field: keyof ProductForm) => (value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  const previewRate = Number(form.units_per_purchase)
  const showPreview = form.purchase_unit.trim() && form.stock_unit.trim() && Number.isFinite(previewRate) && previewRate > 0

  const labelCls = 'text-sm font-medium text-slate-700 dark:text-slate-300'

  const textField = (field: keyof ProductForm, label: ReactNode, props?: ComponentProps<'input'>) => (
    <div>
      <label htmlFor={`product-${field}`} className={labelCls}>{label}</label>
      <Input
        id={`product-${field}`}
        value={form[field]}
        onChange={e => setField(field)(e.target.value)}
        className="mt-1"
        {...props}
      />
    </div>
  )

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <TableSearch value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        {canManage && (
          <Button onClick={openCreate} className="min-h-[44px] sm:ml-auto">
            <Plus size={16} className="mr-1" /> {t('addProduct')}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <SortableHeader label={t('colCode')} sortKey="product_code" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('colName')} sortKey="name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('colCategory')} sortKey="category" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('colBrand')} sortKey="brand" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('colUnits')} sortKey="_units" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableHeader label={t('colStock')} sortKey="_stock" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="[&>button]:justify-end" />
                {canManage && <th className="px-4 py-3"><span className="sr-only">{tc('actions')}</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    <PackageOpen size={24} className="mx-auto mb-2 text-slate-400" aria-hidden />
                    {products.length === 0 ? t('emptyState') : t('noResults')}
                  </td>
                </tr>
              )}
              {pageRows.map(p => (
                <tr
                  key={p.id}
                  onClick={() => openDetail(p)}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{p.product_code ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/procurement/products/${p.id}`}
                      onClick={e => e.stopPropagation()}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      {p.name}
                    </Link>
                    {p.spec && <div className="text-xs text-slate-500 dark:text-slate-400">{p.spec}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{p.category ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{p.brand ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{unitsDisplay(p)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
                    {formatQty(p.current_stock_qty)}{p.stock_unit ? ` ${p.stock_unit}` : ''}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${tc('edit')} ${p.name}`}
                        onClick={e => { e.stopPropagation(); openEdit(p) }}
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

      {/* ── Create / Edit dialog ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('editProduct') : t('addProduct')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('basicSection')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {textField('product_code', t('codeLabel'))}
                {textField('name', <>{t('nameLabel')} <span className="text-red-500">*</span></>)}
                {textField('spec', t('specLabel'))}
                {textField('category', t('categoryLabel'))}
                {textField('product_type', t('typeLabel'))}
                {textField('brand', t('brandLabel'))}
                {textField('primary_source', t('sourceLabel'))}
                {textField('item_code', t('itemCodeLabel'))}
                {textField('default_department', t('departmentLabel'))}
              </div>
              <div>
                <label htmlFor="product-description" className={labelCls}>{t('descriptionLabel')}</label>
                <Textarea
                  id="product-description"
                  value={form.description}
                  onChange={e => setField('description')(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('unitSection')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <UnitFieldLabel
                    htmlFor="product-purchase_unit"
                    label={t('purchaseUnitLabel')}
                    hint={t('purchaseUnitHint')}
                    hintAria={t('tooltipAria')}
                    className={labelCls}
                  />
                  <Input
                    id="product-purchase_unit"
                    value={form.purchase_unit}
                    onChange={e => setField('purchase_unit')(e.target.value)}
                    className="mt-1"
                    placeholder={t('purchaseUnitPlaceholder')}
                  />
                </div>
                <div>
                  <UnitFieldLabel
                    htmlFor="product-units_per_purchase"
                    label={t('unitsPerPurchaseLabel')}
                    hint={t('unitsPerPurchaseHint')}
                    hintAria={t('tooltipAria')}
                    className={labelCls}
                  />
                  <Input
                    id="product-units_per_purchase"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={form.units_per_purchase}
                    onChange={e => setField('units_per_purchase')(e.target.value)}
                    className="mt-1 tabular-nums"
                  />
                </div>
                <div>
                  <UnitFieldLabel
                    htmlFor="product-stock_unit"
                    label={t('stockUnitLabel')}
                    hint={t('stockUnitHint')}
                    hintAria={t('tooltipAria')}
                    className={labelCls}
                  />
                  <Input
                    id="product-stock_unit"
                    value={form.stock_unit}
                    onChange={e => setField('stock_unit')(e.target.value)}
                    className="mt-1"
                    placeholder={t('stockUnitPlaceholder')}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {showPreview
                  ? t('conversionPreview', { purchaseUnit: form.purchase_unit.trim(), rate: formatRate(previewRate), stockUnit: form.stock_unit.trim() })
                  : t('conversionUnset')}
              </p>
            </section>

            {editing && (
              <section className="rounded-lg border border-red-200 dark:border-red-900/50 p-3 space-y-2">
                {!confirmingDelete ? (
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 size={14} className="mr-1" /> {t('deleteProduct')}
                  </Button>
                ) : (
                  <>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{t('deleteConfirmText', { name: editing.name })}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('deleteHint')}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>{tc('cancel')}</Button>
                      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                        {deleting ? tc('loading') : tc('delete')}
                      </Button>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? tc('saving') : tc('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail dialog (product info + vendor quotes) ── */}
      <Dialog open={detail != null} onOpenChange={open => { if (!open) setDetail(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.product_code ? `${detail.product_code} — ${detail.name}` : detail.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-2">
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                  {[
                    [t('specLabel'), detail.spec],
                    [t('categoryLabel'), detail.category],
                    [t('typeLabel'), detail.product_type],
                    [t('brandLabel'), detail.brand],
                    [t('sourceLabel'), detail.primary_source],
                    [t('itemCodeLabel'), detail.item_code],
                    [t('departmentLabel'), detail.default_department],
                    [t('colUnits'), unitsDisplay(detail)],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="text-slate-800 dark:text-slate-200">{value || '—'}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{t('currentStock')}</dt>
                    <dd className="text-slate-800 dark:text-slate-200 tabular-nums font-medium">
                      {formatQty(detail.current_stock_qty)}{detail.stock_unit ? ` ${detail.stock_unit}` : ''}
                    </dd>
                  </div>
                </dl>
                {detail.purchase_unit && detail.stock_unit && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('conversionPreview', {
                      purchaseUnit: detail.purchase_unit,
                      rate: formatRate(detail.units_per_purchase),
                      stockUnit: detail.stock_unit,
                    })}
                  </p>
                )}
                {detail.description && (
                  <div>
                    <h3 className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('descriptionLabel')}</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{detail.description}</p>
                  </div>
                )}

                <section>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">{t('vendorQuotes')}</h3>
                  {quotesLoading ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('loadingQuotes')}</p>
                  ) : !quotes || quotes.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('noQuotes')}</p>
                  ) : (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('quoteVendor')}</th>
                            <th className="text-right px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('quotePrice')}</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('quoteUnit')}</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('quoteDate')}</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-400">{t('quoteSourceRfq')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {quotes.map(q => (
                            <tr key={q.id} className="bg-white dark:bg-slate-800">
                              <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                                {q.vendor?.name ?? q.vendor_name ?? '—'}
                                {(q.vendor?.vendor_code ?? q.vendor_code) && (
                                  <span className="ml-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                                    {q.vendor?.vendor_code ?? q.vendor_code}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatPrice(q.unit_price)}</td>
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{q.unit ?? '—'}</td>
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{q.quote_date ?? '—'}</td>
                              <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{q.source_rfq_no ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
              <DialogFooter>
                {canManage && (
                  <Button variant="outline" onClick={() => { openEdit(detail); setDetail(null) }}>
                    <Pencil size={14} className="mr-1" /> {tc('edit')}
                  </Button>
                )}
                <Button onClick={() => setDetail(null)}>{tc('close')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
