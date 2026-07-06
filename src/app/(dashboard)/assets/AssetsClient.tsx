'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Paperclip, X, Search, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { taipeiToday } from '@/lib/taipei-date'

type AssetCategory = 'it_equipment' | 'instrument' | 'furniture' | 'other'
type AssetStatus = 'in_use' | 'idle' | 'repair' | 'retired'
type LogType = 'maintenance' | 'calibration' | 'repair' | 'checkout' | 'checkin' | 'note'

interface UserOption {
  id: string
  display_name: string | null
  email: string
}

interface Asset {
  id: string
  asset_no: string
  name: string
  category: AssetCategory
  serial_no: string | null
  location: string | null
  custodian_id: string | null
  custodian: { id: string; display_name: string | null } | null
  status: AssetStatus
  purchase_date: string | null
  purchase_amount: number | null
  vendor_name: string | null
  calibration_cycle_months: number | null
  next_calibration_date: string | null
  maintenance_cycle_months: number | null
  next_maintenance_date: string | null
  note: string | null
}

interface AssetLog {
  id: string
  log_type: LogType
  log_date: string
  performed_by: string | null
  next_due_date: string | null
  note: string | null
  attachment_paths: string[]
  user: { display_name: string | null } | null
}

interface AssetDetail extends Asset {
  logs: AssetLog[]
}

interface GrOption {
  id: string
  doc_no: string
  vendor_name: string | null
  total_amount: number | null
  purchase_date: string | null
}

interface Props {
  isManager: boolean
  allUsers: UserOption[]
}

type Tab = 'list' | 'new' | 'due'

const CATEGORIES: AssetCategory[] = ['it_equipment', 'instrument', 'furniture', 'other']
const CATEGORY_KEYS: Record<AssetCategory, string> = {
  it_equipment: 'catItEquipment', instrument: 'catInstrument',
  furniture: 'catFurniture', other: 'catOther',
}
const STATUSES: AssetStatus[] = ['in_use', 'idle', 'repair', 'retired']
const STATUS_KEYS: Record<AssetStatus, string> = {
  in_use: 'statusInUse', idle: 'statusIdle', repair: 'statusRepair', retired: 'statusRetired',
}
const STATUS_COLORS: Record<AssetStatus, string> = {
  in_use: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  idle: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  repair: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  retired: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
}
const LOG_TYPES: LogType[] = ['maintenance', 'calibration', 'repair', 'checkout', 'checkin', 'note']
const LOG_TYPE_KEYS: Record<LogType, string> = {
  maintenance: 'logMaintenance', calibration: 'logCalibration', repair: 'logRepair',
  checkout: 'logCheckout', checkin: 'logCheckin', note: 'logNote',
}

const DUE_SOON_CLASS = 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
const OVERDUE_CLASS = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
const SELECT_CLASS = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

interface AssetForm {
  asset_no: string
  name: string
  category: string
  serial_no: string
  location: string
  custodian_id: string
  status: string
  purchase_date: string
  purchase_amount: string
  vendor_name: string
  calibration_cycle_months: string
  next_calibration_date: string
  maintenance_cycle_months: string
  next_maintenance_date: string
  note: string
  source_gr_id: string
}

const EMPTY_FORM: AssetForm = {
  asset_no: '', name: '', category: 'it_equipment', serial_no: '', location: '',
  custodian_id: '', status: 'in_use', purchase_date: '', purchase_amount: '',
  vendor_name: '', calibration_cycle_months: '', next_calibration_date: '',
  maintenance_cycle_months: '', next_maintenance_date: '', note: '', source_gr_id: '',
}

const toNumberOrNull = (s: string): number | null =>
  s !== '' && Number.isFinite(Number(s)) ? Number(s) : null

const buildAssetPayload = (f: AssetForm) => ({
  asset_no: f.asset_no.trim(),
  name: f.name.trim(),
  category: f.category,
  serial_no: f.serial_no.trim() || null,
  location: f.location.trim() || null,
  custodian_id: f.custodian_id || null,
  status: f.status,
  purchase_date: f.purchase_date || null,
  purchase_amount: toNumberOrNull(f.purchase_amount),
  vendor_name: f.vendor_name.trim() || null,
  calibration_cycle_months: toNumberOrNull(f.calibration_cycle_months),
  next_calibration_date: f.next_calibration_date || null,
  maintenance_cycle_months: toNumberOrNull(f.maintenance_cycle_months),
  next_maintenance_date: f.next_maintenance_date || null,
  note: f.note.trim() || null,
})

