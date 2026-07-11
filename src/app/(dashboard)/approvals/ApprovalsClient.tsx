'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Check, X, ExternalLink, RefreshCw, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface NamedUser { display_name: string | null }

interface ApprovalData {
  leave: { id: string; start_date: string; end_date: string; total_days: number; reason: string; user: NamedUser | null; leave_type: { name: string } | null }[]
  overtime: { id: string; ot_date: string; total_hours: number; reason: string; user: NamedUser | null }[]
  makeup: { id: string; clock_date: string; clock_type: string; clock_time: string; reason: string; user: NamedUser | null }[]
  trips: { id: string; destination: string; purpose: string; start_date: string; end_date: string; user: NamedUser | null }[]
  documents: { id: string; title: string; doc_type: string; created_at: string; uploader: NamedUser | null }[]
  payroll: { id: string; year: number; month: number; status: string; user: NamedUser | null }[]
  expenses: { id: string; expense_date: string; category: string; amount: number; currency: string; description: string; status: string; user: NamedUser | null }[]
}

interface ProcurementItem {
  doc_type: string
  doc_id: string
  doc_no: string
  applicant: { id: string; display_name: string | null } | null
  arrived_at: string
}

const EMPTY: ApprovalData = { leave: [], overtime: [], makeup: [], trips: [], documents: [], payroll: [], expenses: [] }

// 採購單據詳情頁路徑
const PROC_PATHS: Record<string, (id: string) => string> = {
  purchase_request: id => `/procurement/purchase-requests/${id}`,
  rfq: id => `/procurement/rfqs/${id}`,
  goods_receipt: id => `/procurement/goods-receipts/${id}`,
  deposit_request: id => `/procurement/payments/deposit/${id}`,
  ap_request: id => `/procurement/payments/ap/${id}`,
  installment_request: id => `/procurement/payments/installment/${id}`,
  vendor_evaluation: () => '/procurement/evaluations',
  product_evaluation: () => '/procurement/evaluations',
}

// 薪資狀態 → 下一步動作
const PAYROLL_NEXT_ACTION: Record<string, string> = {
  draft: 'hr_review',
  hr_reviewed: 'finance_confirm',
  finance_confirmed: 'coo_approve',
  coo_approved: 'pay',
}

