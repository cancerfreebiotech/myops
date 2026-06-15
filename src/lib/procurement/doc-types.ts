// Client-safe: constants and types only, no server imports.
//
// Procurement document type registry. Each of the 10 document tables shares a
// common skeleton (id, doc_no, status, current_step, voided_*, notes,
// created_by/updated_by, created_at/updated_at). `doc_no` is auto-filled by a
// BEFORE INSERT trigger (next_doc_no) using the prefix below, format
// `PREFIX-YYMM-NNN` (Asia/Taipei).

export const DOC_TYPES = [
  'rfq',
  'purchase_request',
  'goods_receipt',
  'inbound_order',
  'outbound_order',
  'deposit_request',
  'ap_request',
  'installment_request',
  'vendor_evaluation',
  'product_evaluation',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export const DOC_STATUSES = ['draft', 'in_approval', 'approved', 'rejected', 'voided'] as const

export type DocStatus = (typeof DOC_STATUSES)[number]

export interface DocTypeMeta {
  /** doc_no prefix, e.g. 'PR' → PR-2606-001 */
  prefix: string
  /** Postgres table name */
  table: string
  /** teamsMessages key for the localized doc type label (flat key in the teamsMessages namespace) */
  teamsLabelKey: string
  /** i18n key (procurement namespace) for the doc type label, for UI use */
  labelKey: string
}

export const DOC_TYPE_META: Record<DocType, DocTypeMeta> = {
  rfq: { prefix: 'RFQ', table: 'rfqs', teamsLabelKey: 'procurementDocRfq', labelKey: 'docTypes.rfq' },
  purchase_request: { prefix: 'PR', table: 'purchase_requests', teamsLabelKey: 'procurementDocPr', labelKey: 'docTypes.purchase_request' },
  goods_receipt: { prefix: 'GR', table: 'goods_receipts', teamsLabelKey: 'procurementDocGr', labelKey: 'docTypes.goods_receipt' },
  inbound_order: { prefix: 'INB', table: 'inbound_orders', teamsLabelKey: 'procurementDocInb', labelKey: 'docTypes.inbound_order' },
  outbound_order: { prefix: 'OUT', table: 'outbound_orders', teamsLabelKey: 'procurementDocOut', labelKey: 'docTypes.outbound_order' },
  deposit_request: { prefix: 'DEP', table: 'deposit_requests', teamsLabelKey: 'procurementDocDep', labelKey: 'docTypes.deposit_request' },
  ap_request: { prefix: 'AP', table: 'ap_requests', teamsLabelKey: 'procurementDocAp', labelKey: 'docTypes.ap_request' },
  installment_request: { prefix: 'INS', table: 'installment_requests', teamsLabelKey: 'procurementDocIns', labelKey: 'docTypes.installment_request' },
  vendor_evaluation: { prefix: 'VE', table: 'vendor_evaluations', teamsLabelKey: 'procurementDocVe', labelKey: 'docTypes.vendor_evaluation' },
  product_evaluation: { prefix: 'PE', table: 'product_evaluations', teamsLabelKey: 'procurementDocPe', labelKey: 'docTypes.product_evaluation' },
}

/**
 * Single source of truth: the document column carrying the monetary total per
 * doc type, used to drive the one-tap amount threshold (bot-approval-policy).
 * Doc types with no monetary amount map to undefined.
 *
 * IMPORTANT: this must be the ONLY amount-field map. The one-tap card is built
 * (approval-engine) and re-validated (api/bot/approve) and configured
 * (admin/bot-policy) off this same map — divergent copies would let a card pass
 * shouldOneTap at build but be refused at re-validate (or vice versa).
 *
 * `rfq` (詢價單) has NO total_amount column by design (it is a quote request,
 * not a money document) → undefined → it can never carry an amount threshold.
 */
export const DOC_AMOUNT_FIELD: Record<DocType, string | undefined> = {
  rfq: undefined,
  purchase_request: 'total_amount',
  goods_receipt: 'total_amount',
  inbound_order: undefined,
  outbound_order: undefined,
  deposit_request: 'total_amount',
  ap_request: 'total_amount',
  installment_request: 'amount',
  vendor_evaluation: undefined,
  product_evaluation: undefined,
}

/** True when the doc type carries a monetary amount (→ supports amount thresholds). */
export function hasAmountField(docType: DocType): boolean {
  return DOC_AMOUNT_FIELD[docType] !== undefined
}

/** i18n keys (procurement namespace) for the shared document statuses, for UI use */
export const STATUS_LABEL_KEYS: Record<DocStatus, string> = {
  draft: 'status.draft',
  in_approval: 'status.in_approval',
  approved: 'status.approved',
  rejected: 'status.rejected',
  voided: 'status.voided',
}

export function isDocType(value: string): value is DocType {
  return (DOC_TYPES as readonly string[]).includes(value)
}

/** Common skeleton shared by all 10 procurement document tables */
export interface ProcurementDocBase {
  id: string
  doc_no: string
  status: DocStatus
  current_step: number | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}