// 建立資產專用：帶上來源進貨驗收單（編輯時不可變更，故 PATCH 沿用 buildAssetPayload 即可）
const buildCreatePayload = (f: AssetForm) => ({
  ...buildAssetPayload(f),
  source_gr_id: f.source_gr_id || null,
})

const toForm = (a: Asset): AssetForm => ({
  asset_no: a.asset_no,
  name: a.name,
  category: a.category,
  serial_no: a.serial_no ?? '',
  location: a.location ?? '',
  custodian_id: a.custodian_id ?? '',
  status: a.status,
  purchase_date: a.purchase_date ?? '',
  purchase_amount: a.purchase_amount != null ? String(a.purchase_amount) : '',
  vendor_name: a.vendor_name ?? '',
  calibration_cycle_months: a.calibration_cycle_months != null ? String(a.calibration_cycle_months) : '',
  next_calibration_date: a.next_calibration_date ?? '',
  maintenance_cycle_months: a.maintenance_cycle_months != null ? String(a.maintenance_cycle_months) : '',
  next_maintenance_date: a.next_maintenance_date ?? '',
  note: a.note ?? '',
  source_gr_id: '',
})

const daysUntil = (dateStr: string): number => {
  const today = new Date(`${taipeiToday()}T00:00:00Z`).getTime()
  const target = new Date(`${dateStr}T00:00:00Z`).getTime()
  return Math.round((target - today) / 86400000)
}

const dueState = (a: Asset): 'overdue' | 'dueSoon' | null => {
  if (a.status === 'retired') return null
  const dates = [a.next_calibration_date, a.next_maintenance_date].filter((d): d is string => !!d)
  if (!dates.length) return null
  const minDays = Math.min(...dates.map(daysUntil))
  if (minDays < 0) return 'overdue'
  if (minDays <= 30) return 'dueSoon'
  return null
}