export function ApprovalsClient() {
  const t = useTranslations('approvals')
  const [data, setData] = useState<ApprovalData>(EMPTY)
  const [procurement, setProcurement] = useState<ProcurementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [apprRes, procRes] = await Promise.all([
        fetch('/api/approvals'),
        fetch('/api/procurement/inbox'),
      ])
      if (!apprRes.ok) throw new Error()
      const appr = await apprRes.json()
      setData(appr.data ?? EMPTY)
      // 無採購權限者拿 403 → 視為空
      if (procRes.ok) {
        const proc = await procRes.json()
        setProcurement(proc.data ?? [])
      } else {
        setProcurement([])
      }
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const load = async () => { await loadAll() }
    load()
  }, [loadAll])

  const act = async (url: string, body: Record<string, unknown>, method = 'PATCH') => {
    if (acting) return  // 防重複點擊：動作進行中直接忽略
    setActing(true)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        toast.error(json?.code === 'MFA_REQUIRED' ? t('mfaRequired') : (json?.error ?? t('actionFailed')))
        return
      }
      toast.success(t('done'))
      await loadAll()
    } finally {
      setActing(false)
    }
  }

  const rejectWithReason = (fn: (reason: string) => void) => {
    const reason = prompt(t('rejectReason'))
    if (reason === null) return
    fn(reason)
  }

  const total =
    data.leave.length + data.overtime.length + data.makeup.length +
    data.trips.length +
    data.documents.length + data.payroll.length + data.expenses.length +
    procurement.length

  const Section = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => {
    if (count === 0) return null
    return (
      <div>
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2">
          {title}
          <Badge variant="outline" className="text-xs">{count}</Badge>
        </h3>
        <div className="space-y-2">{children}</div>
      </div>
    )
  }

  const Row = ({ main, sub, actions }: { main: React.ReactNode; sub: React.ReactNode; actions: React.ReactNode }) => (
    <Card>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{main}</div>
            <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">{actions}</div>
        </div>
      </CardContent>
    </Card>
  )

  const ApproveRejectButtons = ({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) => (
    <>
      <Button variant="ghost" size="sm" onClick={onApprove} disabled={acting} className="text-xs text-green-600 hover:text-green-700">
        <Check size={14} className="mr-1" />{t('approve')}
      </Button>
      <Button variant="ghost" size="sm" onClick={onReject} disabled={acting} className="text-xs text-red-500 hover:text-red-600">
        <X size={14} className="mr-1" />{t('reject')}
      </Button>
    </>
  )

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {loading ? '…' : total === 0 ? t('allClear') : t('pendingCount', { count: total })}
        </p>
        <Button variant="ghost" size="sm" onClick={loadAll} disabled={loading} className="text-xs">
          <RefreshCw size={13} className="mr-1" />{t('refresh')}
        </Button>
      </div>

      {!loading && total === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Inbox size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('allClear')}</p>
        </div>
      )}

      {/* 請假 */}
      <Section title={t('secLeave')} count={data.leave.length}>
        {data.leave.map(r => (
          <Row
            key={r.id}
            main={<>{r.user?.display_name} — {r.leave_type?.name} {r.total_days} {t('days')}</>}
            sub={<>{r.start_date} ~ {r.end_date}　{r.reason}</>}
            actions={<ApproveRejectButtons
              onApprove={() => act(`/api/leave/requests/${r.id}`, { action: 'approve' })}
              onReject={() => rejectWithReason(reason => act(`/api/leave/requests/${r.id}`, { action: 'reject', reject_reason: reason }))}
            />}
          />
        ))}
      </Section>

      {/* 加班 */}
      <Section title={t('secOvertime')} count={data.overtime.length}>
        {data.overtime.map(r => (
          <Row
            key={r.id}
            main={<>{r.user?.display_name} — {r.total_hours} {t('hours')}</>}
            sub={<>{r.ot_date}　{r.reason}</>}
            actions={<ApproveRejectButtons
              onApprove={() => act(`/api/overtime/requests/${r.id}`, { action: 'approve' })}
              onReject={() => rejectWithReason(reason => act(`/api/overtime/requests/${r.id}`, { action: 'reject', reject_reason: reason }))}
            />}
          />
        ))}
      </Section>

      {/* 補打卡 */}
      <Section title={t('secMakeup')} count={data.makeup.length}>
        {data.makeup.map(r => (
          <Row
            key={r.id}
            main={<>{r.user?.display_name} — {r.clock_type === 'in' ? t('clockIn') : t('clockOut')}</>}
            sub={<>{r.clock_date} {new Date(r.clock_time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' })}　{r.reason}</>}
            actions={<ApproveRejectButtons
              onApprove={() => act(`/api/attendance/makeup/${r.id}`, { action: 'approve' })}
              onReject={() => rejectWithReason(reason => act(`/api/attendance/makeup/${r.id}`, { action: 'reject', reject_reason: reason }))}
            />}
          />
        ))}
      </Section>

      {/* 出差 */}
      <Section title={t('secTrips')} count={data.trips.length}>
        {data.trips.map(r => (
          <Row
            key={r.id}
            main={<>{r.user?.display_name} — {r.destination}</>}
            sub={<>{r.start_date} ~ {r.end_date}　{r.purpose}</>}
            actions={<ApproveRejectButtons
              onApprove={() => act(`/api/business-trips/${r.id}`, { action: 'approve' })}
              onReject={() => rejectWithReason(reason => act(`/api/business-trips/${r.id}`, { action: 'reject', reject_reason: reason }))}
            />}
          />
        ))}
      </Section>

      {/* 報帳 */}
      <Section title={t('secExpenses')} count={data.expenses.length}>
        {data.expenses.map(r => (
          <Row
            key={r.id}
            main={<>{r.user?.display_name} — {r.currency === 'TWD' ? 'NT$' : r.currency}{Number(r.amount).toLocaleString()}</>}
            sub={<>{r.expense_date}　{r.description}</>}
            actions={r.status === 'pending' ? (
              <ApproveRejectButtons
                onApprove={() => act(`/api/expenses/${r.id}`, { action: 'approve' })}
                onReject={() => rejectWithReason(reason => act(`/api/expenses/${r.id}`, { action: 'reject', review_note: reason }))}
              />
            ) : (
              <Button variant="ghost" size="sm" disabled={acting} onClick={() => act(`/api/expenses/${r.id}`, { action: 'pay' })} className="text-xs text-blue-600 hover:text-blue-700">
                <Check size={14} className="mr-1" />{t('markPaid')}
              </Button>
            )}
          />
        ))}
      </Section>

      {/* 文件 / 合約 */}
      <Section title={t('secDocuments')} count={data.documents.length}>
        {data.documents.map(d => (
          <Row
            key={d.id}
            main={<>{d.title} <Badge variant="outline" className="text-xs ml-1">{d.doc_type}</Badge></>}
            sub={<>{d.uploader?.display_name}　{d.created_at.slice(0, 10)}</>}
            actions={
              <>
                <ApproveRejectButtons
                  onApprove={() => act(`/api/documents/${d.id}`, { status: 'approved', approved_at: new Date().toISOString(), _action: 'approve' })}
                  onReject={() => rejectWithReason(reason => act(`/api/documents/${d.id}`, { status: 'rejected', reject_reason: reason, _action: 'reject' }))}
                />
                <Link href={`/documents/${d.id}`} className="text-slate-400 hover:text-blue-500 p-1">
                  <ExternalLink size={14} />
                </Link>
              </>
            }
          />
        ))}
      </Section>

      {/* 薪資 */}
      <Section title={t('secPayroll')} count={data.payroll.length}>
        {data.payroll.map(p => (
          <Row
            key={p.id}
            main={<>{p.user?.display_name} — {p.year}/{String(p.month).padStart(2, '0')}</>}
            sub={t(`payrollStage_${p.status}`)}
            actions={
              <>
                <Button
                  variant="ghost" size="sm" disabled={acting}
                  onClick={() => act(`/api/payroll/${p.id}`, { action: PAYROLL_NEXT_ACTION[p.status] })}
                  className="text-xs text-green-600 hover:text-green-700"
                >
                  <Check size={14} className="mr-1" />{t('approve')}
                </Button>
                <Link href="/payroll" className="text-slate-400 hover:text-blue-500 p-1">
                  <ExternalLink size={14} />
                </Link>
              </>
            }
          />
        ))}
      </Section>

      {/* 採購 */}
      <Section title={t('secProcurement')} count={procurement.length}>
        {procurement.map(item => (
          <Row
            key={`${item.doc_type}-${item.doc_id}`}
            main={<>{item.doc_no}</>}
            sub={<>{item.applicant?.display_name}　{item.arrived_at.slice(0, 10)}</>}
            actions={
              <>
                <ApproveRejectButtons
                  onApprove={() => act(`/api/procurement/approvals/${item.doc_type}/${item.doc_id}`, { action: 'approve' })}
                  onReject={() => rejectWithReason(reason => act(`/api/procurement/approvals/${item.doc_type}/${item.doc_id}`, { action: 'reject', comment: reason }))}
                />
                <Link
                  href={PROC_PATHS[item.doc_type]?.(item.doc_id) ?? '/procurement'}
                  className="text-slate-400 hover:text-blue-500 p-1"
                >
                  <ExternalLink size={14} />
                </Link>
              </>
            }
          />
        ))}
      </Section>
    </div>
  )
}
