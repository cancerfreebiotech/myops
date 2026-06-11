import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { VENDOR_SELECT, canReadVendors, canWriteVendors, pickVendorFields } from '../fields'

// Vendor master detail (採購_廠商清冊)
// GET /api/procurement/vendors/[id] — read (procurement_unit / procurement_manage / admin)
// PUT /api/procurement/vendors/[id] — update (procurement_manage / admin only)

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
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

  const { data, error } = await service
    .from('vendors')
    .select(VENDOR_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
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

  const { data: existing } = await service
    .from('vendors')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const updates = pickVendorFields(body)
  if ('name' in updates && (typeof updates.name !== 'string' || !updates.name.trim())) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
  }

  updates.updated_by = user.id
  updates.updated_at = new Date().toISOString()

  const { data, error } = await service
    .from('vendors')
    .update(updates)
    .eq('id', id)
    .select(VENDOR_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