export function AssetsClient({ isManager, allUsers }: Props) {
  const t = useTranslations('assets')
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('list')
  const [assets, setAssets] = useState<Asset[]>([])
  const [dueAssets, setDueAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  // 來源進貨驗收單（轉資產）
  const [grOptions, setGrOptions] = useState<GrOption[]>([])

  // 清單篩選
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 展開詳情
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AssetDetail | null>(null)

  // 新增資產
  const [newForm, setNewForm] = useState<AssetForm>(EMPTY_FORM)
  const [newSubmitting, setNewSubmitting] = useState(false)

  // 編輯資產
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<AssetForm>(EMPTY_FORM)
  const [editSubmitting, setEditSubmitting] = useState(false)

  // 新增記錄
  const [showLogForm, setShowLogForm] = useState(false)
  const [logType, setLogType] = useState<LogType>('maintenance')
  const [logDate, setLogDate] = useState(() => taipeiToday())
  const [performedBy, setPerformedBy] = useState('')
  const [nextDueDate, setNextDueDate] = useState('')
  const [logCustodianId, setLogCustodianId] = useState('')
  const [logNote, setLogNote] = useState('')
  const [logFiles, setLogFiles] = useState<{ path: string; name: string }[]>([])
  const [logUploading, setLogUploading] = useState(false)
  const [logSubmitting, setLogSubmitting] = useState(false)

  const loadAssets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.set('category', categoryFilter)
      if (statusFilter) params.set('status', statusFilter)
      const qs = params.toString()
      const res = await fetch(`/api/assets${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setAssets(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, statusFilter, t])

  const loadDue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/assets?due=1')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setDueAssets(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const load = async () => {
      if (tab === 'due') await loadDue()
      else if (tab === 'list') await loadAssets()
    }
    load()
  }, [tab, loadAssets, loadDue])

  // 供「新增資產」表單選用的已核准進貨驗收單清單。非 asset_manage/admin 或載入
  // 失敗（含 403）時靜默留空，下拉不顯示，不中斷頁面。
  const loadGrOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/assets/gr-options')
      if (!res.ok) { setGrOptions([]); return }
      const json = await res.json()
      setGrOptions(json.data ?? [])
    } catch {
      setGrOptions([])
    }
  }, [])

  useEffect(() => {
    if (isManager) loadGrOptions()
  }, [isManager, loadGrOptions])

  // 將所選 GR 的廠商/金額/日期預填到表單（使用者仍可覆寫）
  const applyGrToForm = useCallback((setForm: Dispatch<SetStateAction<AssetForm>>, gr: GrOption) => {
    setForm(prev => ({
      ...prev,
      source_gr_id: gr.id,
      vendor_name: gr.vendor_name ?? prev.vendor_name,
      purchase_amount: gr.total_amount != null ? String(gr.total_amount) : prev.purchase_amount,
      purchase_date: gr.purchase_date ?? prev.purchase_date,
    }))
  }, [])

  // 從 GR 詳情頁的「轉為資產」導入：?gr=<id> 時開啟新增表單並預選該 GR
  useEffect(() => {
    const grId = searchParams.get('gr')
    if (!grId || grOptions.length === 0) return
    const gr = grOptions.find(g => g.id === grId)
    if (!gr) return
    setTab('new')
    applyGrToForm(setNewForm, gr)
  }, [searchParams, grOptions, applyGrToForm])

  const loadDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/assets/${id}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setDetail(json.data ?? null)
    } catch {
      toast.error(t('loadFailed'))
    }
  }

  const resetLogForm = () => {
    setLogType('maintenance')
    setLogDate(taipeiToday())
    setPerformedBy('')
    setNextDueDate('')
    setLogCustodianId('')
    setLogNote('')
    setLogFiles([])
  }

  const toggleExpand = async (id: string) => {
    setEditing(false)
    setShowLogForm(false)
    resetLogForm()
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(id)
    setDetail(null)
    await loadDetail(id)
  }

  const uploadLogFile = async (file: File) => {
    setLogUploading(true)
    try {
      const presignedRes = await fetch('/api/storage/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'asset-files', filename: file.name }),
      })
      if (!presignedRes.ok) throw new Error()
      const { data: presigned } = await presignedRes.json()
      const uploadRes = await fetch(presigned.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) throw new Error()
      setLogFiles(prev => [...prev, { path: presigned.path, name: file.name }])
    } catch {
      toast.error(t('uploadFailed'))
    } finally {
      setLogUploading(false)
    }
  }

  const submitNewAsset = async () => {
    if (!newForm.asset_no.trim() || !newForm.name.trim() || !newForm.category) {
      toast.error(t('requiredFields'))
      return
    }
    setNewSubmitting(true)
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCreatePayload(newForm)),
      })
      if (!res.ok) throw new Error()
      toast.success(t('created'))
      setNewForm(EMPTY_FORM)
      setTab('list')
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setNewSubmitting(false)
    }
  }

  const startEdit = () => {
    if (!detail) return
    setEditForm(toForm(detail))
    setShowLogForm(false)
    setEditing(true)
  }

  const submitEdit = async () => {
    if (!detail) return
    if (!editForm.asset_no.trim() || !editForm.name.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setEditSubmitting(true)
    try {
      const res = await fetch(`/api/assets/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAssetPayload(editForm)),
      })
      if (!res.ok) throw new Error()
      toast.success(t('saved'))
      setEditing(false)
      await Promise.all([loadDetail(detail.id), loadAssets()])
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteConfirm'))) return
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(t('deleted'))
      setExpandedId(null)
      setDetail(null)
      await loadAssets()
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  const submitLog = async () => {
    if (!detail) return
    if (!logDate) {
      toast.error(t('requiredFields'))
      return
    }
    setLogSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        log_type: logType,
        log_date: logDate,
        performed_by: performedBy.trim() || null,
        note: logNote.trim() || null,
        attachment_paths: logFiles.map(f => f.path),
      }
      if (logType === 'calibration' || logType === 'maintenance') {
        body.next_due_date = nextDueDate || null
      }
      if (logType === 'checkout' || logType === 'checkin') {
        body.custodian_id = logCustodianId || null
      }
      const res = await fetch(`/api/assets/${detail.id}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success(t('saved'))
      resetLogForm()
      setShowLogForm(false)
      await Promise.all([loadDetail(detail.id), loadAssets()])
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setLogSubmitting(false)
    }
  }

  const userLabel = (u: UserOption) => u.display_name ?? u.email
  const fmtAmount = (v: number) => `NT$ ${Number(v).toLocaleString()}`

  const tabs: { key: Tab; label: string }[] = [
    { key: 'list', label: t('tabList') },
    ...(isManager ? [{ key: 'new' as Tab, label: t('tabNew') }] : []),
    { key: 'due', label: t('tabDue') },
  ]

  const q = search.trim().toLowerCase()
  const visibleAssets = q
    ? assets.filter(a =>
        [a.asset_no, a.name, a.serial_no ?? ''].some(s => s.toLowerCase().includes(q)))
    : assets

  interface DueItem { asset: Asset; kind: 'calibration' | 'maintenance'; date: string; days: number }
  const dueItems: DueItem[] = []
  for (const a of dueAssets) {
    if (a.next_calibration_date) {
      const days = daysUntil(a.next_calibration_date)
      if (days <= 60) dueItems.push({ asset: a, kind: 'calibration', date: a.next_calibration_date, days })
    }
    if (a.next_maintenance_date) {
      const days = daysUntil(a.next_maintenance_date)
      if (days <= 60) dueItems.push({ asset: a, kind: 'maintenance', date: a.next_maintenance_date, days })
    }
  }
  dueItems.sort((x, y) => x.date.localeCompare(y.date))

  // --- 表單欄位 helpers（非元件，避免 remount 造成 focus 遺失）---

  const textField = (
    label: string, value: string, onChange: (v: string) => void,
    opts?: { required?: boolean; type?: string },
  ) => (
    <div>
      <label className="block text-xs text-slate-500 mb-1">
        {label}{opts?.required && <span className="text-red-500"> *</span>}
      </label>
      <Input type={opts?.type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )

  const selectField = (
    label: string, value: string, onChange: (v: string) => void,
    options: { value: string; label: string }[],
    opts?: { required?: boolean; emptyLabel?: string },
  ) => (
    <div>
      <label className="block text-xs text-slate-500 mb-1">
        {label}{opts?.required && <span className="text-red-500"> *</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)} className={SELECT_CLASS}>
        {opts?.emptyLabel !== undefined && <option value="">{opts.emptyLabel}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )

  const renderAssetForm = (
    form: AssetForm,
    setForm: Dispatch<SetStateAction<AssetForm>>,
    onSubmit: () => void,
    busy: boolean,
    showGrField = false,
  ) => {
    const set = (k: keyof AssetForm) => (v: string) => setForm(prev => ({ ...prev, [k]: v }))
    const selectGr = (grId: string) => {
      if (!grId) { setForm(prev => ({ ...prev, source_gr_id: '' })); return }
      const gr = grOptions.find(g => g.id === grId)
      if (gr) applyGrToForm(setForm, gr)
    }
    return (
      <div className="space-y-3">
        {showGrField && grOptions.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {selectField(t('fromGoodsReceipt'), form.source_gr_id, selectGr,
              grOptions.map(g => ({
                value: g.id,
                label: t('grOptionLabel', {
                  docNo: g.doc_no,
                  vendor: g.vendor_name ?? '—',
                  amount: g.total_amount != null ? g.total_amount.toLocaleString() : '—',
                }),
              })),
              { emptyLabel: t('selectGoodsReceipt') })}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {textField(t('assetNo'), form.asset_no, set('asset_no'), { required: true })}
          {textField(t('name'), form.name, set('name'), { required: true })}
          {selectField(t('category'), form.category, set('category'),
            CATEGORIES.map(c => ({ value: c, label: t(CATEGORY_KEYS[c]) })), { required: true })}
          {selectField(t('statusLabel'), form.status, set('status'),
            STATUSES.map(s => ({ value: s, label: t(STATUS_KEYS[s]) })))}
          {textField(t('serialNo'), form.serial_no, set('serial_no'))}
          {textField(t('location'), form.location, set('location'))}
          {selectField(t('custodian'), form.custodian_id, set('custodian_id'),
            allUsers.map(u => ({ value: u.id, label: userLabel(u) })), { emptyLabel: '—' })}
          {textField(t('purchaseDate'), form.purchase_date, set('purchase_date'), { type: 'date' })}
          {textField(t('purchaseAmount'), form.purchase_amount, set('purchase_amount'), { type: 'number' })}
          {textField(t('vendorName'), form.vendor_name, set('vendor_name'))}
          {textField(t('calibrationCycleMonths'), form.calibration_cycle_months, set('calibration_cycle_months'), { type: 'number' })}
          {textField(t('nextCalibration'), form.next_calibration_date, set('next_calibration_date'), { type: 'date' })}
          {textField(t('maintenanceCycleMonths'), form.maintenance_cycle_months, set('maintenance_cycle_months'), { type: 'number' })}
          {textField(t('nextMaintenance'), form.next_maintenance_date, set('next_maintenance_date'), { type: 'date' })}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('note')}</label>
          <Textarea value={form.note} onChange={e => set('note')(e.target.value)} rows={3} />
        </div>
        <Button onClick={onSubmit} disabled={busy}>
          <Plus size={14} className="mr-1" />{busy ? t('submitting') : t('submit')}
        </Button>
      </div>
    )
  }

  const renderLogForm = () => (
    <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {selectField(t('category'), logType, v => setLogType(v as LogType),
          LOG_TYPES.map(lt => ({ value: lt, label: t(LOG_TYPE_KEYS[lt]) })), { required: true })}
        {textField(t('logDate'), logDate, setLogDate, { type: 'date', required: true })}
        {textField(t('performedBy'), performedBy, setPerformedBy)}
        {(logType === 'calibration' || logType === 'maintenance') &&
          textField(t('nextDueDate'), nextDueDate, setNextDueDate, { type: 'date' })}
        {(logType === 'checkout' || logType === 'checkin') &&
          selectField(t('custodian'), logCustodianId, setLogCustodianId,
            allUsers.map(u => ({ value: u.id, label: userLabel(u) })), { emptyLabel: '—' })}
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">{t('note')}</label>
        <Textarea value={logNote} onChange={e => setLogNote(e.target.value)} rows={2} />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">{t('attachments')}</label>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
            <Paperclip size={14} />
            {logUploading ? t('submitting') : t('uploadFile')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              disabled={logUploading}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) uploadLogFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {logFiles.map((f, i) => (
            <span key={f.path} className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1">
              #{i + 1} {f.name}
              <button
                onClick={() => setLogFiles(prev => prev.filter(x => x.path !== f.path))}
                className="text-slate-400 hover:text-red-500"
                aria-label={t('deleteAsset')}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>
      <Button onClick={submitLog} disabled={logSubmitting || logUploading}>
        <Plus size={14} className="mr-1" />{logSubmitting ? t('submitting') : t('submit')}
      </Button>
    </div>
  )

  const detailRow = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700 dark:text-slate-300 break-words">{value ?? '—'}</dd>
    </div>
  )

  const renderLog = (log: AssetLog) => (
    <div key={log.id} className="border-t border-slate-100 dark:border-slate-800 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs">{t(LOG_TYPE_KEYS[log.log_type])}</Badge>
        <span className="text-xs text-slate-400">{log.log_date}</span>
        {log.performed_by && (
          <span className="text-xs text-slate-400">{t('performedBy')}: {log.performed_by}</span>
        )}
        {log.next_due_date && (
          <span className="text-xs text-slate-400">{t('nextDueDate')}: {log.next_due_date}</span>
        )}
        {log.user?.display_name && (
          <span className="text-xs text-slate-400">{log.user.display_name}</span>
        )}
        {log.attachment_paths.length > 0 && (
          <span className="text-xs text-slate-400 inline-flex items-center gap-1">
            <Paperclip size={12} />
            {log.attachment_paths.map((p, i) => (
              <a
                key={p}
                href={`/api/storage/download?bucket=asset-files&path=${encodeURIComponent(p)}`}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-blue-500"
              >
                #{i + 1}
              </a>
            ))}
          </span>
        )}
      </div>
      {log.note && (
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words">{log.note}</p>
      )}
    </div>
  )

  const renderDetail = (d: AssetDetail) => (
    <>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        {detailRow(t('assetNo'), d.asset_no)}
        {detailRow(t('name'), d.name)}
        {detailRow(t('category'), t(CATEGORY_KEYS[d.category]))}
        {detailRow(t('statusLabel'), t(STATUS_KEYS[d.status]))}
        {detailRow(t('serialNo'), d.serial_no)}
        {detailRow(t('location'), d.location)}
        {detailRow(t('custodian'), d.custodian?.display_name)}
        {detailRow(t('purchaseDate'), d.purchase_date)}
        {detailRow(t('purchaseAmount'), d.purchase_amount != null
          ? <span className="tabular-nums">{fmtAmount(d.purchase_amount)}</span>
          : null)}
        {detailRow(t('vendorName'), d.vendor_name)}
        {detailRow(t('calibrationCycleMonths'), d.calibration_cycle_months)}
        {detailRow(t('nextCalibration'), d.next_calibration_date)}
        {detailRow(t('maintenanceCycleMonths'), d.maintenance_cycle_months)}
        {detailRow(t('nextMaintenance'), d.next_maintenance_date)}
        {detailRow(t('note'), d.note)}
      </dl>

      {isManager && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setEditing(false); setShowLogForm(v => !v) }}>
            <Plus size={14} className="mr-1" />{t('addLog')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => (editing ? setEditing(false) : startEdit())}>
            <Pencil size={14} className="mr-1" />{t('editAsset')}
          </Button>
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(d.id)}>
            <Trash2 size={14} className="mr-1" />{t('deleteAsset')}
          </Button>
        </div>
      )}

      {isManager && showLogForm && !editing && renderLogForm()}

      {isManager && editing && (
        <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          {renderAssetForm(editForm, setEditForm, submitEdit, editSubmitting)}
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('logsTitle')}</h3>
        {d.logs.length === 0
          ? <p className="text-xs text-slate-400 mt-1">—</p>
          : <div className="mt-1">{d.logs.map(renderLog)}</div>}
      </div>
    </>
  )

  const renderAssetCard = (a: Asset) => {
    const due = dueState(a)
    const expanded = expandedId === a.id
    return (
      <Card key={a.id}>
        <CardContent className="pt-4 pb-3">
          <div
            className="flex items-start justify-between gap-2 cursor-pointer"
            onClick={() => toggleExpand(a.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {a.asset_no} · {a.name}
                </span>
                <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[a.category])}</Badge>
                <Badge className={`text-xs border ${STATUS_COLORS[a.status]}`}>{t(STATUS_KEYS[a.status])}</Badge>
                {due === 'dueSoon' && (
                  <Badge className={`text-xs border ${DUE_SOON_CLASS}`}>{t('dueSoon')}</Badge>
                )}
                {due === 'overdue' && (
                  <Badge className={`text-xs border ${OVERDUE_CLASS}`}>{t('overdue')}</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {a.custodian?.display_name && (
                  <span className="text-xs text-slate-400">{t('custodian')}: {a.custodian.display_name}</span>
                )}
                {a.location && (
                  <span className="text-xs text-slate-400">{t('location')}: {a.location}</span>
                )}
              </div>
            </div>
            <span className="shrink-0 text-slate-400 mt-0.5">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </div>

          {expanded && (
            <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
              {!detail && <p className="text-sm text-slate-400">…</p>}
              {detail && detail.id === a.id && renderDetail(detail)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === item.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 資產清單 */}
      {tab === 'list' && (
        <>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="pl-8"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className={`${SELECT_CLASS} w-auto`}
              aria-label={t('category')}
            >
              <option value="">{t('category')}</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{t(CATEGORY_KEYS[c])}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={`${SELECT_CLASS} w-auto`}
              aria-label={t('statusLabel')}
            >
              <option value="">{t('statusLabel')}</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{t(STATUS_KEYS[s])}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {loading && <p className="text-sm text-slate-400">…</p>}
            {!loading && visibleAssets.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">{t('noAssets')}</p>
            )}
            {!loading && visibleAssets.map(renderAssetCard)}
          </div>
        </>
      )}

      {/* 新增資產 */}
      {tab === 'new' && isManager && (
        <Card>
          <CardContent className="pt-4">
            {renderAssetForm(newForm, setNewForm, submitNewAsset, newSubmitting, true)}
          </CardContent>
        </Card>
      )}

      {/* 到期提醒 */}
      {tab === 'due' && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-slate-400">…</p>}
          {!loading && dueItems.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">{t('noDue')}</p>
          )}
          {!loading && dueItems.map(item => (
            <Card key={`${item.asset.id}-${item.kind}`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {item.asset.asset_no} · {item.asset.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {t(item.kind === 'calibration' ? 'logCalibration' : 'logMaintenance')}
                    </Badge>
                    <span className="text-xs text-slate-400">{item.date}</span>
                  </div>
                  <Badge
                    className={`text-xs border tabular-nums ${
                      item.days < 0 ? OVERDUE_CLASS : item.days <= 30 ? DUE_SOON_CLASS
                        : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {item.days < 0
                      ? `${t('overdue')} D+${-item.days}`
                      : item.days <= 30
                        ? `${t('dueSoon')} D-${item.days}`
                        : `D-${item.days}`}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
