'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  Plus, Trash2, Pencil, Paperclip, X, ChevronDown, ChevronRight,
  Users, Mail, Phone, Star, MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { taipeiToday } from '@/lib/taipei-date'

const OPENING_STATUSES = ['open', 'paused', 'closed'] as const
type OpeningStatus = typeof OPENING_STATUSES[number]
const STATUS_KEYS = {
  open: 'statusOpen', paused: 'statusPaused', closed: 'statusClosed',
} as const
const STATUS_COLORS: Record<OpeningStatus, string> = {
  open: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  paused: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  closed: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
}

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const
type CandidateStage = typeof STAGES[number]
const STAGE_KEYS = {
  applied: 'stageApplied', screening: 'stageScreening', interview: 'stageInterview',
  offer: 'stageOffer', hired: 'stageHired', rejected: 'stageRejected',
} as const
const STAGE_COLORS: Record<CandidateStage, string> = {
  applied: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  screening: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  interview: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300',
  offer: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300',
  hired: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
}

const SOURCES = ['referral', 'job_board', 'linkedin', 'agency', 'other'] as const
const SOURCE_KEYS = {
  referral: 'sourceReferral', job_board: 'sourceJobBoard', linkedin: 'sourceLinkedin',
  agency: 'sourceAgency', other: 'sourceOther',
} as const

const RESUME_ACCEPT = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png'

const selectCls = 'border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs text-slate-500 mb-1'

interface Opening {
  id: string
  title: string
  department_id: string | null
  description: string | null
  requirements: string | null
  headcount: number
  status: OpeningStatus
  candidates: { id: string; stage: CandidateStage }[]
}

interface InterviewNote {
  id: string
  interview_date: string
  rating: number | null
  feedback: string
  interviewer: { display_name: string | null } | null
}

interface Candidate {
  id: string
  opening_id: string
  name: string
  email: string | null
  phone: string | null
  source: string
  stage: CandidateStage
  resume_paths: string[]
  interview_notes: InterviewNote[]
}

interface Props {
  departments: { id: string; name: string }[]
}

