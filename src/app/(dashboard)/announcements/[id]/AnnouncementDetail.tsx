'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  User,
  Calendar,
  ChevronLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: React.ElementType }
> = {
  hr: {
    label: '人事公告',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-700',
    icon: User,
  },
  admin: {
    label: '行政公告',
    bg: 'bg-slate-100 dark:bg-slate-700/40',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-600',
    icon: FileText,
  },
  regulation: {
    label: '法規/規章',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-700',
    icon: FileText,
  },
  urgent: {
    label: '緊急通知',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-800 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-700',
    icon: AlertTriangle,
  },
}

const DOC_TYPE_LABELS: Record<string, string> = {
  ANN: '公告',
  REG: '規章',
}

const ACTION_LABELS: Record<string, string> = {
  upload: '上傳',
  approve: '核准',
  reject: '退回',
  archive: '封存',
  publish: '發佈',
  translate: 'AI 翻譯',
  confirm: '確認閱讀',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  doc: any
  auditLogs: any[]
  currentUser: any
  isRecipient: boolean
  alreadyConfirmed: boolean
  confirmedAt: string | null
  userLang: string
}

// ─── Content language resolution ──────────────────────────────────────────────

function resolveContent(
  doc: any,
  userLang: string
): { content: string; lang: string; isFallback: boolean } {
  const langMap: Record<string, string | undefined> = {
    zh: doc.content_zh,
    en: doc.content_en,
    ja: doc.content_ja,
  }

  // Normalize locale codes: zh-TW → zh
  const normalizedLang = userLang.startsWith('zh') ? 'zh' : userLang
  const preferred = langMap[normalizedLang]
  if (preferred) return { content: preferred, lang: userLang, isFallback: false }

  // Fallback chain: zh → en → ja
  for (const [lang, content] of [
    ['zh', doc.content_zh],
    ['en', doc.content_en],
    ['ja', doc.content_ja],
  ] as [string, string | undefined][]) {
    if (content) return { content, lang, isFallback: true }
  }

  return { content: '', lang: 'zh', isFallback: false }
}

const LANG_LABELS: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語' }

// ─── Component ────────────────────────────────────────────────────────────────

