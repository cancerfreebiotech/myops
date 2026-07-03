'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Search, ChevronDown, ChevronUp, Pencil, Trash2, History, PackageOpen, Ban, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { taipeiToday } from '@/lib/taipei-date'

interface Lot {
  id: string
  supply_id: string
  lot_no: string
  expiry_date: string | null
  quantity: number
  received_date: string | null
  opened_at: string | null
  status: 'in_stock' | 'depleted' | 'discarded'
  note: string | null
}

interface Supply {
  id: string
  name: string
  category: 'reagent' | 'consumable' | 'other'
  catalog_no: string | null
  vendor_name: string | null
  storage_condition: string
  unit: string
  safety_stock: number
  note: string | null
  lots: Lot[]
}

interface LotLog {
  id: string
  action: 'receive' | 'use' | 'open' | 'discard' | 'adjust'
  quantity_delta: number
  note: string | null
  created_at: string
  user: { display_name: string | null } | null
}

interface Props {
  isManager: boolean
}

type Tab = 'list' | 'due'

const CATEGORIES = ['reagent', 'consumable', 'other'] as const
const CATEGORY_KEYS = {
  reagent: 'catReagent', consumable: 'catConsumable', other: 'catOther',
} as const

const STORAGE_CONDITIONS = ['RT', '4C', '-20C', '-80C', 'LN2', 'other'] as const
const STORAGE_COLORS: Record<string, string> = {
  RT: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  '4C': 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300',
  '-20C': 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  '-80C': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300',
  LN2: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300',
  other: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
}

const STATUS_KEYS = {
  in_stock: 'statusInStock', depleted: 'statusDepleted', discarded: 'statusDiscarded',
} as const
const STATUS_COLORS: Record<Lot['status'], string> = {
  in_stock: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300',
  depleted: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  discarded: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300',
}

const LOG_KEYS = {
  receive: 'logReceive', use: 'logUse', open: 'logOpen', discard: 'logDiscard', adjust: 'logAdjust',
} as const

function daysUntil(dateStr: string): number {
  return Math.round((Date.parse(dateStr) - Date.parse(taipeiToday())) / 86400000)
}

function fmtDateTime(s: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(s))
}

