import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { getTranslations } from 'next-intl/server'
import { Megaphone, ChevronRight } from 'lucide-react'

interface AnnouncementSummary {
  id: string
  title: string
  announcement_category: string | null
  content_zh: string | null
  created_at: string
}

interface PendingAnnouncement {
  id: string
  document_id: string
  document: AnnouncementSummary | AnnouncementSummary[] | null
}

interface ExpiringContract {
  id: string
  title: string
  expires_at: string
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const service = await createServiceClient()
  const t = await getTranslations('dashboard')
  const tNav = await getTranslations('nav')
  const tAtt = await getTranslations('attendance')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role, display_name, granted_features, department_id')
    .eq('id', user.id)
    .single()

  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // Today attendance
  const { data: todayAttendance } = await supabase
    .from('attendance_records')
    .select('clock_in, clock_out, is_auto_in, is_auto_out')
    .eq('user_id', user.id)
    .eq('clock_date', today)
    .single()

  // Pending leave requests (as approver)
  const { data: pendingLeave } = await service
    .from('leave_requests')
    .select('id')
    .eq('approver_id', user.id)
    .eq('status', 'pending')

  // Pending OT requests (as approver)
  const { data: pendingOT } = await service
    .from('overtime_requests')
    .select('id')
    .eq('approver_id', user.id)
    .eq('status', 'pending')

  // My pending announcement confirmations (with document details)
  const { data: pendingAnnouncementsData } = await supabase
    .from('document_recipients')
    .select('id, document_id, document:documents(id, title, announcement_category, content_zh, created_at)')
    .eq('user_id', user.id)
    .eq('requires_confirmation', true)
    .is('confirmed_at', null)
    .order('created_at', { ascending: false })
    .limit(5)

  const pendingAnnouncements: PendingAnnouncement[] = pendingAnnouncementsData ?? []

