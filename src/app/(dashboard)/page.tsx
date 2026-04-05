import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { getTranslations } from 'next-intl/server'
import { Clock, CalendarDays, Timer, FileText, Megaphone, FileSignature, DollarSign } from 'lucide-react'

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

  const today = new Date().toISOString().split('T')[0]

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

  // My pending announcement confirmations
  const { data: pendingAnnouncements } = await supabase
    .from('document_recipients')
    .select('id')
    .eq('user_id', user.id)
    .eq('requires_confirmation', true)
    .is('confirmed_at', null)

  // Pending documents for approval
  const canApprove = currentUser?.role === 'admin' || currentUser?.granted_features?.includes('approve_contract')
  const { data: pendingDocs } = canApprove ? await service
    .from('documents')
    .select('id')
    .eq('status', 'pending')
    .is('deleted_at', null) : { data: [] }

  // Expiring contracts (30 days)
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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
    pendingAnnouncements: pendingAnnouncements?.length ?? 0,
    pendingDocs: pendingDocs?.length ?? 0,
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
              <div className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors min-h-[36px] flex items-center">
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
                {expiringContracts!.map((c: any) => (
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

      {/* Quick links */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">{t('goHandle')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { href: '/attendance', label: tNav('attendance'), icon: 'Clock' },
            { href: '/leave', label: tNav('leave'), icon: 'CalendarDays' },
            { href: '/overtime', label: tNav('overtime'), icon: 'Timer' },
            { href: '/documents', label: tNav('documents'), icon: 'FileText' },
            { href: '/announcements', label: tNav('announcements'), icon: 'Megaphone' },
            { href: '/contracts', label: tNav('contracts'), icon: 'FileSignature' },
            ...(currentUser?.role === 'admin' ? [{ href: '/payroll', label: tNav('payroll'), icon: 'DollarSign' }] : []),
          ].map(item => {
            const IconMap: Record<string, any> = { Clock, CalendarDays, Timer, FileText, Megaphone, FileSignature, DollarSign }
            const Icon = IconMap[item.icon]
            return (
              <Link key={item.href} href={item.href}>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors flex items-center gap-3 cursor-pointer active:scale-[0.97]">
                  {Icon && <Icon size={20} className="text-slate-400" aria-hidden="true" />}
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