export function AnnouncementDetail({
  doc,
  auditLogs,
  currentUser,
  isRecipient,
  alreadyConfirmed,
  confirmedAt,
  userLang,
}: Props) {
  const router = useRouter()
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(alreadyConfirmed)
  const [localConfirmedAt, setLocalConfirmedAt] = useState<string | null>(confirmedAt)

  const category = doc.announcement_category as string | undefined
  const catConfig = category ? CATEGORY_CONFIG[category] : undefined
  const isUrgent = category === 'urgent'

  const { content, lang, isFallback } = resolveContent(doc, userLang)

  // Additional language tabs
  const availableLangs = (['zh', 'en', 'ja'] as const).filter(
    (l) => doc[`content_${l}`]
  )
  const [activeLang, setActiveLang] = useState<string>(lang)

  const displayContent =
    (doc[`content_${activeLang}`] as string | undefined) ?? content

  // ── Confirm read handler ───────────────────────────────────────────────────

  const handleConfirmRead = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}/confirm`, {
        method: 'POST',
      })
      const json = await res.json()

      if (json.code === 'MFA_REQUIRED') {
        setConfirmDialogOpen(false)
        router.push('/mfa/verify')
        return
      }

      if (json.error) {
        toast.error(json.error)
        return
      }

      const now = new Date().toISOString()
      setConfirmed(true)
      setLocalConfirmedAt(now)
      setConfirmDialogOpen(false)
      toast.success('已確認已讀')
    } catch {
      toast.error('操作失敗，請重試')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Main content column ── */}
      <div className="lg:col-span-2 space-y-5">
        {/* Back link */}
        <button
          onClick={() => router.push('/announcements')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors duration-150 cursor-pointer"
          aria-label="返回公告列表"
        >
          <ChevronLeft size={16} />
          返回公告列表
        </button>

        {/* Header card */}
        <div
          className={`rounded-lg border bg-white dark:bg-slate-800 p-5 space-y-4 ${
            isUrgent
              ? 'border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/10'
              : 'border-slate-200 dark:border-slate-700'
          }`}
        >
          {/* Category badge + doc type */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                catConfig
                  ? `${catConfig.bg} ${catConfig.text} ${catConfig.border}`
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {catConfig && <catConfig.icon size={11} aria-hidden />}
              {catConfig?.label ?? category ?? '公告'}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 font-[Lexend] leading-snug">
            {doc.title}
          </h2>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">發佈者</p>
              <p className="text-slate-700 dark:text-slate-300">
                {doc.uploaded_by_user?.display_name ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">發佈日期</p>
              <p className="text-slate-700 dark:text-slate-300">
                {format(new Date(doc.created_at), 'yyyy-MM-dd')}
              </p>
            </div>
            {doc.department && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">所屬部門</p>
                <p className="text-slate-700 dark:text-slate-300">{doc.department.name}</p>
              </div>
            )}
            {doc.expires_at && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">到期日</p>
                <p className="text-slate-700 dark:text-slate-300">{doc.expires_at}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content card */}
        {displayContent ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
            {/* Language tabs */}
            {availableLangs.length > 1 && (
              <div className="flex gap-1 border-b border-slate-100 dark:border-slate-700 pb-1">
                {availableLangs.map((l) => (
                  <button
                    key={l}
                    onClick={() => setActiveLang(l)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors duration-150 cursor-pointer ${
                      activeLang === l
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                    aria-pressed={activeLang === l}
                  >
                    {LANG_LABELS[l]}
                    {doc.ai_translated && l !== 'zh' && (
                      <span className="ml-1 text-blue-400 dark:text-blue-500">(AI)</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Fallback notice */}
            {isFallback && activeLang !== userLang && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                目前語言版本不可用，顯示原文內容。
              </p>
            )}

            {/* Content body */}
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-[0.9375rem]">
              {displayContent}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center">
            <FileText size={32} className="text-slate-300 mx-auto mb-2" aria-hidden />
            <p className="text-slate-400 text-sm">此公告無文字內容</p>
          </div>
        )}
      </div>

      {/* ── Sidebar column ── */}
      <div className="space-y-4">
        {/* Confirmation status / action */}
        {isRecipient && (
          <div
            className={`rounded-lg border p-4 ${
              confirmed
                ? 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            }`}
          >
            {confirmed ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <CheckCircle
                  size={28}
                  className="text-green-500 dark:text-green-400"
                  aria-hidden
                />
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  已確認已讀
                </p>
                {localConfirmedAt && (
                  <p className="text-xs text-slate-400">
                    {format(new Date(localConfirmedAt), 'yyyy-MM-dd HH:mm')}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
                  請確認您已閱讀此公告
                </p>
                <Button
                  onClick={() => setConfirmDialogOpen(true)}
                  className="w-full min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-violet-600 active:scale-[0.97]"
                  aria-label="確認已讀此公告（需雙重驗證）"
                >
                  <CheckCircle size={16} className="mr-1.5" aria-hidden />
                  確認已讀
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Announcement meta summary */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Calendar size={14} aria-hidden />
            公告資訊
          </h3>
          <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex justify-between">
              <span>類型</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
              </span>
            </div>
            <div className="flex justify-between">
              <span>狀態</span>
              <span
                className={`font-medium ${
                  doc.status === 'approved'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {doc.status === 'approved' ? '已發佈' : doc.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span>AI 翻譯</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {doc.ai_translated ? '是' : '否'}
              </span>
            </div>
            {availableLangs.length > 0 && (
              <div className="flex justify-between">
                <span>語言版本</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {availableLangs.map((l) => LANG_LABELS[l]).join(' / ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Audit log */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
            <Clock size={14} aria-hidden />
            操作記錄
          </h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400">無記錄</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    <span className="text-slate-400 shrink-0">
                      {format(new Date(log.created_at), 'MM-dd HH:mm')}
                    </span>
                  </div>
                  <p className="text-slate-400 mt-0.5">
                    {log.user?.display_name ?? '—'}
                  </p>
                  {log.detail?.reason && (
                    <p className="text-red-500 mt-0.5">原因：{log.detail.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm read dialog ── */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-[Lexend]">
              <CheckCircle size={20} className="text-violet-600" aria-hidden />
              確認已讀
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              確認您已閱讀此公告？此操作需要雙重驗證。
            </p>
            <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 p-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {doc.title}
              </p>
              {catConfig && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border mt-1.5 ${catConfig.bg} ${catConfig.text} ${catConfig.border}`}
                >
                  <catConfig.icon size={10} aria-hidden />
                  {catConfig.label}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              若尚未完成雙重驗證，系統將引導您完成驗證後再提交確認。
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={loading}
              className="min-h-[44px] transition-colors duration-150 cursor-pointer"
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmRead}
              disabled={loading}
              className="min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-violet-600 active:scale-[0.97]"
              aria-label="確認已讀並送出"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  驗證中...
                </span>
              ) : (
                <>
                  <CheckCircle size={16} className="mr-1.5" aria-hidden />
                  確認已讀
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
