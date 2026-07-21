// Server-only: document conversion (轉單) for the six procurement chains.
//
// convertDoc(fromType, fromId, toType, userId) creates a *draft* target
// document from an approved source document: copies the mapped columns, sets
// the single-direction FK (e.g. purchase_requests.rfq_id), runs post-process
// steps (deposit auto-fill, inbound item building with purchase→stock unit
// conversion, vendor bank info completion, installment numbering) and bumps
// the source-side counters (pr_count, gr_count, deposit_request_count).
//
// The source must be status='approved' (簽核完成). For the RFQ chain that is
// the same single notification step finishing, per spec §三-1.

import { createServiceClient, procurementWriteClient } from '@/lib/supabase/server'
import { DOC_TYPE_META, type DocType } from './doc-types'

export type ConversionKey =
  | 'rfq_to_pr'
  | 'pr_to_gr'
  | 'pr_to_dep'
  | 'gr_to_inb'
  | 'gr_to_ap'
  | 'ap_to_ins'

/** Extra server-side steps that run around the plain column copy */
export type ConversionPostProcess =
  /** PR→GR: look up approved deposit_requests of the source PR and fill has_deposit / deposit_doc_no / deposit_paid_amount */
  | 'autofillDeposit'
  /** GR→INB: build inbound_items from pr_items of gr.pr_id, converting purchase units → stock units via products.units_per_purchase */
  | 'buildInboundItems'
  /** pr_to_dep / gr_to_ap: complete vendor bank/payment columns from the vendors master */
  | 'fillVendorBankInfo'
  /** AP→INS: assign the next installment_no among the AP's non-voided installments */
  | 'assignInstallmentNo'

export interface ConversionDef {
  source: DocType
  target: DocType
  /** Target column holding the source document's id (single-direction FK, e.g. purchase_requests.rfq_id) */
  fkField: string
  /** target column ← source column (verbatim copy) */
  fieldMap: Record<string, string>
  /** Source column counting created targets (incremented after a successful conversion) */
  counterField?: string
  /**
   * 1:1 conversion: a source may have at most one *non-voided* target. Blocks
   * re-converting the same source into a duplicate downstream document (e.g. a
   * second inbound that double-counts stock, or a second AP that double-bills).
   * A voided target is ignored so a mistaken conversion can be redone.
   */
  dedupeTarget?: boolean
  postProcess?: ConversionPostProcess[]
}

export const CONVERSIONS: Record<ConversionKey, ConversionDef> = {
  // 詢價單 → 請採購單 (轉採購單)
  rfq_to_pr: {
    source: 'rfq',
    target: 'purchase_request',
    fkField: 'rfq_id',
    fieldMap: {
      requesting_department: 'requesting_department',
      urgency: 'urgency',
      // RFQ 預計到貨日 becomes the PR 請購期望日
      request_expected_date: 'expected_delivery_date',
      notes: 'notes',
    },
    counterField: 'pr_count',
  },

  // 請採購單 → 進貨驗收單 (轉進貨單)
  // GR has no own line-item table: receiving lines are read from pr_items via gr.pr_id.
  pr_to_gr: {
    source: 'purchase_request',
    target: 'goods_receipt',
    fkField: 'pr_id',
    fieldMap: {
      requesting_department: 'requesting_department',
      vendor_id: 'vendor_id',
      vendor_code: 'vendor_code',
      vendor_name: 'vendor_name',
      tax_id: 'tax_id',
      contact_person: 'contact_person',
      phone: 'phone',
      fax: 'fax',
      email: 'email',
      tax_type: 'tax_type',
      tax_rate: 'tax_rate',
      tax_amount: 'tax_amount',
      subtotal: 'subtotal',
      shipping_fee: 'shipping_fee',
      total_amount: 'total_amount',
    },
    counterField: 'gr_count',
    // 訂金自動帶入 (決策 11)
    postProcess: ['autofillDeposit'],
  },

  // 請採購單 → 訂金請款單 (訂金請款)
  pr_to_dep: {
    source: 'purchase_request',
    target: 'deposit_request',
    fkField: 'pr_id',
    fieldMap: {
      vendor_id: 'vendor_id',
      vendor_code: 'vendor_code',
      vendor_name: 'vendor_name',
      total_amount: 'total_amount',
    },
    counterField: 'deposit_request_count',
    postProcess: ['fillVendorBankInfo'],
  },

  // 進貨驗收單 → 入庫單 (轉入庫單; is_new_lot decided per line at posting time)
  gr_to_inb: {
    source: 'goods_receipt',
    target: 'inbound_order',
    fkField: 'gr_id',
    fieldMap: {
      notes: 'notes',
    },
    // 擱置：一張 GR 對多張入庫單可能是合理的分批入庫，待確認採購規則後再決定是否防重（2026-07-11 Luna）
    postProcess: ['buildInboundItems'],
  },

  // 進貨驗收單 → 採購請款單 (請款)
  gr_to_ap: {
    source: 'goods_receipt',
    target: 'ap_request',
    fkField: 'gr_id',
    fieldMap: {
      vendor_id: 'vendor_id',
      vendor_code: 'vendor_code',
      vendor_name: 'vendor_name',
      tax_id: 'tax_id',
      ap_total_amount: 'total_amount',
      total_amount: 'total_amount',
    },
    // 一張進貨驗收單只能請款一次：防止重複轉採購請款單 → 重複付款
    dedupeTarget: true,
    postProcess: ['fillVendorBankInfo'],
  },

  // 採購請款單 → 分期請款單 (建立分期請款)
  ap_to_ins: {
    source: 'ap_request',
    target: 'installment_request',
    fkField: 'ap_id',
    fieldMap: {
      billing_month: 'billing_month',
    },
    postProcess: ['assignInstallmentNo'],
  },
}

