// Client-safe: flow definitions only, no server imports.
//
// The 10 approval chains from the Ragic spec (§三), rewritten role-based
// (spec §2.3): named employees were replaced by job roles —
// 吳詩培 → job_role 'coo', Po → job_role 'ceo', 趙以琳 → job_role 'finance'.
// 「請款簽核主管」 is expressed via the FeatureKey 'procurement_payment_approve'
// (granted to finance/ceo by default), attached to manager_of steps so feature
// holders can also act on those steps.
//
// Approval *state* lives in the shared DB table `procurement_approval_steps`
// (doc_type, doc_id, step_no, approver_kind, approver_value, resolved_user_id,
// status pending/current/approved/rejected/skipped, acted_by, acted_at, comment).

import type { FeatureKey } from '@/types'
import type { DocType } from './doc-types'

export type ApproverKind = 'job_role' | 'manager_of' | 'doc_field' | 'anyone'

export type ApproverSpec =
  /** A job role acts on this step (resolved dynamically at act time; all active holders are notified) */
  | { kind: 'job_role'; value: 'coo' | 'ceo' | 'finance' }
  /**
   * The direct manager of the submitter acts on this step.
   * - `fallback`: used when the submitter has no manager (or is their own manager) —
   *   e.g. product_evaluation falls back to the doc creator (送簽者本人即主管).
   * - `actableByFeature`: holders of this feature may also act on the step
   *   (請款簽核主管 = 'procurement_payment_approve').
   */
  | { kind: 'manager_of'; fallback?: ApproverSpec; actableByFeature?: FeatureKey }
  /** A user referenced by a UUID column on the document itself (e.g. inquirer_id, created_by, updated_by) */
  | { kind: 'doc_field'; field: string }
  /**
   * Notification/confirmation step (「通知○○」). Anyone holding `notifyFeature`
   * (or an admin) can acknowledge; all active holders are notified.
   */
  | { kind: 'anyone'; notifyFeature: FeatureKey }

export interface FlowStep {
  /** i18n key suffix (procurement namespace, steps.*) — also stored as plain text name fallback */
  name: string
  approver: ApproverSpec
}

/**
 * Approval chains per document type (spec §三).
 *
 * Notes:
 * - inbound_order: the two Ragic inbound forms (增加/新增) are merged into one
 *   table with is_new_lot; both chains were 動態:建檔人員 → doc_field(created_by).
 * - outbound_order: no chain in the Ragic spec; mirrored to doc_field(created_by)
 *   for consistency (single self-confirm step).
 * - product_evaluation: Ragic's two-step hack (主管 + 「為部門主管」) is collapsed
 *   into one manager_of step with fallback to the doc creator.
 */
export const APPROVAL_FLOWS: Record<DocType, FlowStep[]> = {
  // §三-1 詢價單: 1 通知詢價人員 (動態: 詢價人員)
  rfq: [
    { name: 'notifyInquirer', approver: { kind: 'doc_field', field: 'inquirer_id' } },
  ],

  // §三-2 請採購單: 部門主管(請款簽核主管) → COO → CEO → 通知採購
  purchase_request: [
    { name: 'departmentManager', approver: { kind: 'manager_of', actableByFeature: 'procurement_payment_approve' } },
    { name: 'coo', approver: { kind: 'job_role', value: 'coo' } },
    { name: 'ceo', approver: { kind: 'job_role', value: 'ceo' } },
    { name: 'notifyProcurement', approver: { kind: 'anyone', notifyFeature: 'procurement_unit' } },
  ],

  // §三-3 進貨驗收單: 確認(動態: 最後修改人員) → 確認(任意使用者)
  goods_receipt: [
    { name: 'confirmByLastEditor', approver: { kind: 'doc_field', field: 'updated_by' } },
    { name: 'confirmAnyone', approver: { kind: 'anyone', notifyFeature: 'procurement_unit' } },
  ],

  // §三-4/5 入庫單(增加/新增, 合併): 採購/進貨人員 (動態: 建檔人員)
  inbound_order: [
    { name: 'receiver', approver: { kind: 'doc_field', field: 'created_by' } },
  ],

  // 出庫單: 不在規格 §三 內 — 比照入庫單由建檔人員確認
  outbound_order: [
    { name: 'issuer', approver: { kind: 'doc_field', field: 'created_by' } },
  ],

  // §三-8 訂金請款單: 通知會計 (角色: 會計)
  deposit_request: [
    { name: 'finance', approver: { kind: 'job_role', value: 'finance' } },
  ],

  // §三-9 採購請款單: 會計
  ap_request: [
    { name: 'finance', approver: { kind: 'job_role', value: 'finance' } },
  ],

  // §三-10 分期請款單: 會計
  installment_request: [
    { name: 'finance', approver: { kind: 'job_role', value: 'finance' } },
  ],

  // §三-6 廠商審核評估: COO
  vendor_evaluation: [
    { name: 'coo', approver: { kind: 'job_role', value: 'coo' } },
  ],

  // §三-7 商品審核評估: 直屬主管, 送簽者本人即主管時 fallback 建檔人員
  product_evaluation: [
    { name: 'departmentManager', approver: { kind: 'manager_of', fallback: { kind: 'doc_field', field: 'created_by' } } },
  ],
}
