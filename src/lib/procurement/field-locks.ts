// Client-safe: constants and pure functions only.
//
// Spec §三-1 / §四: while an RFQ is in approval (簽核中), every user except the
// assigned inquirer (詢價人員) sees the listed fields as read-only — only the
// inquirer may keep editing the document during approval.
//
// Field names use the DB schema's English column names. The PUT handler should
// reject (400) any attempt by a non-exempt user to change a locked field while
// the document status is 'in_approval'; form components render them read-only.

import type { DocType } from './doc-types'

/**
 * rfqs header columns locked during in_approval (spec list mapped to schema):
 * 覆核人員 → reviewer_id, 覆核日期 → review_date, 詢價人員 → inquirer_id,
 * 覆核備註 → review_notes, 備註 → notes, 要求到貨日/預計到貨日 → expected_delivery_date,
 * 緊急程度 → urgency. (採購單號/狀態 are system-managed — pr_count/status are never
 * client-writable, so they are not listed here.)
 */
export const RFQ_LOCKED_FIELDS_IN_APPROVAL = [
  'reviewer_id',
  'review_date',
  'inquirer_id',
  'review_notes',
  'urgency',
  'expected_delivery_date',
  'notes',
] as const

/**
 * RFQ line-item columns locked during in_approval (for the future rfq_items
 * table — 詢價單明細 is not in the Ragic dump yet; kept here so Phase B form +
 * PUT handlers share one source of truth):
 * 項次, 商品編號, 商品名稱, 規格, 需求數量, 用途說明, 建議登錄廠商,
 * 商品編號(廠商), 廠商名稱, 商品名稱(廠商), 報價檔案, 備註
 */
export const RFQ_ITEM_LOCKED_FIELDS_IN_APPROVAL = [
  'line_no',
  'product_id',
  'product_code',
  'product_name',
  'spec',
  'quantity',
  'usage_notes',
  'suggested_vendor_id',
  'vendor_product_code',
  'vendor_name',
  'vendor_product_name',
  'quote_file_url',
  'notes',
] as const

interface LockableDoc {
  status: string
  inquirer_id?: string | null
}

/** The inquirer (詢價人員) is exempt from RFQ in-approval field locks */
export function isFieldLockExempt(doc: LockableDoc, userId: string): boolean {
  return !!doc.inquirer_id && doc.inquirer_id === userId
}

/**
 * Header columns the given user must not modify on this document right now.
 * Returns [] when nothing is locked (not in approval, exempt user, or a doc
 * type without lock rules).
 */
export function lockedFieldsFor(docType: DocType, doc: LockableDoc, userId: string): readonly string[] {
  if (docType !== 'rfq') return []
  if (doc.status !== 'in_approval') return []
  if (isFieldLockExempt(doc, userId)) return []
  return RFQ_LOCKED_FIELDS_IN_APPROVAL
}

/** Line-item columns locked for the given user (rfq_items — Phase B) */
export function lockedItemFieldsFor(docType: DocType, doc: LockableDoc, userId: string): readonly string[] {
  if (docType !== 'rfq') return []
  if (doc.status !== 'in_approval') return []
  if (isFieldLockExempt(doc, userId)) return []
  return RFQ_ITEM_LOCKED_FIELDS_IN_APPROVAL
}