export function LabClient({ isManager }: Props) {
  const t = useTranslations('lab')
  const [tab, setTab] = useState<Tab>('list')
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [loading, setLoading] = useState(true)

  // 篩選
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // 展開的品項
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // 品項表單
  const [supplyFormOpen, setSupplyFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supply | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('reagent')
  const [catalogNo, setCatalogNo] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [storageCondition, setStorageCondition] = useState<string>('RT')
  const [unit, setUnit] = useState('')
  const [safetyStock, setSafetyStock] = useState('')
  const [noteField, setNoteField] = useState('')
  const [savingSupply, setSavingSupply] = useState(false)

  // 入庫批次表單
  const [lotFormSupplyId, setLotFormSupplyId] = useState<string | null>(null)
  const [lotNo, setLotNo] = useState('')
  const [lotExpiry, setLotExpiry] = useState('')
  const [lotQuantity, setLotQuantity] = useState('')
  const [lotReceived, setLotReceived] = useState(() => taipeiToday())
  const [savingLot, setSavingLot] = useState(false)

  // 批次記錄
  const [logsOpen, setLogsOpen] = useState<Record<string, boolean>>({})
  const [logsMap, setLogsMap] = useState<Record<string, LotLog[]>>({})

  const loadSupplies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/lab/supplies')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setSupplies(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const load = async () => { await loadSupplies() }
    load()
  }, [loadSupplies])

  const loadLogs = useCallback(async (lotId: string) => {
    try {
      const res = await fetch(`/api/lab/lots/${lotId}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setLogsMap(prev => ({ ...prev, [lotId]: json.data?.logs ?? [] }))
    } catch {
      toast.error(t('loadFailed'))
    }
  }, [t])

  const toggleLogs = async (lotId: string) => {
    if (logsOpen[lotId]) {
      setLogsOpen(prev => ({ ...prev, [lotId]: false }))
      return
    }
    setLogsOpen(prev => ({ ...prev, [lotId]: true }))
    await loadLogs(lotId)
  }

  // 品項表單
  const openNewSupply = () => {
    if (supplyFormOpen && !editing) { setSupplyFormOpen(false); return }
    setEditing(null)
    setName(''); setCategory('reagent'); setCatalogNo(''); setVendorName('')
    setStorageCondition('RT'); setUnit(''); setSafetyStock(''); setNoteField('')
    setSupplyFormOpen(true)
  }

  const openEditSupply = (s: Supply) => {
    if (supplyFormOpen && editing?.id === s.id) { setSupplyFormOpen(false); setEditing(null); return }
    setEditing(s)
    setName(s.name); setCategory(s.category); setCatalogNo(s.catalog_no ?? '')
    setVendorName(s.vendor_name ?? ''); setStorageCondition(s.storage_condition)
    setUnit(s.unit); setSafetyStock(String(s.safety_stock)); setNoteField(s.note ?? '')
    setSupplyFormOpen(true)
  }

  const submitSupply = async () => {
    if (!name.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setSavingSupply(true)
    try {
      const payload = {
        name: name.trim(),
        category,
        catalog_no: catalogNo.trim() || null,
        vendor_name: vendorName.trim() || null,
        storage_condition: storageCondition,
        unit: unit.trim(),
        safety_stock: Number(safetyStock) || 0,
        note: noteField.trim() || null,
      }
      const res = await fetch(editing ? `/api/lab/supplies/${editing.id}` : '/api/lab/supplies', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(editing ? t('supplySaved') : t('supplyCreated'))
      setSupplyFormOpen(false)
      setEditing(null)
      await loadSupplies()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSavingSupply(false)
    }
  }

  const deleteSupply = async (s: Supply) => {
    if (!confirm(t('deleteSupplyConfirm'))) return
    const res = await fetch(`/api/lab/supplies/${s.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    toast.success(t('supplyDeleted'))
    await loadSupplies()
  }

  // 入庫批次
  const openLotForm = (supplyId: string) => {
    if (lotFormSupplyId === supplyId) { setLotFormSupplyId(null); return }
    setLotNo(''); setLotExpiry(''); setLotQuantity(''); setLotReceived(taipeiToday())
    setLotFormSupplyId(supplyId)
  }

  const submitLot = async (supplyId: string) => {
    const numQty = Number(lotQuantity)
    if (!lotNo.trim() || !Number.isFinite(numQty) || numQty <= 0) {
      toast.error(t('requiredFields'))
      return
    }
    setSavingLot(true)
    try {
      const res = await fetch('/api/lab/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supply_id: supplyId,
          lot_no: lotNo.trim(),
          expiry_date: lotExpiry || null,
          quantity: numQty,
          received_date: lotReceived || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('lotAdded'))
      setLotFormSupplyId(null)
      await loadSupplies()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSavingLot(false)
    }
  }

  // 批次操作
  const patchLot = async (lotId: string, body: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/lab/lots/${lotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    toast.success(successMsg)
    await loadSupplies()
    if (logsOpen[lotId]) await loadLogs(lotId)
  }

  const consumeLot = (lot: Lot) => {
    const input = prompt(t('useQtyPrompt'))
    if (input === null) return
    const qty = Number(input)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(t('requiredFields'))
      return
    }
    patchLot(lot.id, { action: 'use', quantity_delta: -qty }, t('done'))
  }

  const openLot = (lot: Lot) => patchLot(lot.id, { action: 'open' }, t('done'))

  const discardLot = (lot: Lot) => {
    if (!confirm(t('discardConfirm'))) return
    patchLot(lot.id, { action: 'discard' }, t('discarded'))
  }

  const totalQty = (s: Supply) =>
    s.lots.filter(l => l.status === 'in_stock').reduce((sum, l) => sum + Number(l.quantity), 0)

  const filtered = supplies.filter(s => {
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return s.name.toLowerCase().includes(q) || (s.catalog_no ?? '').toLowerCase().includes(q)
  })

  const dueLots = supplies
    .flatMap(s => s.lots
      .filter(l => l.status === 'in_stock' && l.expiry_date && daysUntil(l.expiry_date) <= 60)
      .map(l => ({ supply: s, lot: l, days: daysUntil(l.expiry_date as string) })))
    .sort((a, b) => (a.lot.expiry_date as string).localeCompare(b.lot.expiry_date as string))

  const expiryBadge = (lot: Lot) => {
    if (!lot.expiry_date) return <span className="text-xs text-slate-400">{t('noExpiry')}</span>
    const days = daysUntil(lot.expiry_date)
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{lot.expiry_date}</span>
        {days < 0 && (
          <Badge className="text-xs border bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300">
            {t('expired')}
          </Badge>
        )}
        {days >= 0 && days <= 30 && (
          <Badge className="text-xs border bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300">
            {t('dueSoon')}
          </Badge>
        )}
      </span>
    )
  }

  const inputClass = 'border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

  const renderLot = (lot: Lot) => (
    <div key={lot.id} className="border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 font-mono">{lot.lot_no}</span>
          {expiryBadge(lot)}
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {t('quantity')}: {Number(lot.quantity).toLocaleString()}
          </span>
          <Badge className={`text-xs border ${STATUS_COLORS[lot.status]}`}>{t(STATUS_KEYS[lot.status])}</Badge>
          {lot.opened_at && (
            <Badge variant="outline" className="text-xs text-orange-700 border-orange-200 dark:text-orange-300">
              {t('opened')}
            </Badge>
          )}
        </div>
        {isManager && (
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {lot.status === 'in_stock' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => consumeLot(lot)} className="text-xs text-blue-600 hover:text-blue-700 h-7">
                  <Minus size={13} className="mr-1" />{t('actionUse')}
                </Button>
                {!lot.opened_at && (
                  <Button variant="ghost" size="sm" onClick={() => openLot(lot)} className="text-xs text-orange-600 hover:text-orange-700 h-7">
                    <PackageOpen size={13} className="mr-1" />{t('actionOpen')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => discardLot(lot)} className="text-xs text-red-500 hover:text-red-600 h-7">
                  <Ban size={13} className="mr-1" />{t('actionDiscard')}
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => toggleLogs(lot.id)} className="text-xs text-slate-500 hover:text-slate-700 h-7">
              <History size={13} className="mr-1" />{t('logs')}
            </Button>
          </div>
        )}
      </div>
      {logsOpen[lot.id] && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
          {(logsMap[lot.id] ?? []).map(log => (
            <div key={log.id} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <Badge variant="outline" className="text-xs">{t(LOG_KEYS[log.action])}</Badge>
              {Number(log.quantity_delta) !== 0 && (
                <span className="tabular-nums">
                  {Number(log.quantity_delta) > 0 ? '+' : ''}{Number(log.quantity_delta).toLocaleString()}
                </span>
              )}
              {log.user?.display_name && <span>{log.user.display_name}</span>}
              <span className="tabular-nums">{fmtDateTime(log.created_at)}</span>
              {log.note && <span>「{log.note}」</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderSupply = (s: Supply) => {
    const total = totalQty(s)
    const isLow = total < Number(s.safety_stock)
    const isOpen = !!expanded[s.id]
    return (
      <Card key={s.id}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
                <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[s.category])}</Badge>
                <Badge className={`text-xs border ${STORAGE_COLORS[s.storage_condition] ?? STORAGE_COLORS.other}`}>
                  {s.storage_condition}
                </Badge>
                {isLow && (
                  <Badge className="text-xs border bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300">
                    {t('lowStock')}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {s.catalog_no && <span className="text-xs text-slate-400">{t('catalogNo')}: {s.catalog_no}</span>}
                {s.vendor_name && <span className="text-xs text-slate-400">{t('vendorName')}: {s.vendor_name}</span>}
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('totalQty')}: {total.toLocaleString()} {s.unit}
                </span>
                {s.note && <span className="text-xs text-slate-400">{s.note}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isManager && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => openEditSupply(s)} aria-label={t('editSupply')} className="text-slate-400 hover:text-blue-500 h-8 w-8">
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteSupply(s)} aria-label={t('deleteSupply')} className="text-slate-400 hover:text-red-500 h-8 w-8">
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setExpanded(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                aria-label={t('lots')}
                className="text-slate-400 hover:text-slate-600 h-8 w-8"
              >
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
            </div>
          </div>

          {isOpen && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('lots')}（{s.lots.length}）
                </span>
                {isManager && (
                  <Button variant="ghost" size="sm" onClick={() => openLotForm(s.id)} className="text-xs text-blue-600 hover:text-blue-700 h-7">
                    <Plus size={13} className="mr-1" />{t('newLot')}
                  </Button>
                )}
              </div>

              {isManager && lotFormSupplyId === s.id && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label htmlFor={`lot-no-${s.id}`} className="block text-xs text-slate-500 mb-1">
                        {t('lotNo')} <span className="text-red-500">*</span>
                      </label>
                      <Input id={`lot-no-${s.id}`} value={lotNo} onChange={e => setLotNo(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor={`lot-expiry-${s.id}`} className="block text-xs text-slate-500 mb-1">{t('expiryDate')}</label>
                      <input
                        id={`lot-expiry-${s.id}`}
                        type="date"
                        value={lotExpiry}
                        onChange={e => setLotExpiry(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor={`lot-qty-${s.id}`} className="block text-xs text-slate-500 mb-1">
                        {t('quantity')} <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id={`lot-qty-${s.id}`}
                        type="number"
                        min="0"
                        value={lotQuantity}
                        onChange={e => setLotQuantity(e.target.value)}
                        className="text-right tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor={`lot-received-${s.id}`} className="block text-xs text-slate-500 mb-1">{t('receivedDate')}</label>
                      <input
                        id={`lot-received-${s.id}`}
                        type="date"
                        value={lotReceived}
                        onChange={e => setLotReceived(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <Button size="sm" onClick={() => submitLot(s.id)} disabled={savingLot}>
                    <Plus size={14} className="mr-1" />{savingLot ? t('submitting') : t('submit')}
                  </Button>
                </div>
              )}

              {s.lots.map(renderLot)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const searchLabel = `${t('name')} / ${t('catalogNo')}`

  return (
    <div className="space-y-4 pb-8">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {([
          { key: 'list' as Tab, label: t('tabList') },
          { key: 'due' as Tab, label: t('tabDue') },
        ]).map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === item.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {/* 工具列 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchLabel}
                aria-label={searchLabel}
                className="pl-8"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              aria-label={t('category')}
              className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">{t('category')}</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{t(CATEGORY_KEYS[c])}</option>
              ))}
            </select>
            {isManager && (
              <Button size="sm" onClick={openNewSupply} className="ml-auto">
                <Plus size={14} className="mr-1" />{t('newSupply')}
              </Button>
            )}
          </div>

          {/* 品項新增/編輯表單 */}
          {isManager && supplyFormOpen && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {editing ? t('editSupply') : t('newSupply')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="supply-name" className="block text-xs text-slate-500 mb-1">
                      {t('name')} <span className="text-red-500">*</span>
                    </label>
                    <Input id="supply-name" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="supply-category" className="block text-xs text-slate-500 mb-1">
                      {t('category')} <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="supply-category"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className={inputClass}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{t(CATEGORY_KEYS[c])}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="supply-catalog" className="block text-xs text-slate-500 mb-1">{t('catalogNo')}</label>
                    <Input id="supply-catalog" value={catalogNo} onChange={e => setCatalogNo(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="supply-vendor" className="block text-xs text-slate-500 mb-1">{t('vendorName')}</label>
                    <Input id="supply-vendor" value={vendorName} onChange={e => setVendorName(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="supply-storage" className="block text-xs text-slate-500 mb-1">{t('storageCondition')}</label>
                    <select
                      id="supply-storage"
                      value={storageCondition}
                      onChange={e => setStorageCondition(e.target.value)}
                      className={inputClass}
                    >
                      {STORAGE_CONDITIONS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="supply-unit" className="block text-xs text-slate-500 mb-1">{t('unit')}</label>
                    <Input id="supply-unit" value={unit} onChange={e => setUnit(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="supply-safety" className="block text-xs text-slate-500 mb-1">{t('safetyStock')}</label>
                    <Input
                      id="supply-safety"
                      type="number"
                      min="0"
                      value={safetyStock}
                      onChange={e => setSafetyStock(e.target.value)}
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="supply-note" className="block text-xs text-slate-500 mb-1">{t('note')}</label>
                    <Input id="supply-note" value={noteField} onChange={e => setNoteField(e.target.value)} />
                  </div>
                </div>
                <Button onClick={submitSupply} disabled={savingSupply}>
                  <Plus size={14} className="mr-1" />{savingSupply ? t('submitting') : t('submit')}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 品項清單 */}
          <div className="space-y-2">
            {loading && <p className="text-sm text-slate-400">…</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">{t('noSupplies')}</p>
            )}
            {filtered.map(renderSupply)}
          </div>
        </>
      )}

      {/* 到期提醒 */}
      {tab === 'due' && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-slate-400">…</p>}
          {!loading && dueLots.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">{t('noDue')}</p>
          )}
          {dueLots.map(({ supply, lot, days }) => (
            <Card key={lot.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{supply.name}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 font-mono">{lot.lot_no}</span>
                    <span className="text-xs text-slate-400 tabular-nums">{lot.expiry_date}</span>
                  </div>
                  {days < 0 ? (
                    <Badge className="text-xs border bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300">
                      {t('expired')}
                    </Badge>
                  ) : (
                    <Badge className={`text-xs border ${
                      days <= 30
                        ? 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {t('daysLeft', { days })}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