  // Recent published announcements
  const { data: recentAnnouncements } = await service
    .from('documents')
    .select('id, title, announcement_category, content_zh, created_at')
    .eq('doc_type', 'ANN')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5)

  // Pending documents for approval
  const canApprove = currentUser?.role === 'admin' || currentUser?.granted_features?.includes('approve_contract')
  const { data: pendingDocs } = canApprove ? await service
    .from('documents')
    .select('id')
    .eq('status', 'pending')
    .is('deleted_at', null) : { data: [] }

  const isExpenseApprover = currentUser?.role === 'admin' || currentUser?.granted_features?.includes('expense_approve')
  const { data: pendingExpenses } = isExpenseApprover ? await service
    .from('expense_claims')
    .select('id')
    .eq('status', 'pending') : { data: [] }

  // Expiring contracts (30 days)
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const { data: expiringContracts } = await service
    .from('documents')
    .select('id, title, expires_at')
    .in('doc_type', ['NDA', 'MOU', 'CONTRACT', 'AMEND'])
    .eq('status', 'approved')
    .lte('expires_at', in30Days)
    .gte('expires_at', today)
    .is('deleted_at', null)
    .order('expires_at')
    .limit(5)

  const counts = {
    pendingLeave: pendingLeave?.length ?? 0,
    pendingOT: pendingOT?.length ?? 0,
    pendingAnnouncements: pendingAnnouncements.length,
    pendingDocs: pendingDocs?.length ?? 0,
    pendingExpenses: pendingExpenses?.length ?? 0,
  }
  const totalPending = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      {/* Welcome + today clock */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('welcome')}，{currentUser?.display_name}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{format(new Date(), 'yyyy-MM-dd')}</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-xs text-slate-400">{tAtt('clockIn')}</p>
              <p className={`font-mono font-bold ${todayAttendance?.clock_in ? 'text-green-600 dark:text-green-400' : 'text-slate-300'}`}>
                {todayAttendance?.clock_in ? format(new Date(todayAttendance.clock_in), 'HH:mm') : '—'}
                {todayAttendance?.is_auto_in && <span className="ml-1 text-xs font-normal text-amber-500">{tAtt('autoClocked')}</span>}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">{tAtt('clockOut')}</p>
              <p className={`font-mono font-bold ${todayAttendance?.clock_out ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300'}`}>
                {todayAttendance?.clock_out ? format(new Date(todayAttendance.clock_out), 'HH:mm') : '—'}
              </p>
            </div>
            <Link href="/attendance">
              <div className="px-3 py-2 rounded-lg bg-blue-600 text-gray-50 text-xs font-medium hover:bg-blue-700 transition-colors min-h-[36px] pointer-coarse:min-h-11 flex items-center">
                {tAtt('clockIn')}
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Pending items */}
      {totalPending > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">{t('todayTasks')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {counts.pendingAnnouncements > 0 && (
              <Link href="/announcements">
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 hover:border-amber-300 transition-colors">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{counts.pendingAnnouncements}</p>
                  <p className="text-sm text-amber-600 dark:text-amber-500 mt-0.5">{t('unconfirmedAnnouncements')}</p>
                </div>
              </Link>
            )}
            {counts.pendingLeave > 0 && (
              <Link href="/leave">
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 hover:border-blue-300 transition-colors">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{counts.pendingLeave}</p>
                  <p className="text-sm text-blue-600 dark:text-blue-500 mt-0.5">{t('pendingLeave')}</p>
                </div>
              </Link>
            )}
            {counts.pendingOT > 0 && (
              <Link href="/overtime">
                <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4 hover:border-purple-300 transition-colors">
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{counts.pendingOT}</p>
                  <p className="text-sm text-purple-600 dark:text-purple-500 mt-0.5">{t('pendingContracts')}</p>
                </div>
              </Link>
            )}
            {counts.pendingDocs > 0 && (
              <Link href="/documents">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 hover:border-slate-300 transition-colors">
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{counts.pendingDocs}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{t('pendingContracts')}</p>
                </div>
              </Link>
            )}
            {counts.pendingExpenses > 0 && (
              <Link href="/expenses">
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 hover:border-emerald-300 transition-colors">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{counts.pendingExpenses}</p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-0.5">{t('pendingExpenses')}</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Expiring contracts */}
      {(expiringContracts?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">{tNav('contracts')} — {t('pendingContracts')}</h3>
          <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-white dark:bg-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-orange-100 dark:divide-orange-900">
                {expiringContracts!.map((c: ExpiringContract) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <Link href={`/documents/${c.id}`} className="font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600">
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-orange-600 dark:text-orange-400 font-medium">
                      {c.expires_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Announcements */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-2">
            <Megaphone size={15} className="text-slate-400" aria-hidden="true" />
            {t('recentAnnouncements')}
          </h3>
          <Link href="/announcements" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            {t('viewAllAnnouncements')} <ChevronRight size={13} />
          </Link>
        </div>
        {pendingAnnouncements.length === 0 && (recentAnnouncements?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">{t('noAnnouncements')}</p>
        ) : (
          <div className="space-y-2">
            {pendingAnnouncements.map((item) => {
              const doc = Array.isArray(item.document) ? item.document[0] : item.document
              if (!doc) return null
              return (
                <Link key={item.id} href={`/documents/${doc.id}`}>
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 hover:border-amber-300 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-1">{doc.title}</p>
                      <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0 font-medium">{t('unconfirmedAnnouncements')}</span>
                    </div>
                    {doc.content_zh && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.content_zh}</p>}
                  </div>
                </Link>
              )
            })}
            {(recentAnnouncements ?? [])
              .filter((ann: AnnouncementSummary) => !pendingAnnouncements.some((p) => {
                const doc = Array.isArray(p.document) ? p.document[0] : p.document
                return doc?.id === ann.id
              }))
              .map((ann: AnnouncementSummary) => (
                <Link key={ann.id} href={`/documents/${ann.id}`}>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 hover:border-blue-300 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-1">{ann.title}</p>
                      <span className="text-xs text-slate-400 shrink-0">{format(new Date(ann.created_at), 'MM/dd')}</span>
                    </div>
                    {ann.content_zh && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ann.content_zh}</p>}
                  </div>
                </Link>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
