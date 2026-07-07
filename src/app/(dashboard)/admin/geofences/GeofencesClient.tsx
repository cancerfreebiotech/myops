'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Trash2, Plus, LocateFixed } from 'lucide-react'

export interface Geofence {
  id: string
  name: string
  lat: number
  lng: number
  radius_m: number
  is_active: boolean
}

interface Props { initialFences: Geofence[]; initialEnforce: boolean }

export function GeofencesClient({ initialFences, initialEnforce }: Props) {
  const t = useTranslations('admin.geofences')
  const tc = useTranslations('common')
  const router = useRouter()
  const [fences, setFences] = useState<Geofence[]>(initialFences)
  const [enforce, setEnforce] = useState(initialEnforce)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', lat: '', lng: '', radius_m: '200' })

  const toggleEnforce = async () => {
    const next = !enforce
    setBusy(true)
    const res = await fetch('/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'geofence_enforce', value: String(next) }),
    })
    setBusy(false)
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    setEnforce(next); toast.success(tc('saved')); router.refresh()
  }

  const addFence = async () => {
    const lat = parseFloat(form.lat), lng = parseFloat(form.lng), radius_m = parseInt(form.radius_m)
    if (!form.name.trim() || Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radius_m) || radius_m <= 0) {
      toast.error(t('invalidInput')); return
    }
    setBusy(true)
    const res = await fetch('/api/admin/geofences', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), lat, lng, radius_m }),
    })
    setBusy(false)
    const { data, error } = await res.json()
    if (error) { toast.error(error); return }
    setFences(f => [...f, data as Geofence])
    setForm({ name: '', lat: '', lng: '', radius_m: '200' })
    toast.success(tc('saved'))
  }

  const toggleActive = async (g: Geofence) => {
    const res = await fetch('/api/admin/geofences', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id, is_active: !g.is_active }),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    setFences(fs => fs.map(x => x.id === g.id ? { ...x, is_active: !x.is_active } : x))
  }

  const removeFence = async (g: Geofence) => {
    if (!confirm(t('confirmDelete', { name: g.name }))) return
    const res = await fetch('/api/admin/geofences', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id }),
    })
    const { error } = await res.json()
    if (error) { toast.error(error); return }
    setFences(fs => fs.filter(x => x.id !== g.id)); toast.success(tc('saved'))
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error(t('geoUnsupported')); return }
    navigator.geolocation.getCurrentPosition(
      p => setForm(f => ({ ...f, lat: p.coords.latitude.toFixed(7), lng: p.coords.longitude.toFixed(7) })),
      () => toast.error(t('geoDenied')),
      { timeout: 8000 },
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Enforce 開關 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('enforceLabel')}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t('enforceDesc')}</p>
        </div>
        <button
          onClick={toggleEnforce}
          disabled={busy}
          className={[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0',
            enforce ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-600',
            busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
          aria-label={enforce ? t('enforceOff') : t('enforceOn')}
        >
          <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', enforce ? 'translate-x-6' : 'translate-x-1'].join(' ')} />
        </button>
      </div>

      {/* 新增圍欄 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('addTitle')}</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Input placeholder={t('name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder={t('lat')} inputMode="decimal" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} />
            <Input placeholder={t('lng')} inputMode="decimal" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} />
          </div>
          <Input placeholder={t('radius')} inputMode="numeric" value={form.radius_m} onChange={e => setForm(f => ({ ...f, radius_m: e.target.value }))} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={useMyLocation}><LocateFixed size={14} className="mr-1" />{t('useMyLocation')}</Button>
            <Button size="sm" onClick={addFence} disabled={busy}><Plus size={14} className="mr-1" />{t('add')}</Button>
          </div>
        </div>
      </div>

      {/* 圍欄清單 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('listTitle')}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {fences.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">{t('empty')}</p>
          ) : fences.map(g => (
            <div key={g.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{g.name}</p>
                <p className="text-xs text-slate-400">{Number(g.lat).toFixed(5)}, {Number(g.lng).toFixed(5)} · {g.radius_m}m</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => toggleActive(g)}
                  className={['relative inline-flex h-6 w-11 items-center rounded-full transition-colors', g.is_active ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'].join(' ')}
                  aria-label={g.is_active ? t('disable') : t('enable')}
                >
                  <span className={['inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', g.is_active ? 'translate-x-6' : 'translate-x-1'].join(' ')} />
                </button>
                <button onClick={() => removeFence(g)} className="text-slate-400 hover:text-red-600" aria-label={t('delete')}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
