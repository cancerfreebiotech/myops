import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { VENDOR_SELECT, canReadVendors, canWriteVendors, pickVendorFields } from './fields'

// Vendor master (採購_廠商清冊)
// GET  /api/procurement/vendors?q=...  — list + search (procurement_unit / procurement_manage / admin)
// POST /api/procurement/vendors        — create (procurement_manage / admin only)

const SEARCH_COLUMNS = ['vendor_code', 'name', 'short_name', 'vendor_category', 'contact_person', 'phone']

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', user.id)
    .single()

  if (!canReadVendors(currentUser)) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  let query = service
    .from('vendors')
    .select(VENDOR_SELECT)
    .is('deleted_at', null)
    .order('vendor_code', { ascending: true, nullsFirst: false })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (q) {
    // strip characters that would break PostgREST or() syntax
    const safe = q.replace(/[,()%]/g, ' ').trim()
    if (safe) {
      query = query.or(SEARCH_COLUMNS.map(c => `${c}.ilike.%${safe}%`).join(','))
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, job_role, granted_features')
    .eq('id', user.id)
    .single()

  if (!canWriteVendors(currentUser)) {
    return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  const row = pickVendorFields(body)
  if (typeof row.name !== 'string' || !row.name.trim()) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  row.filled_by_id = row.filled_by_id ?? user.id
  row.created_by = user.id
  row.updated_by = user.id

  const { data, error } = await service
    .from('vendors')
    .insert(row)
    .select(VENDOR_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
