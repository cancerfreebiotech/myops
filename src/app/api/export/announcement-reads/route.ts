import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import * as XLSX from 'xlsx'

interface DepartmentJoin { name: string | null }
interface UserJoin {
  display_name: string | null
  email: string | null
  department: DepartmentJoin | DepartmentJoin[] | null
}
interface RecipientRow {
  user_id: string
  confirmed_at: string | null
  requires_confirmation: boolean | null
  user: UserJoin | UserJoin[] | null
}

// B5: Export an announcement's read-confirmation list as xlsx
// (name, email, department, status, confirmed-at). Unconfirmed recipients are
// included with an empty confirmed-at so the list also shows who has NOT read.
export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', user.id)
    .single()

  const isAdmin = currentUser?.role === 'admin'
  const canPublish = isAdmin || currentUser?.granted_features?.includes('publish_announcement')
  if (!canPublish) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  // Verify the target document exists and is an announcement/regulation.
  const { data: doc } = await service
    .from('documents')
    .select('id, title')
    .eq('id', id)
    .in('doc_type', ['ANN', 'REG'])
    .is('deleted_at', null)
    .single()

  if (!doc) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  // All recipients + their confirmation status. Unconfirmed first (nulls first).
  const { data } = await service
    .from('document_recipients')
    .select(`
      user_id,
      confirmed_at,
      requires_confirmation,
      user:users!document_recipients_user_id_fkey(display_name, email, department:departments(name))
    `)
    .eq('document_id', id)
    .order('confirmed_at', { ascending: true, nullsFirst: true })

  const rows = (data ?? []).map((r: RecipientRow) => {
    const u = Array.isArray(r.user) ? r.user[0] : r.user
    const dept = Array.isArray(u?.department) ? u.department[0] : u?.department
    const confirmed = r.confirmed_at != null
    // 與報表/催人的「未確認」定義一致：requires_confirmation=false 者標「無需確認」
    const status = !r.requires_confirmation ? '無需確認' : confirmed ? '已確認' : '未確認'
    return {
      '姓名': u?.display_name ?? '',
      'Email': u?.email ?? '',
      '部門': dept?.name ?? '',
      '狀態': status,
      '確認時間': r.confirmed_at
        ? new Date(r.confirmed_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
        : '',
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, '確認清單')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="announcement_reads_${id}.xlsx"`,
    },
  })
}