export type ConversionErrorCode =
  | 'invalidConversion'
  | 'docNotFound'
  | 'sourceNotApproved'
  | 'alreadyConverted'

export class ConversionError extends Error {
  constructor(public code: ConversionErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ConversionError'
  }
}

export interface ConvertResult {
  /** id of the newly created draft target document */
  newId: string
  /** auto-assigned doc_no of the target (PREFIX-YYMM-NNN) */
  docNo: string
  toType: DocType
}

type Service = Awaited<ReturnType<typeof createServiceClient>>
type Row = Record<string, unknown>

/** Vendor master columns copied per target table by fillVendorBankInfo (target column ← vendors column) */
const VENDOR_INFO_BY_TARGET: Partial<Record<DocType, Record<string, string>>> = {
  deposit_request: {
    vendor_short_name: 'short_name',
    closing_day: 'closing_day',
    bank_name: 'bank_name',
    bank_branch: 'bank_branch',
    bank_swift_code: 'bank_swift_code',
    bank_account_no: 'bank_account_no',
    bank_account_name: 'bank_account_name',
  },
  ap_request: {
    country: 'country',
    payment_method: 'payment_method',
    payment_terms: 'payment_terms',
    closing_day: 'closing_day',
    bank_name: 'bank_name',
    bank_branch: 'bank_branch',
    bank_swift_code: 'bank_swift_code',
    bank_account_no: 'bank_account_no',
    bank_account_name: 'bank_account_name',
  },
}

function findConversion(fromType: DocType, toType: DocType): ConversionDef | null {
  for (const def of Object.values(CONVERSIONS)) {
    if (def.source === fromType && def.target === toType) return def
  }
  return null
}

/** PR→GR: fill 是否已付訂金/已付訂金單號/已付訂金 from the PR's approved deposit_requests */
async function autofillDeposit(service: Service, prId: string, payload: Row): Promise<void> {
  const { data } = await service
    .from('deposit_requests')
    .select('doc_no, deposit_amount')
    .eq('pr_id', prId)
    .eq('status', 'approved')
  const deposits = (data as { doc_no: string; deposit_amount: number | null }[] | null) ?? []
  if (deposits.length === 0) return
  payload.has_deposit = true
  payload.deposit_doc_no = deposits.map(d => d.doc_no).join(', ')
  payload.deposit_paid_amount = deposits.reduce((sum, d) => sum + (Number(d.deposit_amount) || 0), 0)
}

