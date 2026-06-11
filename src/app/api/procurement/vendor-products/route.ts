import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getProcurementAccess } from '../products/helpers'

// Vendor product quotes (採購_商品廠商價格) — read-only lookup
// GET /api/procurement/vendor-products?product_id=...   quotes for a product
// GET /api/procurement/vendor-products?vendor_id=...    quotes from a vendor
// read: procurement_unit | procurement_manage | admin
// (rows are written by the product_evaluation post-approval hook, not directly)

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canRead } = await getProcurementAccess(supabase, user.id)
  if (!canRead) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const productId = request.nextUrl.searchParams.get('product_id')
  const vendorId = request.nextUrl.searchParams.get('vendor_id')
  if (!productId && !vendorId) {
    return NextResponse.json({ error: t('common.missingFields') }, { status: 400 })
  }

  let query = service
    .from('vendor_products')
    .select(`
      *,
      product:products(id, name, product_code),
      vendor:vendors(id, name, vendor_code)
    `)
    .is('deleted_at', null)
    .order('quote_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (productId) query = query.eq('product_id', productId)
  if (vendorId) query = query.eq('vendor_id', vendorId)

  const { data, error } = await query
  if (error) {
    console.error('[procurement vendor-products] list error:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({ data })
}
