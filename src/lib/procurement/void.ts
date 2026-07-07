// Server-only: void (作廢) + void-and-clone (作廢並複製) for procurement docs.
//
// Rules (plan decision 10 / spec §五-4):
// - Only approved/rejected documents can be voided (drafts are deleted via
//   CRUD; in-approval docs must finish or be rejected first).
// - goods_receipt: blocked while non-voided downstream docs exist
//   (ap_requests.gr_id / inbound_orders.gr_id) — the caller gets their doc_nos.
// - inbound/outbound orders already posted to stock are unposted first
//   (unpost_inbound/unpost_outbound write reversing 'void' ledger movements).
// - Voiding stamps voided_at/voided_by/void_reason and writes an audit_logs row.
// - clone=true additionally copies the main columns + line items into a fresh
//   draft (approval/void/posting artifacts cleared) and returns its id.

import { createAdminClient, createServiceClient } from '@/lib/supabase/server'
import { DOC_TYPE_META, type DocType } from './doc-types'
import { applyInboundReceipt } from './receipt-progress'

export type VoidErrorCode =
  | 'docNotFound'
  | 'voidNotAllowed'      // status is not approved/rejected
  | 'downstreamNotVoided' // GR with live downstream docs
  | 'unpostFailed'        // stock reversal failed (e.g. stock already consumed)

export class VoidError extends Error {
  constructor(
    public code: VoidErrorCode,
    message?: string,
    /** doc_nos of blocking downstream documents (downstreamNotVoided) */
    public downstream?: string[]
  ) {
    super(message ?? code)
    this.name = 'VoidError'
  }
}

export interface VoidResult {
  docNo: string
  /** id of the cloned draft (clone=true only) */
  cloneId?: string
  /** doc_no of the cloned draft (clone=true only) */
  cloneDocNo?: string
}

type Service = Awaited<ReturnType<typeof createServiceClient>>
type Row = Record<string, unknown>

/** Line-item tables per document type: [table, parent FK column] */
const ITEM_TABLES: Partial<Record<DocType, [table: string, fk: string]>> = {
  purchase_request: ['pr_items', 'pr_id'],
  inbound_order: ['inbound_items', 'inbound_order_id'],
  outbound_order: ['outbound_items', 'outbound_order_id'],
}

/** Columns never copied when cloning a document (skeleton + workflow artifacts) */
const CLONE_EXCLUDED = new Set([
  'id', 'doc_no', 'status', 'current_step',
  'voided_at', 'voided_by', 'void_reason',
  'created_by', 'updated_by', 'created_at', 'updated_at',
  // posting / workflow timestamps
  'posted_at', 'stocked_at', 'deducted_at', 'inbound_status', 'submitted_at', 'submitted_by',
  'received_at', 'inspected_at', 'confirmed_inbound_at', 'converted_to_inspection',
  // downstream counters
  'pr_count', 'product_eval_count', 'gr_count', 'deposit_request_count',
])

/** Item columns never copied when cloning line items */
const CLONE_ITEM_EXCLUDED = new Set([
  'id', 'created_at', 'updated_at',
  // posting artifacts — re-resolved when the cloned doc is posted
  'warehouse_stock_id', 'stock_code', 'warehouse_qty', 'qty_after_use',
])

/** Non-voided downstream documents that block voiding a goods receipt */
async function findGrDownstream(service: Service, grId: string): Promise<string[]> {
  const blocking: string[] = []
  const [{ data: aps }, { data: inbounds }] = await Promise.all([
    service.from('ap_requests').select('doc_no').eq('gr_id', grId).neq('status', 'voided'),
    service.from('inbound_orders').select('doc_no').eq('gr_id', grId).neq('status', 'voided'),
  ])
  for (const r of (aps as { doc_no: string }[] | null) ?? []) blocking.push(r.doc_no)
  for (const r of (inbounds as { doc_no: string }[] | null) ?? []) blocking.push(r.doc_no)
  return blocking
}

