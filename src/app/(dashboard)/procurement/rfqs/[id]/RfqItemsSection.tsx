'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Trash2, Paperclip, Upload, Loader2, X, Save } from 'lucide-react'

// 本張詢價單「自己的」請購商品與逐項報價（可編輯）。
// 與 RfqDetailClient 下方「相關採購單」帶出的唯讀區塊刻意分開：那些是下游採購單的資料。
// 請購人填品項；詢價人員填每個品項的多家報價（is_selected 標記採用）與整單報價單附件。

export interface VendorOption {
  id: string
  vendor_code: string | null
  name: string
}

export interface RfqItem {
  id?: string
  line_no: number | null
  product_code: string | null
  product_name: string | null
  spec: string | null
  unit: string | null
  quantity: number | null
  usage_notes: string | null
  suggested_vendor_id: string | null
  notes: string | null
}

export interface RfqQuote {
  id?: string
  rfq_item_id?: string
  vendor_id: string | null
  vendor_name: string | null
  unit_price: number | null
  quote_date: string | null
  is_selected: boolean
  notes: string | null
}

/** Select 不接受空字串當值，用 sentinel 表示「未指定」（與 shared.tsx 的 RfqForm 一致） */
const NONE = '__none'

interface Props {
  rfqId: string
  initialItems: RfqItem[]
  initialQuotes: RfqQuote[]
  initialQuoteFiles: string[]
  /** 簽核中鎖定的明細/報價欄位（詢價人員豁免）；非空即代表目前不可編輯這些欄位 */
  lockedItemFields: string[]
  /** 廠商主檔（登錄廠商清冊）— 建議廠商與報價廠商的下拉來源 */
  vendors: VendorOption[]
  /** 文件狀態允許編輯且使用者有權限 */
  canEdit: boolean
  onSaved: () => void
}

const emptyItem = (lineNo: number): RfqItem => ({
  line_no: lineNo, product_code: null, product_name: null, spec: null,
  unit: null, quantity: null, usage_notes: null, suggested_vendor_id: null, notes: null,
})