/** pr_to_dep / gr_to_ap: complete bank/payment columns from the vendors master */
async function fillVendorBankInfo(service: Service, target: DocType, payload: Row): Promise<void> {
  const map = VENDOR_INFO_BY_TARGET[target]
  if (!map || !payload.vendor_id) return
  const { data: vendor } = await service.from('vendors').select('*').eq('id', payload.vendor_id).maybeSingle()
  if (!vendor) return
  const v = vendor as Row
  for (const [targetCol, vendorCol] of Object.entries(map)) {
    if (payload[targetCol] == null) payload[targetCol] = v[vendorCol] ?? null
  }
}

/** AP→INS: next installment_no among the AP's non-voided installment requests */
async function assignInstallmentNo(service: Service, apId: string, payload: Row): Promise<void> {
  const { count } = await service
    .from('installment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('ap_id', apId)
    .neq('status', 'voided')
  payload.installment_no = (count ?? 0) + 1
}

/**
 * GR→INB: scaffold inbound_items from the upstream PR's pr_items,
 * converting purchase-unit quantities into stock units
 * (qty × products.units_per_purchase). lot_no / expiry / warehouse are left
 * for the user (lot existence decides 增加 vs 新增 at posting time).
 */
// Returns the inbound_items rows WITHOUT inbound_order_id (the RPC injects the FK
// when it inserts them atomically with the parent inbound_order).
async function buildInboundItemRows(service: Service, gr: Row): Promise<Row[]> {
  if (!gr.pr_id) return []
  const { data: itemsData } = await service
    .from('pr_items')
    .select('*')
    .eq('pr_id', gr.pr_id)
    .order('line_no', { ascending: true, nullsFirst: false })
  const prItems = (itemsData as Row[] | null) ?? []
  if (prItems.length === 0) return []

  const productIds = [...new Set(prItems.map(i => i.product_id).filter((v): v is string => typeof v === 'string'))]
  const productById = new Map<string, Row>()
  if (productIds.length > 0) {
    const { data: products } = await service
      .from('products')
      .select('id, product_code, name, spec, stock_unit, units_per_purchase')
      .in('id', productIds)
    for (const p of (products as Row[] | null) ?? []) productById.set(p.id as string, p)
  }

  return prItems
    .map((item, index) => {
      const product = item.product_id ? productById.get(item.product_id as string) : undefined
      const ratio = Number(product?.units_per_purchase ?? 1) || 1
      const purchaseQty = Number(item.quantity ?? 0) || 0
      const receivedQty = Number(item.received_qty ?? 0) || 0
      // 尚未進貨量 (採購單位): explicit pending_qty when present, else quantity − received.
      // Capped ≥ 0 so an over-received line never brings a negative/full quantity again.
      const pendingRaw = item.pending_qty != null ? Number(item.pending_qty) : purchaseQty - receivedQty
      const pendingQty = Number.isFinite(pendingRaw) ? Math.max(pendingRaw, 0) : 0
      return {
        line_no: (item.line_no as number | null) ?? index + 1,
        product_id: item.product_id ?? null,
        product_code: item.product_code ?? product?.product_code ?? null,
        product_name: item.product_name ?? product?.name ?? null,
        spec: item.spec ?? product?.spec ?? null,
        unit: product?.stock_unit ?? item.unit ?? null, // stock unit (庫存單位)
        quantity: pendingQty * ratio, // 尚未進貨量 × 換算率 = 庫存單位數量 (上限=剩餘採購量)
      }
    })
    // Skip fully-received lines (nothing left to inbound) — avoids a poisoned
    // inbound whose zero-qty line would later fail post_inbound.
    .filter(r => Number(r.quantity) > 0)
}

/**
 * Convert an approved source document into a new draft target document.
 * Returns the new target id + doc_no. Throws ConversionError for caller-level
 * problems (unknown pair / source missing / source not approved).
 */
export async function convertDoc(
  fromType: DocType,
  fromId: string,
  toType: DocType,
  userId: string
): Promise<ConvertResult> {
  const def = findConversion(fromType, toType)
  if (!def) throw new ConversionError('invalidConversion', `no conversion ${fromType} → ${toType}`)

  const service = await createServiceClient()
  const write = procurementWriteClient()
  const { data: sourceData } = await service
    .from(DOC_TYPE_META[fromType].table)
    .select('*')
    .eq('id', fromId)
    .maybeSingle()
  const source = sourceData as Row | null
  if (!source) throw new ConversionError('docNotFound')
  // Source must have finished its approval chain (RFQ included — its single
  // notification step completing also lands on 'approved').
  if (source.status !== 'approved') throw new ConversionError('sourceNotApproved')

  // 防重轉 (1:1 conversions): a flagged source may have at most one non-voided
  // target. Re-converting would create a duplicate downstream document — e.g. a
  // second inbound that double-counts stock (GR→INB) or a second AP that
  // double-bills the same goods receipt (GR→AP). A voided target is ignored so
  // a mistaken conversion can be redone after voiding.
  // NOTE: this is an app-layer check with a residual TOCTOU window; the paired
  // migration adds partial unique indexes on the FK for the DB-level guarantee.
  if (def.dedupeTarget) {
    const { data: existingTarget } = await service
      .from(DOC_TYPE_META[toType].table)
      .select('id')
      .eq(def.fkField, fromId)
      .neq('status', 'voided')
      .limit(1)
    if (existingTarget && existingTarget.length > 0) {
      throw new ConversionError('alreadyConverted', `${fromType} already converted to ${toType}`)
    }
  }

  const payload: Row = {
    status: 'draft',
    [def.fkField]: fromId,
    created_by: userId,
    updated_by: userId,
  }
  for (const [targetCol, sourceCol] of Object.entries(def.fieldMap)) {
    payload[targetCol] = source[sourceCol] ?? null
  }

  // pre-insert post-processing (column completion)
  for (const step of def.postProcess ?? []) {
    if (step === 'autofillDeposit') await autofillDeposit(service, fromId, payload)
    if (step === 'fillVendorBankInfo') await fillVendorBankInfo(service, toType, payload)
    if (step === 'assignInstallmentNo') await assignInstallmentNo(service, fromId, payload)
  }

  // GR→INB is the only conversion that carries line items — build them up front
  // so the target draft + its inbound_items are inserted as ONE atomic RPC call
  // (the FK is injected by the RPC). No orphan target on a mid-conversion failure.
  const withItems = (def.postProcess ?? []).includes('buildInboundItems')
  const itemRows = withItems ? await buildInboundItemRows(service, source) : []
  const itemTable = withItems ? 'inbound_items' : null
  const itemFk = withItems ? 'inbound_order_id' : null

  // AP→INS assigns a per-AP installment_no. Two concurrent conversions can read
  // the same count and race to the same number, so we lean on the partial unique
  // index (ap_id, installment_no) added in the paired migration: on a unique
  // violation (23505) we recompute the next number — which now sees the row the
  // racing txn just committed — and retry. Non-installment conversions run a
  // single pass (maxAttempts = 1), identical to before.
  const usesInstallmentNo = (def.postProcess ?? []).includes('assignInstallmentNo')
  const maxAttempts = usesInstallmentNo ? 5 : 1
  let created: { id: string; doc_no: string } | null = null
  let lastInsertError: { message: string; code?: string } | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await write.rpc('procurement_insert_with_items', {
      p_parent_table: DOC_TYPE_META[toType].table,
      p_parent: payload,
      p_item_table: itemTable,
      p_fk_column: itemFk,
      p_items: itemRows,
    })
    if (!error && data) {
      const row = data as Row
      created = { id: row.id as string, doc_no: row.doc_no as string }
      break
    }
    lastInsertError = error
    // Retry only the installment-number collision; recompute then loop.
    if (usesInstallmentNo && error?.code === '23505' && attempt < maxAttempts - 1) {
      await assignInstallmentNo(service, fromId, payload)
      continue
    }
    break
  }
  if (!created) {
    throw new Error(`conversion insert failed: ${lastInsertError?.message ?? 'no row returned'}`)
  }
  const newId = created.id
  const docNo = created.doc_no

  // bump the source-side counter (e.g. rfqs.pr_count) — best effort
  if (def.counterField) {
    const current = Number(source[def.counterField] ?? 0) || 0
    const { data: bumped } = await write
      .from(DOC_TYPE_META[fromType].table)
      .update({ [def.counterField]: current + 1, updated_at: new Date().toISOString() })
      .eq('id', fromId)
      .select('id')
    if (!bumped || bumped.length === 0) console.warn(`[procurement] conversion: source counter bump affected 0 rows (${fromType} ${fromId})`)
  }

  return { newId, docNo, toType }
}
