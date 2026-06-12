import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { DOC_TYPE_META, isDocType } from '@/lib/procurement/doc-types'
import { getProcurementAccess } from '../../helpers'

// Product stock ledger (商品出入庫分類帳)
// GET /api/procurement/products/[id]/ledger?year=YYYY
//   read: procurement_unit | procurement_manage | admin
//
// Returns, for one product (all quantities in 庫存單位 / stock unit):
//   - movements of the selected year in chronological order with a running balance
//     (joined with source document doc_no, lot/stock code and warehouse name)
//   - per-year summaries (inbound / outbound totals + year-end balance)
//   - current total quantity (ledger balance + products.current_stock_qty cache)
//   - lots currently in stock (lot_no / expiry / warehouse / qty)

type Params = { params: Promise<{ id: string }> }

interface MovementRow {
  id: string
  delta_qty: number | string
  movement_type: string
  doc_type: string | null
  doc_id: string | null
  warehouse_id: string | null
  warehouse_stock_id: string | null
  note: string | null
  created_at: string
}

const taipeiYearFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric' })

function taipeiYear(iso: string): number {
  return Number(taipeiYearFmt.format(new Date(iso)))
}

function toNum(value: number | string | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Fetch every movement of a product, oldest first (pages past PostgREST's row cap). */
async function fetchAllMovements(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  productId: string,
): Promise<MovementRow[]> {
  const PAGE = 1000
  const rows: MovementRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await service
      .from('stock_movements')
      .select('id, delta_qty, movement_type, doc_type, doc_id, warehouse_id, warehouse_stock_id, note, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as MovementRow[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export async function GET(request: NextRequest, { params }: Params) {
  const t = await getTranslations('apiErrors')
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { canRead } = await getProcurementAccess(supabase, user.id)
  if (!canRead) return NextResponse.json({ error: t('common.forbidden') }, { status: 403 })

  const yearParam = request.nextUrl.searchParams.get('year')
  let requestedYear: number | null = null
  if (yearParam != null && yearParam !== '') {
    requestedYear = Number(yearParam)
    if (!Number.isInteger(requestedYear) || requestedYear < 1970 || requestedYear > 9999) {
      return NextResponse.json({ error: t('common.invalidRequest') }, { status: 400 })
    }
  }

  const { data: product, error: productError } = await service
    .from('products')
    .select('id, product_code, name, spec, brand, category, item_code, purchase_unit, stock_unit, units_per_purchase, current_stock_qty')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (productError) {
    console.error('[procurement ledger] product error:', productError)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
  if (!product) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  try {
    const movements = await fetchAllMovements(service, id)

    // ── Running balance over the full history + per-year summaries ──
    let balance = 0
    const yearMap = new Map<number, { inbound_qty: number; outbound_qty: number; ending_balance: number; count: number }>()
    const withBalance = movements.map(m => {
      const delta = toNum(m.delta_qty)
      balance += delta
      const year = taipeiYear(m.created_at)
      const summary = yearMap.get(year) ?? { inbound_qty: 0, outbound_qty: 0, ending_balance: 0, count: 0 }
      if (delta >= 0) summary.inbound_qty += delta
      else summary.outbound_qty += -delta
      summary.ending_balance = balance
      summary.count += 1
      yearMap.set(year, summary)
      return { ...m, delta_qty: delta, balance, year }
    })

    const years = [...yearMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, s]) => ({ year, ...s }))

    const selectedYear = requestedYear ?? (years.length > 0 ? years[0].year : new Date().getFullYear())
    const yearMovements = withBalance.filter(m => m.year === selectedYear)

    // ── Joins for the selected year: doc_no, lot/stock code, warehouse name ──
    const docIdsByType = new Map<string, Set<string>>()
    for (const m of yearMovements) {
      if (m.doc_type && m.doc_id && isDocType(m.doc_type)) {
        const set = docIdsByType.get(m.doc_type) ?? new Set<string>()
        set.add(m.doc_id)
        docIdsByType.set(m.doc_type, set)
      }
    }
    const docNoById = new Map<string, string>()
    for (const [docType, ids] of docIdsByType) {
      const meta = DOC_TYPE_META[docType as keyof typeof DOC_TYPE_META]
      const { data: docs, error: docsError } = await service
        .from(meta.table)
        .select('id, doc_no')
        .in('id', [...ids])
      if (docsError) throw docsError
      for (const doc of docs ?? []) {
        if (doc.doc_no) docNoById.set(doc.id as string, doc.doc_no as string)
      }
    }

    const stockIds = [...new Set(yearMovements.map(m => m.warehouse_stock_id).filter((v): v is string => v != null))]
    const stockById = new Map<string, { lot_no: string | null; stock_code: string | null; warehouse_id: string | null }>()
    if (stockIds.length > 0) {
      const { data: stockRows, error: stockError } = await service
        .from('warehouse_stock')
        .select('id, lot_no, stock_code, warehouse_id')
        .in('id', stockIds)
      if (stockError) throw stockError
      for (const row of stockRows ?? []) {
        stockById.set(row.id as string, {
          lot_no: row.lot_no ?? null,
          stock_code: row.stock_code ?? null,
          warehouse_id: row.warehouse_id ?? null,
        })
      }
    }

    // ── Lots currently in stock ──
    const { data: lotRows, error: lotsError } = await service
      .from('warehouse_stock')
      .select('id, lot_no, stock_code, expiry_date, quantity, warehouse_id')
      .eq('product_id', id)
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
    if (lotsError) throw lotsError
    const lots = lotRows ?? []

    const warehouseIds = [...new Set([
      ...yearMovements.map(m => m.warehouse_id),
      ...[...stockById.values()].map(s => s.warehouse_id),
      ...lots.map(l => l.warehouse_id),
    ].filter((v): v is string => v != null))]
    const warehouseById = new Map<string, string>()
    if (warehouseIds.length > 0) {
      const { data: warehouses, error: whError } = await service
        .from('warehouses')
        .select('id, name')
        .in('id', warehouseIds)
      if (whError) throw whError
      for (const w of warehouses ?? []) warehouseById.set(w.id as string, w.name as string)
    }

    const data = {
      product: { ...product, units_per_purchase: toNum(product.units_per_purchase) },
      // Ledger balance is the source of truth; the products cache is returned for reference.
      current_qty: balance,
      cached_qty: toNum(product.current_stock_qty),
      year: selectedYear,
      years,
      movements: yearMovements.map(m => {
        const stock = m.warehouse_stock_id ? stockById.get(m.warehouse_stock_id) : undefined
        const warehouseId = m.warehouse_id ?? stock?.warehouse_id ?? null
        return {
          id: m.id,
          created_at: m.created_at,
          movement_type: m.movement_type,
          delta_qty: m.delta_qty,
          balance: m.balance,
          doc_type: m.doc_type,
          doc_id: m.doc_id,
          doc_no: (m.doc_id && docNoById.get(m.doc_id)) ?? null,
          lot_no: stock?.lot_no ?? null,
          stock_code: stock?.stock_code ?? null,
          warehouse_id: warehouseId,
          warehouse_name: warehouseId ? warehouseById.get(warehouseId) ?? null : null,
          note: m.note,
        }
      }),
      lots: lots.map(l => ({
        id: l.id,
        lot_no: l.lot_no ?? null,
        stock_code: l.stock_code ?? null,
        expiry_date: l.expiry_date ?? null,
        quantity: toNum(l.quantity),
        warehouse_id: l.warehouse_id ?? null,
        warehouse_name: l.warehouse_id ? warehouseById.get(l.warehouse_id) ?? null : null,
      })),
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[procurement ledger] error:', error)
    return NextResponse.json({ error: t('common.serverError') }, { status: 500 })
  }
}