export function RfqItemsSection({
  rfqId, initialItems, initialQuotes, initialQuoteFiles, lockedItemFields, vendors, canEdit, onSaved,
}: Props) {
  const t = useTranslations('procurement.rfqs')
  const tItem = useTranslations('procurement.purchaseRequests.itemCols')
  const tc = useTranslations('common')

  const [items, setItems] = useState<RfqItem[]>(initialItems)
  const [quotes, setQuotes] = useState<RfqQuote[]>(initialQuotes)
  const [files, setFiles] = useState<string[]>(initialQuoteFiles)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const locked = lockedItemFields.length > 0
  const editable = canEdit && !locked

  const setItem = (i: number, patch: Partial<RfqItem>) =>
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))

  const setQuote = (qi: number, patch: Partial<RfqQuote>) =>
    setQuotes(prev => prev.map((q, idx) => (idx === qi ? { ...q, ...patch } : q)))

  // 同一品項至多一筆採用（與 API 端 pickRfqQuotes 的檢查一致）
  const selectQuote = (itemId: string, qi: number, checked: boolean) =>
    setQuotes(prev => prev.map((q, idx) =>
      idx === qi ? { ...q, is_selected: checked }
        : (checked && q.rfq_item_id === itemId ? { ...q, is_selected: false } : q)))

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const pres = await fetch('/api/storage/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'procurement', filename: file.name }),
      })
      if (!pres.ok) throw new Error()
      const { data } = await pres.json()
      const up = await fetch(data.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!up.ok) throw new Error()
      setFiles(prev => [...prev, data.path])
    } catch {
      toast.error(t('own.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    // quotes 依品項分組；未儲存（無 id）的品項不能掛報價
    const byItem: Record<string, RfqQuote[]> = {}
    for (const it of items) {
      if (!it.id) continue
      // rfq_item_id 由 API 依分組的 key 決定，payload 不重複帶
      byItem[it.id] = quotes
        .filter(q => q.rfq_item_id === it.id)
        .map(q => ({
          id: q.id, vendor_id: q.vendor_id, vendor_name: q.vendor_name, unit_price: q.unit_price,
          quote_date: q.quote_date, is_selected: q.is_selected, notes: q.notes,
        }))
    }
    const res = await fetch(`/api/procurement/rfqs/${rfqId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, quotes: byItem, quote_files: files }),
    })
    const { error } = await res.json()
    setSaving(false)
    if (error) { toast.error(error); return }
    toast.success(tc('saved'))
    onSaved()
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('own.itemsTitle')}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('own.itemsHint')}</p>
        </div>
        {editable && (
          <Button size="sm" onClick={save} disabled={saving} className="min-h-[36px] cursor-pointer">
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
            {t('own.saveAll')}
          </Button>
        )}
      </div>
      {locked && <p className="text-xs text-amber-600 dark:text-amber-400">{t('own.lockedHint')}</p>}

      {/* 請購商品 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="py-1.5 pr-2 font-medium w-14">{tItem('lineNo')}</th>
              <th className="py-1.5 pr-2 font-medium">{tItem('productName')}</th>
              <th className="py-1.5 pr-2 font-medium">{tItem('productCode')}</th>
              <th className="py-1.5 pr-2 font-medium">{tItem('spec')}</th>
              <th className="py-1.5 pr-2 font-medium w-20">{tItem('unit')}</th>
              <th className="py-1.5 pr-2 font-medium w-24">{tItem('quantity')}</th>
              <th className="py-1.5 pr-2 font-medium">{t('own.usageNotes')}</th>
              <th className="py-1.5 pr-2 font-medium">{t('own.suggestedVendor')}</th>
              {editable && <th className="py-1.5 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={editable ? 9 : 8} className="py-4 text-center text-slate-400">{t('own.noItems')}</td></tr>
            ) : items.map((it, i) => (
              <tr key={it.id ?? `new-${i}`} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-1 pr-2">
                  <Input type="number" className="h-8 w-14" disabled={!editable}
                    value={it.line_no ?? ''} onChange={e => setItem(i, { line_no: e.target.value === '' ? null : Number(e.target.value) })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className="h-8 min-w-[9rem]" disabled={!editable}
                    value={it.product_name ?? ''} onChange={e => setItem(i, { product_name: e.target.value || null })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className="h-8 min-w-[7rem]" disabled={!editable}
                    value={it.product_code ?? ''} onChange={e => setItem(i, { product_code: e.target.value || null })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className="h-8 min-w-[7rem]" disabled={!editable}
                    value={it.spec ?? ''} onChange={e => setItem(i, { spec: e.target.value || null })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className="h-8 w-20" disabled={!editable}
                    value={it.unit ?? ''} onChange={e => setItem(i, { unit: e.target.value || null })} />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" className="h-8 w-24 tabular-nums" disabled={!editable}
                    value={it.quantity ?? ''} onChange={e => setItem(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className="h-8 min-w-[9rem]" disabled={!editable}
                    value={it.usage_notes ?? ''} onChange={e => setItem(i, { usage_notes: e.target.value || null })} />
                </td>
                <td className="py-1 pr-2">
                  <Select
                    value={it.suggested_vendor_id ?? NONE}
                    onValueChange={v => setItem(i, { suggested_vendor_id: !v || v === NONE ? null : v })}
                    disabled={!editable}
                  >
                    <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue placeholder={t('own.selectVendor')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('own.noVendor')}</SelectItem>
                      {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                {editable && (
                  <td className="py-1">
                    <button type="button" aria-label={tc('delete')} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                      onClick={() => {
                        setItems(prev => prev.filter((_, idx) => idx !== i))
                        if (it.id) setQuotes(prev => prev.filter(q => q.rfq_item_id !== it.id))
                      }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <Button variant="outline" size="sm" className="min-h-[36px] cursor-pointer"
          onClick={() => setItems(prev => [...prev, emptyItem(prev.length + 1)])}>
          <Plus size={14} className="mr-1" />{t('own.addItem')}
        </Button>
      )}

      {/* 詢價結果：每個已儲存品項底下的多家報價 */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('own.quotesTitle')}</h3>
        <p className="text-xs text-slate-400 mt-0.5 mb-3">{t('own.quotesHint')}</p>
        {items.filter(it => it.id).length === 0 ? (
          <p className="text-sm text-slate-400">{t('own.itemUnsavedHint')}</p>
        ) : items.filter(it => it.id).map(it => {
          const rows = quotes.map((q, idx) => ({ q, idx })).filter(r => r.q.rfq_item_id === it.id)
          return (
            <div key={it.id} className="mb-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                #{it.line_no ?? ''} {it.product_name ?? it.product_code ?? '—'}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="py-1.5 pr-2 font-medium">{t('own.vendorName')}</th>
                      <th className="py-1.5 pr-2 font-medium w-32">{t('own.unitPrice')}</th>
                      <th className="py-1.5 pr-2 font-medium w-40">{t('own.quoteDate')}</th>
                      <th className="py-1.5 pr-2 font-medium w-16 text-center">{t('own.selected')}</th>
                      <th className="py-1.5 pr-2 font-medium">{tc('note')}</th>
                      {editable && <th className="py-1.5 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={editable ? 6 : 5} className="py-2 text-slate-400">{t('own.noQuotes')}</td></tr>
                    ) : rows.map(({ q, idx }) => (
                      <tr key={q.id ?? `nq-${idx}`} className="border-b border-slate-100 dark:border-slate-700/50">
                        <td className="py-1 pr-2">
                          {/* 選定廠商時同時記下 vendor_name 快照（vendor_products 沿用此欄） */}
                          <Select
                            value={q.vendor_id ?? NONE}
                            onValueChange={v => setQuote(idx, v && v !== NONE
                              ? { vendor_id: v, vendor_name: vendors.find(x => x.id === v)?.name ?? null }
                              : { vendor_id: null, vendor_name: null })}
                            disabled={!editable}
                          >
                            <SelectTrigger className="h-8 min-w-[10rem]"><SelectValue placeholder={t('own.selectVendor')} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t('own.noVendor')}</SelectItem>
                              {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 pr-2">
                          <Input type="number" step="0.01" className="h-8 w-32 tabular-nums" disabled={!editable}
                            value={q.unit_price ?? ''} onChange={e => setQuote(idx, { unit_price: e.target.value === '' ? null : Number(e.target.value) })} />
                        </td>
                        <td className="py-1 pr-2">
                          <Input type="date" className="h-8 w-40" disabled={!editable}
                            value={q.quote_date ?? ''} onChange={e => setQuote(idx, { quote_date: e.target.value || null })} />
                        </td>
                        <td className="py-1 pr-2 text-center">
                          <input type="checkbox" className="size-4 cursor-pointer" disabled={!editable}
                            checked={q.is_selected}
                            onChange={e => selectQuote(it.id as string, idx, e.target.checked)} />
                        </td>
                        <td className="py-1 pr-2">
                          <Input className="h-8 min-w-[8rem]" disabled={!editable}
                            value={q.notes ?? ''} onChange={e => setQuote(idx, { notes: e.target.value || null })} />
                        </td>
                        {editable && (
                          <td className="py-1">
                            <button type="button" aria-label={tc('delete')} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                              onClick={() => setQuotes(prev => prev.filter((_, i2) => i2 !== idx))}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editable && (
                <Button variant="ghost" size="sm" className="mt-1 min-h-[36px] cursor-pointer"
                  onClick={() => setQuotes(prev => [...prev, {
                    rfq_item_id: it.id, vendor_id: null, vendor_name: null, unit_price: null,
                    quote_date: null, is_selected: false, notes: null,
                  }])}>
                  <Plus size={13} className="mr-1" />{t('own.addQuote')}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* 廠商報價單附件（整單層級，可多檔） */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t('own.quoteFilesTitle')}</h3>
        <div className="space-y-1.5">
          {files.length === 0 && <p className="text-sm text-slate-400">{t('own.noQuoteFiles')}</p>}
          {files.map((p, i) => (
            <div key={p} className="flex items-center gap-2 text-sm">
              <Paperclip size={13} className="text-slate-400 shrink-0" />
              <a href={`/api/storage/download?bucket=procurement&path=${encodeURIComponent(p)}`}
                 target="_blank" rel="noreferrer"
                 className="truncate text-blue-600 dark:text-blue-400 hover:underline">
                {p.split('/').pop() ?? p}
              </a>
              {editable && (
                <button type="button" aria-label={tc('delete')} className="text-slate-400 hover:text-red-500 cursor-pointer"
                  onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <label className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 cursor-pointer">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? t('own.uploading') : t('own.addQuoteFile')}
              <input type="file" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
