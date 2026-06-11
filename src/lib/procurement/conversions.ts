// Document conversion (轉單) skeleton — types + field mapping tables.
//
// Phase B implements convertDocument() fully (insert target draft, copy mapped
// fields, build line items, run post-processing like deposit auto-fill and
// purchase→stock unit conversion). This file fixes the shapes and the
// source→target column maps so form/UI/API work can proceed against them.

import type { DocType } from './doc-types'

export type ConversionKey =
  | 'rfq_to_pr'
  | 'pr_to_gr'
  | 'pr_to_dep'
  | 'gr_to_inb'
  | 'gr_to_ap'
  | 'ap_to_ins'

/** Extra server-side steps that run after the plain column copy */
export type ConversionPostProcess =
  /** PR→GR: look up approved deposit_requests of the source PR and fill has_deposit / deposit_doc_no / deposit_paid_amount */
  | 'autofillDeposit'
  /** GR→INB: build inbound_items from pr_items of gr.pr_id, converting purchase units → stock units via products.units_per_purchase */
  | 'buildInboundItems'
  /** PR→GR: copy pr_items snapshots for receiving reference (Phase B decides target shape) */
  | 'copyPrItems'
  /** *_to_dep / gr_to_ap: complete vendor bank/payment columns from the vendors master */
  | 'fillVendorBankInfo'
  /** AP→INS: assign next installment_no and verify installment totals */
  | 'assignInstallmentNo'

export interface ConversionDef {
  source: DocType
  target: DocType
  /** Target column holding the source document's id (single-direction FK, e.g. purchase_requests.rfq_id) */
  fkField: string
  /** target column ← source column (verbatim copy) */
  fieldMap: Record<string, string>
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
      // RFQ 預計到貨日 becomes the PR 請購要求到貨日
      request_expected_date: 'expected_delivery_date',
      notes: 'notes',
    },
  },

  // 請採購單 → 進貨驗收單 (轉進貨單)
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
    // 訂金自動帶入: query approved deposit_requests for this PR and fill
    // has_deposit / deposit_doc_no / deposit_paid_amount automatically
    postProcess: ['autofillDeposit', 'copyPrItems'],
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
    // vendor_short_name + bank_* / closing_day come from the vendors master
    postProcess: ['fillVendorBankInfo'],
  },

  // 進貨驗收單 → 入庫單 (轉入庫單; is_new_lot decided per line by lot lookup)
  gr_to_inb: {
    source: 'goods_receipt',
    target: 'inbound_order',
    fkField: 'gr_id',
    fieldMap: {
      notes: 'notes',
    },
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
    // country / payment_method / payment_terms / closing_day / bank_* from vendors master
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

export interface ConvertResult {
  targetId: string
  targetDocNo: string
}

/**
 * Create a draft target document from an approved source document.
 * Phase B: copy fieldMap columns, insert target as 'draft' (doc_no via trigger),
 * run postProcess steps, and bump source counters (pr_count, gr_count, …).
 */
export async function convertDocument(
  _key: ConversionKey,
  _sourceId: string,
  _userId: string
): Promise<ConvertResult> {
  throw new Error('convertDocument is not implemented yet (Phase B)')
}