export function RecruitingClient({ departments }: Props) {
  const t = useTranslations('recruiting')

  const [openings, setOpenings] = useState<Opening[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOpeningId, setExpandedOpeningId] = useState<string | null>(null)

  // Opening form
  const [showOpeningForm, setShowOpeningForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDept, setFormDept] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formReq, setFormReq] = useState('')
  const [formHeadcount, setFormHeadcount] = useState('1')
  const [formStatus, setFormStatus] = useState<OpeningStatus>('open')
  const [savingOpening, setSavingOpening] = useState(false)

  // Candidates (for expanded opening)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null)

  // Candidate form
  const [showCandidateForm, setShowCandidateForm] = useState(false)
  const [candName, setCandName] = useState('')
  const [candEmail, setCandEmail] = useState('')
  const [candPhone, setCandPhone] = useState('')
  const [candSource, setCandSource] = useState<string>('referral')
  const [resumes, setResumes] = useState<{ path: string; name: string }[]>([])
  const [uploadingResume, setUploadingResume] = useState(false)
  const [savingCandidate, setSavingCandidate] = useState(false)

  // Interview note form
  const [noteDate, setNoteDate] = useState(() => taipeiToday())
  const [noteRating, setNoteRating] = useState('')
  const [noteFeedback, setNoteFeedback] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const loadOpenings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/recruiting/openings')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setOpenings(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const load = async () => { await loadOpenings() }
    load()
  }, [loadOpenings])

  const loadCandidates = useCallback(async (openingId: string) => {
    setCandidatesLoading(true)
    try {
      const res = await fetch(`/api/admin/recruiting/candidates?opening_id=${openingId}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setCandidates(json.data ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setCandidatesLoading(false)
    }
  }, [t])

  const resetCandidateForm = () => {
    setCandName('')
    setCandEmail('')
    setCandPhone('')
    setCandSource('referral')
    setResumes([])
  }

  const resetNoteForm = () => {
    setNoteDate(taipeiToday())
    setNoteRating('')
    setNoteFeedback('')
  }

  const toggleOpening = (id: string) => {
    if (expandedOpeningId === id) {
      setExpandedOpeningId(null)
      return
    }
    setExpandedOpeningId(id)
    setExpandedCandidateId(null)
    setShowCandidateForm(false)
    resetCandidateForm()
    resetNoteForm()
    setCandidates([])
    loadCandidates(id)
  }

  // ---- Openings ----

  const openNewOpeningForm = () => {
    if (showOpeningForm && editingId === null) {
      setShowOpeningForm(false)
      return
    }
    setEditingId(null)
    setFormTitle('')
    setFormDept('')
    setFormDesc('')
    setFormReq('')
    setFormHeadcount('1')
    setFormStatus('open')
    setShowOpeningForm(true)
  }

  const startEditOpening = (o: Opening) => {
    setEditingId(o.id)
    setFormTitle(o.title)
    setFormDept(o.department_id ?? '')
    setFormDesc(o.description ?? '')
    setFormReq(o.requirements ?? '')
    setFormHeadcount(String(o.headcount))
    setFormStatus(o.status)
    setShowOpeningForm(true)
  }

  const submitOpening = async () => {
    const numHeadcount = Number(formHeadcount)
    if (!formTitle.trim() || !Number.isInteger(numHeadcount) || numHeadcount < 1) {
      toast.error(t('requiredFields'))
      return
    }
    setSavingOpening(true)
    try {
      const payload = {
        title: formTitle.trim(),
        department_id: formDept || null,
        description: formDesc.trim() || null,
        requirements: formReq.trim() || null,
        headcount: numHeadcount,
        status: formStatus,
      }
      const res = await fetch(
        editingId ? `/api/admin/recruiting/openings/${editingId}` : '/api/admin/recruiting/openings',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) throw new Error()
      toast.success(editingId ? t('openingSaved') : t('openingCreated'))
      setShowOpeningForm(false)
      setEditingId(null)
      await loadOpenings()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSavingOpening(false)
    }
  }

  const removeOpening = async (id: string) => {
    if (!confirm(t('deleteOpeningConfirm'))) return
    const res = await fetch(`/api/admin/recruiting/openings/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    toast.success(t('openingDeleted'))
    if (expandedOpeningId === id) setExpandedOpeningId(null)
    if (editingId === id) {
      setShowOpeningForm(false)
      setEditingId(null)
    }
    await loadOpenings()
  }

  // ---- Candidates ----

  const uploadResume = async (file: File) => {
    setUploadingResume(true)
    try {
      const presignedRes = await fetch('/api/storage/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'recruiting-files', filename: file.name }),
      })
      if (!presignedRes.ok) throw new Error()
      const { data: presigned } = await presignedRes.json()
      const uploadRes = await fetch(presigned.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) throw new Error()
      setResumes(prev => [...prev, { path: presigned.path, name: file.name }])
    } catch {
      toast.error(t('uploadFailed'))
    } finally {
      setUploadingResume(false)
    }
  }

  const submitCandidate = async (openingId: string) => {
    if (!candName.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setSavingCandidate(true)
    try {
      const res = await fetch('/api/admin/recruiting/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opening_id: openingId,
          name: candName.trim(),
          email: candEmail.trim() || null,
          phone: candPhone.trim() || null,
          source: candSource,
          resume_paths: resumes.map(r => r.path),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('candidateAdded'))
      resetCandidateForm()
      setShowCandidateForm(false)
      await Promise.all([loadCandidates(openingId), loadOpenings()])
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSavingCandidate(false)
    }
  }

  const changeStage = async (candidateId: string, stage: CandidateStage) => {
    const res = await fetch(`/api/admin/recruiting/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    setCandidates(prev => prev.map(c => (c.id === candidateId ? { ...c, stage } : c)))
    await loadOpenings()
  }

  const removeCandidate = async (candidateId: string) => {
    if (!confirm(t('deleteCandidateConfirm'))) return
    const res = await fetch(`/api/admin/recruiting/candidates/${candidateId}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('saveFailed'))
      return
    }
    toast.success(t('candidateDeleted'))
    if (expandedCandidateId === candidateId) setExpandedCandidateId(null)
    if (expandedOpeningId) await Promise.all([loadCandidates(expandedOpeningId), loadOpenings()])
  }

  const toggleCandidate = (id: string) => {
    if (expandedCandidateId === id) {
      setExpandedCandidateId(null)
      return
    }
    setExpandedCandidateId(id)
    resetNoteForm()
  }

  const submitNote = async (candidateId: string) => {
    if (!noteDate || !noteFeedback.trim()) {
      toast.error(t('requiredFields'))
      return
    }
    setSavingNote(true)
    try {
      const res = await fetch(`/api/admin/recruiting/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          add_note: {
            interview_date: noteDate,
            rating: noteRating ? Number(noteRating) : null,
            feedback: noteFeedback.trim(),
          },
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('interviewAdded'))
      resetNoteForm()
      if (expandedOpeningId) await loadCandidates(expandedOpeningId)
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSavingNote(false)
    }
  }

  // ---- Render helpers ----

  const deptName = (id: string | null) => departments.find(d => d.id === id)?.name ?? null

  const renderStars = (rating: number) => (
    <span className="inline-flex items-center gap-0.5" aria-label={`${t('rating')}: ${rating}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={12}
          className={i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300 dark:text-slate-600'}
        />
      ))}
    </span>
  )

  const renderCandidate = (c: Candidate) => (
    <div key={c.id} className="border border-slate-100 dark:border-slate-800 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
            <Badge className={`text-xs border ${STAGE_COLORS[c.stage]}`}>{t(STAGE_KEYS[c.stage])}</Badge>
            <Badge variant="outline" className="text-xs">
              {t(SOURCE_KEYS[c.source as keyof typeof SOURCE_KEYS] ?? 'sourceOther')}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {c.email && (
              <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                <Mail size={12} />{c.email}
              </span>
            )}
            {c.phone && (
              <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                <Phone size={12} />{c.phone}
              </span>
            )}
            {c.resume_paths.length > 0 && (
              <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                <Paperclip size={12} />{t('resume')}
                {c.resume_paths.map((p, i) => (
                  <a
                    key={p}
                    href={`/api/storage/download?bucket=recruiting-files&path=${encodeURIComponent(p)}`}
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
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <select
            aria-label={t('stage')}
            value={c.stage}
            onChange={e => changeStage(c.id, e.target.value as CandidateStage)}
            className={`${selectCls} text-xs py-1`}
          >
            {STAGES.map(s => (
              <option key={s} value={s}>{t(STAGE_KEYS[s])}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleCandidate(c.id)}
            className="text-xs text-slate-500 hover:text-blue-600"
          >
            <MessageSquare size={14} className="mr-1" />
            {t('interviews')} ({c.interview_notes.length})
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('deleteCandidateConfirm')}
            onClick={() => removeCandidate(c.id)}
            className="h-8 w-8 text-slate-400 hover:text-red-500"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {expandedCandidateId === c.id && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {c.interview_notes.map(n => (
            <div key={n.id} className="text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 tabular-nums">{n.interview_date}</span>
                <span className="text-slate-400">{t('interviewer')}: {n.interviewer?.display_name ?? '—'}</span>
                {n.rating !== null && renderStars(n.rating)}
              </div>
              <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap mt-0.5">{n.feedback}</p>
            </div>
          ))}

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">{t('addInterview')}</p>
            <div className="flex gap-2 flex-wrap">
              <div>
                <label htmlFor="note-date" className={labelCls}>
                  {t('interviewDate')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="note-date"
                  type="date"
                  value={noteDate}
                  onChange={e => setNoteDate(e.target.value)}
                  className={selectCls}
                />
              </div>
              <div>
                <label htmlFor="note-rating" className={labelCls}>{t('rating')}</label>
                <select
                  id="note-rating"
                  value={noteRating}
                  onChange={e => setNoteRating(e.target.value)}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="note-feedback" className={labelCls}>
                {t('feedback')} <span className="text-red-500">*</span>
              </label>
              <Textarea
                id="note-feedback"
                rows={2}
                value={noteFeedback}
                onChange={e => setNoteFeedback(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => submitNote(c.id)} disabled={savingNote}>
              <Plus size={14} className="mr-1" />
              {savingNote ? t('submitting') : t('submit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  const renderOpening = (o: Opening) => {
    const expanded = expandedOpeningId === o.id
    const stageCounts = STAGES
      .map(s => ({ stage: s, count: o.candidates.filter(c => c.stage === s).length }))
      .filter(x => x.count > 0)

    return (
      <Card key={o.id}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => toggleOpening(o.id)}
              className="flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {expanded
                  ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                  : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{o.title}</span>
                <Badge className={`text-xs border ${STATUS_COLORS[o.status]}`}>{t(STATUS_KEYS[o.status])}</Badge>
                {deptName(o.department_id) && (
                  <span className="text-xs text-slate-400">{deptName(o.department_id)}</span>
                )}
                <span className="text-xs text-slate-400 inline-flex items-center gap-1 tabular-nums">
                  <Users size={12} />{t('headcount')} {o.headcount}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs text-slate-400 tabular-nums">{t('candidates')}: {o.candidates.length}</span>
                {stageCounts.map(x => (
                  <Badge key={x.stage} className={`text-xs border ${STAGE_COLORS[x.stage]}`}>
                    {t(STAGE_KEYS[x.stage])} {x.count}
                  </Badge>
                ))}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('editOpening')}
                onClick={() => startEditOpening(o)}
                className="h-8 w-8 text-slate-400 hover:text-blue-500"
              >
                <Pencil size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('deleteOpening')}
                onClick={() => removeOpening(o.id)}
                className="h-8 w-8 text-slate-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              {o.description && (
                <p className="text-xs text-slate-500 whitespace-pre-wrap">{o.description}</p>
              )}
              {o.requirements && (
                <p className="text-xs text-slate-400 whitespace-pre-wrap">{o.requirements}</p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{t('candidates')}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCandidateForm(v => !v)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus size={14} className="mr-1" />{t('newCandidate')}
                </Button>
              </div>

              {showCandidateForm && (
                <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-3 space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    <div>
                      <label htmlFor="cand-name" className={labelCls}>
                        {t('candidateName')} <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="cand-name"
                        value={candName}
                        onChange={e => setCandName(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    <div>
                      <label htmlFor="cand-email" className={labelCls}>{t('email')}</label>
                      <Input
                        id="cand-email"
                        type="email"
                        value={candEmail}
                        onChange={e => setCandEmail(e.target.value)}
                        className="w-48"
                      />
                    </div>
                    <div>
                      <label htmlFor="cand-phone" className={labelCls}>{t('phone')}</label>
                      <Input
                        id="cand-phone"
                        value={candPhone}
                        onChange={e => setCandPhone(e.target.value)}
                        className="w-36"
                      />
                    </div>
                    <div>
                      <label htmlFor="cand-source" className={labelCls}>{t('source')}</label>
                      <select
                        id="cand-source"
                        value={candSource}
                        onChange={e => setCandSource(e.target.value)}
                        className={selectCls}
                      >
                        {SOURCES.map(s => (
                          <option key={s} value={s}>{t(SOURCE_KEYS[s])}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <span className={labelCls}>{t('resume')}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <Paperclip size={14} />
                        {uploadingResume ? t('submitting') : t('uploadResume')}
                        <input
                          type="file"
                          accept={RESUME_ACCEPT}
                          className="hidden"
                          disabled={uploadingResume}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) uploadResume(f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {resumes.map((r, i) => (
                        <span key={r.path} className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1">
                          #{i + 1} {r.name}
                          <button
                            onClick={() => setResumes(prev => prev.filter(x => x.path !== r.path))}
                            aria-label={t('candidateDeleted')}
                            className="text-slate-400 hover:text-red-500 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => submitCandidate(o.id)} disabled={savingCandidate || uploadingResume}>
                    <Plus size={14} className="mr-1" />
                    {savingCandidate ? t('submitting') : t('submit')}
                  </Button>
                </div>
              )}

              {candidatesLoading && <p className="text-sm text-slate-400">…</p>}
              {!candidatesLoading && candidates.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">{t('noCandidates')}</p>
              )}
              {!candidatesLoading && candidates.map(renderCandidate)}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNewOpeningForm}>
          <Plus size={14} className="mr-1" />{t('newOpening')}
        </Button>
      </div>

      {showOpeningForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {editingId ? t('editOpening') : t('newOpening')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="opening-title" className={labelCls}>
                  {t('openingTitle')} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="opening-title"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="opening-dept" className={labelCls}>{t('department')}</label>
                <select
                  id="opening-dept"
                  value={formDept}
                  onChange={e => setFormDept(e.target.value)}
                  className={`${selectCls} w-full`}
                >
                  <option value="">—</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="opening-desc" className={labelCls}>{t('jobDescription')}</label>
              <Textarea
                id="opening-desc"
                rows={3}
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="opening-req" className={labelCls}>{t('requirements')}</label>
              <Textarea
                id="opening-req"
                rows={3}
                value={formReq}
                onChange={e => setFormReq(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <div>
                <label htmlFor="opening-headcount" className={labelCls}>{t('headcount')}</label>
                <Input
                  id="opening-headcount"
                  type="number"
                  min="1"
                  value={formHeadcount}
                  onChange={e => setFormHeadcount(e.target.value)}
                  className="w-24 text-right tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="opening-status" className={labelCls}>{t('statusLabel')}</label>
                <select
                  id="opening-status"
                  value={formStatus}
                  onChange={e => setFormStatus(e.target.value as OpeningStatus)}
                  className={selectCls}
                >
                  {OPENING_STATUSES.map(s => (
                    <option key={s} value={s}>{t(STATUS_KEYS[s])}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={submitOpening} disabled={savingOpening}>
              <Plus size={14} className="mr-1" />
              {savingOpening ? t('submitting') : t('submit')}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-slate-400">…</p>}
      {!loading && openings.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">{t('noOpenings')}</p>
      )}
      {!loading && openings.map(renderOpening)}
    </div>
  )
}