async function cloneDocument(
  service: Service,
  docType: DocType,
  doc: Row,
  userId: string
): Promise<{ id: string; doc_no: string }> {
  const table = DOC_TYPE_META[docType].table
  const payload: Row = { status: 'draft', created_by: userId, updated_by: userId }
  for (const [col, value] of Object.entries(doc)) {
    if (!CLONE_EXCLUDED.has(col)) payload[col] = value
  }

  const { data: created, error } = await service.from(table).insert(payload).select('id, doc_no').single()
  if (error || !created) throw new Error(`clone insert failed: ${error?.message ?? 'no row returned'}`)
  const cloneId = created.id as string

  const itemDef = ITEM_TABLES[docType]
  if (itemDef) {
    const [itemTable, fk] = itemDef
    const { data: items } = await service
      .from(itemTable)
      .select('*')
      .eq(fk, doc.id)
      .order('line_no', { ascending: true, nullsFirst: false })
    const rows = ((items as Row[] | null) ?? []).map(item => {
      const out: Row = { [fk]: cloneId }
      for (const [col, value] of Object.entries(item)) {
        if (col !== fk && !CLONE_ITEM_EXCLUDED.has(col)) out[col] = value
      }
      return out
    })
    if (rows.length > 0) {
      const { error: itemError } = await service.from(itemTable).insert(rows)
      if (itemError) {
        // keep clone atomic: drop the orphan draft (items cascade) before bubbling up
        await service.from(table).delete().eq('id', cloneId)
        throw new Error(`clone items insert failed: ${itemError.message}`)
      }
    }
  }

  return { id: cloneId, doc_no: created.doc_no as string }
}

/**
 * Void an approved/rejected document (optionally cloning it into a new draft).
 * Throws VoidError for caller-level problems; unexpected DB failures throw Error.
 */
export async function voidDocument(
  docType: DocType,
  docId: string,
  userId: string,
  options: { reason: string; clone?: boolean }
): Promise<VoidResult> {
  const service = await createServiceClient()
  const table = DOC_TYPE_META[docType].table

  const { data: docData } = await service.from(table).select('*').eq('id', docId).maybeSingle()
  const doc = docData as Row | null
  if (!doc) throw new VoidError('docNotFound')

  if (doc.status !== 'approved' && doc.status !== 'rejected') {
    throw new VoidError('voidNotAllowed', `status is ${doc.status}`)
  }

  // GR: block while live downstream documents exist (spec: 先處理下游)
  if (docType === 'goods_receipt') {
    const downstream = await findGrDownstream(service, docId)
    if (downstream.length > 0) {
      throw new VoidError('downstreamNotVoided', `downstream documents exist: ${downstream.join(', ')}`, downstream)
    }
  }

  // posted inbound/outbound orders: reverse the stock effect first
  if ((docType === 'inbound_order' || docType === 'outbound_order') && doc.posted_at) {
    const fn = docType === 'inbound_order' ? 'unpost_inbound' : 'unpost_outbound'
    const arg = docType === 'inbound_order' ? 'p_inbound_id' : 'p_outbound_id'
    const { error } = await service.rpc(fn, { [arg]: docId, p_user_id: userId })
    if (error) throw new VoidError('unpostFailed', error.message)
    // this path bypasses the unpost endpoint, so reverse the PR receipt cache here too
    if (docType === 'inbound_order') await applyInboundReceipt(service, docId, 'unpost')
  }

  const { error: voidError } = await service
    .from(table)
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: userId,
      void_reason: options.reason,
      updated_by: userId,
    })
    .eq('id', docId)
  if (voidError) throw new Error(`void update failed: ${voidError.message}`)

  // audit trail (procurement docs are not `documents` rows — reference goes in detail)
  // audit_logs 為 service-role only，須用 admin client
  await createAdminClient().from('audit_logs').insert({
    doc_id: null,
    user_id: userId,
    action: 'archive',
    detail: {
      scope: 'procurement_void',
      doc_type: docType,
      doc_id: docId,
      doc_no: doc.doc_no,
      reason: options.reason,
      clone: options.clone === true,
    },
  })

  const result: VoidResult = { docNo: doc.doc_no as string }

  if (options.clone) {
    const clone = await cloneDocument(service, docType, doc, userId)
    result.cloneId = clone.id
    result.cloneDocNo = clone.doc_no
  }

  return result
}
