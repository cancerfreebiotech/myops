import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { requireInventoryUser } from '../inbound/helpers'

// 掃碼查詢 — resolve a scanned/typed code to a product + its existing lots.
// GET /api/procurement/stock-lookup?code=...
// Match order: products.item_code (貨號 barcode) → warehouse_stock.stock_code
// (庫存編號) → warehouse_stock.lot_no (批號). Once a product is identified,
// all of its current warehouse_stock lot rows are returned.
// 200 → { data: { matched_by, product, stocks } } | 404 when nothing matches.

const PRODUCT_SELECT =
  'id, product_code, name, spec, item_code, purchase_unit, stock_unit, units_per_purchase, current_stock_qty'

const STOCK_SELECT =
  'id, stock_code, lot_no, expiry_date, quantity, unit, warehouse_id, product_id, ' +
  'warehouse:warehouses(id, code, name)'

type MatchedBy = 'item_code' | 'stock_code' | 'lot_no'

export async function GET(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const ti = await getTranslations('procurement.inventory')
  const auth = await requireInventoryUser()
  if (auth.status === 'unauthorized') return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const code = request.nextUrl.searchParams.get('code')?.trim()
  if (!code) return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })

  const service = await createServiceClient()

  // 1) product barcode (貨號)
  let matchedBy: MatchedBy | null = null
  let productId: string | null = null

  const { data: byItemCode, error: productError } = await service
    .from('products')
    .select('id')
    .eq('item_code', code)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (productError) {
    console.error('[procurement stock-lookup] product lookup failed:', productError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  if (byItemCode) {
    matchedBy = 'item_code'
    productId = byItemCode.id
  }

  // 2) 庫存編號, 3) 批號
  if (!productId) {
    for (const column of ['stock_code', 'lot_no'] as const) {
      const { data: stockHit, error: stockError } = await service
        .from('warehouse_stock')
        .select('id, product_id')
        .eq(column, code)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (stockError) {
        console.error('[procurement stock-lookup] stock lookup failed:', stockError)
        return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
      }
      if (stockHit) {
        matchedBy = column
        productId = stockHit.product_id
        break
      }
    }
  }

  if (!productId || !matchedBy) {
    return NextResponse.json({ error: ti('errors.codeNotFound') }, { status: 404 })
  }

  const [{ data: product }, { data: stocks, error: stocksError }] = await Promise.all([
    service.from('products').select(PRODUCT_SELECT).eq('id', productId).maybeSingle(),
    service
      .from('warehouse_stock')
      .select(STOCK_SELECT)
      .eq('product_id', productId)
      .order('created_at', { ascending: true }),
  ])

  if (stocksError) {
    console.error('[procurement stock-lookup] stocks load failed:', stocksError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      matched_by: matchedBy,
      product: product ?? null,
      stocks: stocks ?? [],
    },
  })
}
