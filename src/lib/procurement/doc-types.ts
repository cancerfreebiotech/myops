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
