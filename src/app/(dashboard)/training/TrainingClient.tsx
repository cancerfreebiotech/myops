'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslations } from 'next-intl'
import {
  Plus, Pencil, Trash2, Paperclip, X, Check, ExternalLink,
  ChevronDown, ChevronUp, UserPlus, UserMinus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { taipeiToday } from '@/lib/taipei-date'

type TrainingCategory = 'gcp' | 'biosafety' | 'radiation' | 'quality' | 'general'
type RecordStatus = 'assigned' | 'completed'

interface UserOption {
  id: string
  display_name: string | null
  email: string
}

interface CourseRecord {
  id: string
  user_id: string
  status: RecordStatus
  completed_at: string | null
  user: { display_name: string | null } | null
}

interface Course {
  id: string
  title: string
  category: TrainingCategory
  description: string | null
  material_url: string | null
  hours: number
  is_required: boolean
  records: CourseRecord[]
}

interface TrainingRecord {
  id: string
  user_id: string
  status: RecordStatus
  hours: number
  note: string | null
  attachment_paths: string[]
  assigned_at: string | null
  completed_at: string | null
  course: {
    id: string
    title: string
    category: TrainingCategory
    hours: number
    is_required: boolean
    material_url: string | null
  } | null
  user: { id: string; display_name: string | null } | null
}

interface Certification {
  id: string
  user_id: string
  name: string
  issuer: string | null
  cert_no: string | null
  issued_date: string | null
  expiry_date: string | null
  attachment_paths: string[]
  note: string | null
  user: { id: string; display_name: string | null } | null
}

interface FileRef {
  path: string
  name: string
}

interface Props {
  isManager: boolean
  allUsers: UserOption[]
  userId: string
}

type Tab = 'mine' | 'courses' | 'certs' | 'due'

const CATEGORIES: TrainingCategory[] = ['gcp', 'biosafety', 'radiation', 'quality', 'general']
const CATEGORY_KEYS: Record<TrainingCategory, string> = {
  gcp: 'catGcp', biosafety: 'catBiosafety', radiation: 'catRadiation',
  quality: 'catQuality', general: 'catGeneral',
}
const STATUS_KEYS: Record<RecordStatus, string> = {
  assigned: 'statusAssigned', completed: 'statusCompleted',
}
const STATUS_COLORS: Record<RecordStatus, string> = {
  assigned: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  completed: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
}
const REQUIRED_CLASS = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
const DUE_SOON_CLASS = 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300'
const OVERDUE_CLASS = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300'
const NEUTRAL_CLASS = 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
const SELECT_CLASS = 'w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

interface CourseForm {
  title: string
  category: string
  description: string
  material_url: string
  hours: string
  is_required: boolean
}

const EMPTY_COURSE_FORM: CourseForm = {
  title: '', category: 'gcp', description: '', material_url: '', hours: '', is_required: false,
}

interface CertForm {
  user_id: string
  name: string
  issuer: string
  cert_no: string
  issued_date: string
  expiry_date: string
  note: string
}

const toNumberOrNull = (s: string): number | null =>
  s !== '' && Number.isFinite(Number(s)) ? Number(s) : null

const daysUntil = (dateStr: string): number => {
  const today = new Date(`${taipeiToday()}T00:00:00Z`).getTime()
  const target = new Date(`${dateStr}T00:00:00Z`).getTime()
  return Math.round((target - today) / 86400000)
}

export function TrainingClient({ isManager, allUsers, userId }: Props) {
  const t = useTranslations('training')
  const [tab, setTab] = useState<Tab>('mine')
  const [records, setRecords] = useState<TrainingRecord[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [certs, setCerts] = useState<Certification[]>([])
  const [dueCerts, setDueCerts] = useState<Certification[]>([])
  const [loading, setLoading] = useState(true)

  // 我的訓練 — 標記完成
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completeNote, setCompleteNote] = useState('')
  const [completeFiles, setCompleteFiles] = useState<FileRef[]>([])
  const [completeUploading, setCompleteUploading] = useState(false)
  const [completeSubmitting, setCompleteSubmitting] = useState(false)

  // 課程管理
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null)
  const [courseForm, setCourseForm] = useState<CourseForm>(EMPTY_COURSE_FORM)
  const [courseSubmitting, setCourseSubmitting] = useState(false)
  const [assignCourseId, setAssignCourseId] = useState<string | null>(null)
  const [assignSelected, setAssignSelected] = useState<string[]>([])
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [rosterCourseId, setRosterCourseId] = useState<string | null>(null)

  // 證照
  const emptyCertForm = useCallback((): CertForm => ({
    user_id: userId, name: '', issuer: '', cert_no: '', issued_date: '', expiry_date: '', note: '',
  }), [userId])
  const [certView, setCertView] = useState<'mine' | 'all'>('mine')
  const [showCertForm, setShowCertForm] = useState(false)
  const [editingCertId, setEditingCertId] = useState<string | null>(null)
  const [certForm, setCertForm] = useState<CertForm>(emptyCertForm)
  const [certFiles, setCertFiles] = useState<FileRef[]>([])
  const [certUploading, setCertUploading] = useState(false)
  const [certSubmitting, setCertSubmitting] = useState(false)

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/training/records?view=mine')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setRecords(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadCourses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/training/courses')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setCourses(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadCerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/training/certifications?view=${certView}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setCerts(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [certView, t])

  const loadDue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/training/certifications?view=due')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setDueCerts(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const load = async () => {
      if (tab === 'mine') await loadRecords()
      else if (tab === 'courses') await loadCourses()
      else if (tab === 'certs') await loadCerts()
      else await loadDue()
    }
    load()
  }, [tab, loadRecords, loadCourses, loadCerts, loadDue])

  const uploadAttachment = async (
    file: File,
    setFiles: Dispatch<SetStateAction<FileRef[]>>,
    setUploading: Dispatch<SetStateAction<boolean>>,
  ) => {
    setUploading(true)
    try {
      const presignedRes = await fetch('/api/storage/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'training-files', filename: file.name }),
      })
      if (!presignedRes.ok) throw new Error()
      const { data: presigned } = await presignedRes.json()
      const uploadRes = await fetch(presigned.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) throw new Error()
      setFiles(prev => [...prev, { path: presigned.path, name: file.name }])
    } catch {
      toast.error(t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  // --- 我的訓練 ---

  const toggleComplete = (id: string) => {
    setCompleteNote('')
    setCompleteFiles([])
    setCompletingId(prev => (prev === id ? null : id))
  }

  const submitComplete = async (id: string) => {
    setCompleteSubmitting(true)
    try {
      const res = await fetch(`/api/training/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          note: completeNote.trim() || null,
          attachment_paths: completeFiles.map(f => f.path),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('statusCompleted'))
      setCompletingId(null)
      setCompleteNote('')
      setCompleteFiles([])
      await loadRecords()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setCompleteSubmitting(false)
    }
  }

  // --- 課程管理 ---

  const closeCourseForm = () => {
    setShowCourseForm(false)
    setEditingCourseId(null)
    setCourseForm(EMPTY_COURSE_FORM)
  }

  const toggleCreateCourse = () => {
    if (showCourseForm && !editingCourseId) {
      closeCourseForm()
      return
    }
    setEditingCourseId(null)
    setCourseForm(EMPTY_COURSE_FORM)
    setShowCourseForm(true)
  }

  const toggleEditCourse = (c: Course) => {
    if (showCourseForm && editingCourseId === c.id) {
      closeCourseForm()
      return
    }
    setCourseForm({
      title: c.title,
      category: c.category,
      description: c.description ?? '',
      material_url: c.material_url ?? '',
      hours: c.hours != null ? String(c.hours) : '',
      is_required: c.is_required,
    })
    setEditingCourseId(c.id)
    setShowCourseForm(true)
  }

  const submitCourse = async () => {
    if (!courseForm.title.trim() || !courseForm.category) {
      toast.error(t('requiredFields'))
      return
    }
    setCourseSubmitting(true)
    try {
      const res = await fetch(
        editingCourseId ? `/api/training/courses/${editingCourseId}` : '/api/training/courses',
        {
          method: editingCourseId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: courseForm.title.trim(),
            category: courseForm.category,
            description: courseForm.description.trim() || null,
            material_url: courseForm.material_url.trim() || null,
            hours: toNumberOrNull(courseForm.hours) ?? 0,
            is_required: courseForm.is_required,
          }),
        },
      )
      if (!res.ok) throw new Error()
      toast.success(t(editingCourseId ? 'courseSaved' : 'courseCreated'))
      closeCourseForm()
      await loadCourses()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setCourseSubmitting(false)
    }
  }

  const removeCourse = async (id: string) => {
    if (!confirm(t('deleteCourseConfirm'))) return
    try {
      const res = await fetch(`/api/training/courses/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(t('courseDeleted'))
      await loadCourses()
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  const toggleAssignPanel = (courseId: string) => {
    setAssignSelected([])
    setAssignCourseId(prev => (prev === courseId ? null : courseId))
  }

  const submitAssign = async (courseId: string) => {
    if (!assignSelected.length) return
    setAssignSubmitting(true)
    try {
      const res = await fetch('/api/training/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, user_ids: assignSelected }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('assignDone'))
      setAssignCourseId(null)
      setAssignSelected([])
      await loadCourses()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setAssignSubmitting(false)
    }
  }

  const unassignRecord = async (id: string) => {
    if (!confirm(t('unassignConfirm'))) return
    try {
      const res = await fetch(`/api/training/records/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(t('courseSaved'))
      await loadCourses()
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  // --- 證照 ---

  const closeCertForm = () => {
    setShowCertForm(false)
    setEditingCertId(null)
    setCertForm(emptyCertForm())
    setCertFiles([])
  }

  const toggleCreateCert = () => {
    if (showCertForm && !editingCertId) {
      closeCertForm()
      return
    }
    setEditingCertId(null)
    setCertForm(emptyCertForm())
    setCertFiles([])
    setShowCertForm(true)
  }

  const toggleEditCert = (c: Certification) => {
    if (showCertForm && editingCertId === c.id) {
      closeCertForm()
      return
    }
    setCertForm({
      user_id: c.user_id,
      name: c.name,
      issuer: c.issuer ?? '',
      cert_no: c.cert_no ?? '',
      issued_date: c.issued_date ?? '',
      expiry_date: c.expiry_date ?? '',
      note: c.note ?? '',
    })
    setCertFiles(c.attachment_paths.map(p => ({ path: p, name: p.split('/').pop() ?? p })))
    setEditingCertId(c.id)
    setShowCertForm(true)
  }

  const submitCert = async () => {
    if (!certForm.name.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setCertSubmitting(true)
    try {
      const base = {
        name: certForm.name.trim(),
        issuer: certForm.issuer.trim() || null,
        cert_no: certForm.cert_no.trim() || null,
        issued_date: certForm.issued_date || null,
        expiry_date: certForm.expiry_date || null,
        attachment_paths: certFiles.map(f => f.path),
        note: certForm.note.trim() || null,
      }
      const res = await fetch(
        editingCertId ? `/api/training/certifications/${editingCertId}` : '/api/training/certifications',
        {
          method: editingCertId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingCertId ? base : { ...base, user_id: certForm.user_id }),
        },
      )
      if (!res.ok) throw new Error()
      toast.success(t(editingCertId ? 'certSaved' : 'certAdded'))
      closeCertForm()
      await loadCerts()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setCertSubmitting(false)
    }
  }

  const removeCert = async (id: string) => {
    if (!confirm(t('deleteCertConfirm'))) return
    try {
      const res = await fetch(`/api/training/certifications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(t('certDeleted'))
      await loadCerts()
    } catch {
      toast.error(t('saveFailed'))
    }
  }

  // --- 共用 render helpers（非元件，避免 remount 造成 focus 遺失）---

  const userLabel = (u: UserOption) => u.display_name ?? u.email

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
    opts?: { required?: boolean },
  ) => (
    <div>
      <label className="block text-xs text-slate-500 mb-1">
        {label}{opts?.required && <span className="text-red-500"> *</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)} className={SELECT_CLASS}>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )

  const filePicker = (
    files: FileRef[],
    setFiles: Dispatch<SetStateAction<FileRef[]>>,
    uploading: boolean,
    setUploading: Dispatch<SetStateAction<boolean>>,
  ) => (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
        <Paperclip size={14} />
        {uploading ? t('submitting') : t('uploadFile')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          disabled={uploading}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) uploadAttachment(f, setFiles, setUploading)
            e.target.value = ''
          }}
        />
      </label>
      {files.map((f, i) => (
        <span key={f.path} className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1">
          #{i + 1} {f.name}
          <button
            onClick={() => setFiles(prev => prev.filter(x => x.path !== f.path))}
            className="text-slate-400 hover:text-red-500 cursor-pointer"
            aria-label={t('deleteCert')}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  )

  const attachmentLinks = (paths: string[]) =>
    paths.length > 0 ? (
      <span className="text-xs text-slate-400 inline-flex items-center gap-1">
        <Paperclip size={12} />
        {paths.map((p, i) => (
          <a
            key={p}
            href={`/api/storage/download?bucket=training-files&path=${encodeURIComponent(p)}`}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-blue-500"
          >
            #{i + 1}
          </a>
        ))}
      </span>
    ) : null

  const materialLink = (url: string) => (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
    >
      <ExternalLink size={12} />{t('viewMaterial')}
    </a>
  )

  // --- 我的訓練 ---

  const thisYear = taipeiToday().slice(0, 4)
  const myHours = records
    .filter(r => r.status === 'completed' && r.completed_at?.startsWith(thisYear))
    .reduce((sum, r) => sum + Number(r.hours || 0), 0)

  const renderRecord = (r: TrainingRecord) => (
    <Card key={r.id}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {r.course?.title ?? '—'}
              </span>
              {r.course && (
                <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[r.course.category])}</Badge>
              )}
              {r.course?.is_required && (
                <Badge className={`text-xs border ${REQUIRED_CLASS}`}>{t('requiredBadge')}</Badge>
              )}
              <Badge className={`text-xs border ${STATUS_COLORS[r.status]}`}>{t(STATUS_KEYS[r.status])}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-slate-400 tabular-nums">{t('hours')}: {Number(r.hours || 0)}</span>
              {r.assigned_at && (
                <span className="text-xs text-slate-400">{t('assignedAt')}: {r.assigned_at.slice(0, 10)}</span>
              )}
              {r.completed_at && (
                <span className="text-xs text-slate-400">{t('completedAt')}: {r.completed_at.slice(0, 10)}</span>
              )}
              {r.course?.material_url && materialLink(r.course.material_url)}
              {attachmentLinks(r.attachment_paths)}
            </div>
            {r.note && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words">{r.note}</p>
            )}
          </div>
          {r.status === 'assigned' && (
            <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => toggleComplete(r.id)}>
              <Check size={14} className="mr-1" />{t('markComplete')}
            </Button>
          )}
        </div>

        {r.status === 'assigned' && completingId === r.id && (
          <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('attachments')}</label>
              {filePicker(completeFiles, setCompleteFiles, completeUploading, setCompleteUploading)}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('note')}</label>
              <Textarea value={completeNote} onChange={e => setCompleteNote(e.target.value)} rows={2} />
            </div>
            <Button size="sm" onClick={() => submitComplete(r.id)} disabled={completeSubmitting || completeUploading}>
              <Check size={14} className="mr-1" />{completeSubmitting ? t('submitting') : t('markComplete')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )

  // --- 課程管理 ---

  const renderCourseForm = () => {
    const set = (k: keyof CourseForm) => (v: string) => setCourseForm(prev => ({ ...prev, [k]: v }))
    return (
      <Card>
        <CardContent className="pt-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t(editingCourseId ? 'editCourse' : 'createCourse')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {textField(t('courseTitle'), courseForm.title, set('title'), { required: true })}
            {selectField(t('category'), courseForm.category, set('category'),
              CATEGORIES.map(c => ({ value: c, label: t(CATEGORY_KEYS[c]) })), { required: true })}
            {textField(t('materialUrl'), courseForm.material_url, set('material_url'))}
            {textField(t('hours'), courseForm.hours, set('hours'), { type: 'number' })}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('courseDescription')}</label>
            <Textarea
              value={courseForm.description}
              onChange={e => set('description')(e.target.value)}
              rows={3}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={courseForm.is_required}
              onChange={e => setCourseForm(prev => ({ ...prev, is_required: e.target.checked }))}
            />
            {t('isRequired')}
          </label>
          <div>
            <Button onClick={submitCourse} disabled={courseSubmitting}>
              <Plus size={14} className="mr-1" />{courseSubmitting ? t('submitting') : t('submit')}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderCourse = (c: Course) => {
    const total = c.records.length
    const completed = c.records.filter(r => r.status === 'completed').length
    const assignedIds = new Set(c.records.map(r => r.user_id))
    const assignableUsers = allUsers.filter(u => !assignedIds.has(u.id))
    const rosterOpen = rosterCourseId === c.id
    const assignOpen = assignCourseId === c.id
    return (
      <Card key={c.id}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.title}</span>
                <Badge variant="outline" className="text-xs">{t(CATEGORY_KEYS[c.category])}</Badge>
                {c.is_required && (
                  <Badge className={`text-xs border ${REQUIRED_CLASS}`}>{t('requiredBadge')}</Badge>
                )}
              </div>
              {c.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words">{c.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs text-slate-400 tabular-nums">{t('hours')}: {Number(c.hours || 0)}</span>
                {c.material_url && materialLink(c.material_url)}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleAssignPanel(c.id)}>
                <UserPlus size={14} className="mr-1" />{t('assign')}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleEditCourse(c)}>
                <Pencil size={14} className="mr-1" />{t('editCourse')}
              </Button>
              <Button
                variant="ghost" size="sm"
                className="text-xs text-red-500 hover:text-red-600"
                onClick={() => removeCourse(c.id)}
              >
                <Trash2 size={14} className="mr-1" />{t('deleteCourse')}
              </Button>
            </div>
          </div>

          <button
            onClick={() => setRosterCourseId(prev => (prev === c.id ? null : c.id))}
            className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
          >
            {rosterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {t('progress')}: <span className="tabular-nums">{completed}/{total}</span>
          </button>

          {rosterOpen && (
            <div className="mt-2 border-t border-slate-100 dark:border-slate-800">
              {c.records.length === 0 && (
                <p className="text-xs text-slate-400 py-2">{t('noRecords')}</p>
              )}
              {c.records.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 py-1.5">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {r.user?.display_name ?? '—'}
                    </span>
                    <Badge className={`text-xs border ${STATUS_COLORS[r.status]}`}>{t(STATUS_KEYS[r.status])}</Badge>
                    {r.completed_at && (
                      <span className="text-xs text-slate-400">{t('completedAt')}: {r.completed_at.slice(0, 10)}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    className="text-xs text-red-500 hover:text-red-600 shrink-0"
                    onClick={() => unassignRecord(r.id)}
                  >
                    <UserMinus size={14} className="mr-1" />{t('unassign')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {assignOpen && (
            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <p className="text-xs text-slate-500">{t('assignTo')}</p>
              {assignableUsers.length === 0 && (
                <p className="text-xs text-slate-400">—</p>
              )}
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {assignableUsers.map(u => (
                  <label key={u.id} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignSelected.includes(u.id)}
                      onChange={e =>
                        setAssignSelected(prev =>
                          e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))
                      }
                    />
                    {userLabel(u)}
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                onClick={() => submitAssign(c.id)}
                disabled={assignSubmitting || !assignSelected.length}
              >
                <UserPlus size={14} className="mr-1" />{assignSubmitting ? t('submitting') : t('assign')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // --- 證照 ---

  const renderCertForm = () => {
    const set = (k: keyof CertForm) => (v: string) => setCertForm(prev => ({ ...prev, [k]: v }))
    return (
      <Card>
        <CardContent className="pt-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t(editingCertId ? 'editCert' : 'addCert')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isManager && !editingCertId && selectField(t('holder'), certForm.user_id, set('user_id'),
              allUsers.map(u => ({ value: u.id, label: userLabel(u) })))}
            {textField(t('certName'), certForm.name, set('name'), { required: true })}
            {textField(t('issuer'), certForm.issuer, set('issuer'))}
            {textField(t('certNo'), certForm.cert_no, set('cert_no'))}
            {textField(t('issuedDate'), certForm.issued_date, set('issued_date'), { type: 'date' })}
            {textField(t('expiryDate'), certForm.expiry_date, set('expiry_date'), { type: 'date' })}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('attachments')}</label>
            {filePicker(certFiles, setCertFiles, certUploading, setCertUploading)}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('note')}</label>
            <Textarea value={certForm.note} onChange={e => set('note')(e.target.value)} rows={2} />
          </div>
          <Button onClick={submitCert} disabled={certSubmitting || certUploading}>
            <Plus size={14} className="mr-1" />{certSubmitting ? t('submitting') : t('submit')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const renderCert = (c: Certification) => {
    const days = c.expiry_date ? daysUntil(c.expiry_date) : null
    const canEdit = isManager || c.user_id === userId
    return (
      <Card key={c.id}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
                {days === null && (
                  <Badge className={`text-xs border ${NEUTRAL_CLASS}`}>{t('noExpiry')}</Badge>
                )}
                {days !== null && days < 0 && (
                  <Badge className={`text-xs border ${OVERDUE_CLASS}`}>{t('overdue')}</Badge>
                )}
                {days !== null && days >= 0 && days <= 30 && (
                  <Badge className={`text-xs border ${DUE_SOON_CLASS}`}>{t('dueSoon')}</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {isManager && c.user?.display_name && (
                  <span className="text-xs text-slate-400">{t('holder')}: {c.user.display_name}</span>
                )}
                {c.issuer && (
                  <span className="text-xs text-slate-400">{t('issuer')}: {c.issuer}</span>
                )}
                {c.cert_no && (
                  <span className="text-xs text-slate-400">{t('certNo')}: {c.cert_no}</span>
                )}
                {c.issued_date && (
                  <span className="text-xs text-slate-400">{t('issuedDate')}: {c.issued_date}</span>
                )}
                {c.expiry_date && (
                  <span className="text-xs text-slate-400">{t('expiryDate')}: {c.expiry_date}</span>
                )}
                {attachmentLinks(c.attachment_paths)}
              </div>
              {c.note && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words">{c.note}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canEdit && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleEditCert(c)}>
                  <Pencil size={14} className="mr-1" />{t('editCert')}
                </Button>
              )}
              {isManager && (
                <Button
                  variant="ghost" size="sm"
                  className="text-xs text-red-500 hover:text-red-600"
                  onClick={() => removeCert(c.id)}
                >
                  <Trash2 size={14} className="mr-1" />{t('deleteCert')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // --- 到期提醒 ---

  const dueItems = dueCerts
    .filter(c => c.expiry_date)
    .sort((a, b) => (a.expiry_date ?? '').localeCompare(b.expiry_date ?? ''))

  const renderDueCert = (c: Certification) => {
    const days = daysUntil(c.expiry_date as string)
    return (
      <Card key={c.id}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
              {c.user?.display_name && (
                <span className="text-xs text-slate-400">{t('holder')}: {c.user.display_name}</span>
              )}
              <span className="text-xs text-slate-400">{t('expiryDate')}: {c.expiry_date}</span>
            </div>
            <Badge
              className={`text-xs border tabular-nums ${
                days < 0 ? OVERDUE_CLASS : days <= 30 ? DUE_SOON_CLASS : NEUTRAL_CLASS
              }`}
            >
              {days < 0 ? t('daysOverdue', { days: -days }) : t('daysLeft', { days })}
            </Badge>
          </div>
        </CardContent>
      </Card>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: t('tabMine') },
    ...(isManager ? [{ key: 'courses' as Tab, label: t('tabCourses') }] : []),
    { key: 'certs', label: t('tabCerts') },
    ...(isManager ? [{ key: 'due' as Tab, label: t('tabDue') }] : []),
  ]

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

      {/* 我的訓練 */}
      {tab === 'mine' && (
        <>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">{t('myHoursTotal')}</span>
              <span className="text-2xl font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                {myHours}
              </span>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {loading && <p className="text-sm text-slate-400">…</p>}
            {!loading && records.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">{t('noRecords')}</p>
            )}
            {!loading && records.map(renderRecord)}
          </div>
        </>
      )}

      {/* 課程管理 */}
      {tab === 'courses' && isManager && (
        <>
          <div>
            <Button size="sm" onClick={toggleCreateCourse}>
              <Plus size={14} className="mr-1" />{t('createCourse')}
            </Button>
          </div>
          {showCourseForm && renderCourseForm()}
          <div className="space-y-2">
            {loading && <p className="text-sm text-slate-400">…</p>}
            {!loading && courses.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">{t('noCourses')}</p>
            )}
            {!loading && courses.map(renderCourse)}
          </div>
        </>
      )}

      {/* 證照 */}
      {tab === 'certs' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={toggleCreateCert}>
              <Plus size={14} className="mr-1" />{t('addCert')}
            </Button>
            {isManager && (
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={certView === 'all'}
                  onChange={e => setCertView(e.target.checked ? 'all' : 'mine')}
                />
                {t('holder')}
              </label>
            )}
          </div>
          {showCertForm && renderCertForm()}
          <div className="space-y-2">
            {loading && <p className="text-sm text-slate-400">…</p>}
            {!loading && certs.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">{t('noCerts')}</p>
            )}
            {!loading && certs.map(renderCert)}
          </div>
        </>
      )}

      {/* 到期提醒 */}
      {tab === 'due' && isManager && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-slate-400">…</p>}
          {!loading && dueItems.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">{t('noDue')}</p>
          )}
          {!loading && dueItems.map(renderDueCert)}
        </div>
      )}
    </div>
  )
}
