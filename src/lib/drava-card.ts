// Client-safe builder for Dr.Ave approval cards (PRD §4).
//
// Two shapes depending on policy (see bot-approval-policy.ts):
//   oneTap=true  → actionable card with approve/reject buttons; Dr.Ave routes
//                  the click back to myOPS /api/bot/approve carrying the
//                  clicker's email. Action payload identifies the step.
//   oneTap=false → deep-link card: a single "前往簽核" button that opens the
//                  document page on ops.cancerfree.io (MFA preserved on web).

import type { DravaCard } from '@/lib/teams-bot'
import type { DocType } from '@/lib/procurement/doc-types'

const APP_ORIGIN = 'https://ops.cancerfree.io'

/**
 * docType → URL path segment(s) (without leading slash, without id) for the
 * approval deep link. Documents with a dedicated detail route deep-link there;
 * the rest point at their list page.
 *   {id} marks where the document id is interpolated.
 */
const DOC_PATHS: Record<DocType, string> = {
  rfq: 'procurement/rfqs/{id}',
  purchase_request: 'procurement/purchase-requests/{id}',
  goods_receipt: 'procurement/goods-receipts/{id}',
  inbound_order: 'procurement/inventory',
  outbound_order: 'procurement/inventory',
  deposit_request: 'procurement/payments/deposit/{id}',
  ap_request: 'procurement/payments/ap/{id}',
  installment_request: 'procurement/payments/installment/{id}',
  vendor_evaluation: 'procurement/evaluations',
  product_evaluation: 'procurement/evaluations',
}

/** Absolute deep-link URL to a document's approval page. */
export function docUrl(docType: DocType, docId: string): string {
  const path = DOC_PATHS[docType].replace('{id}', encodeURIComponent(docId))
  return `${APP_ORIGIN}/${path}`
}

export interface BuildApprovalCardArgs {
  docType: DocType
  docId: string
  stepNo: number
  /** card heading, e.g. localized "採購單 PR-2606-001" */
  title: string
  /** card body, e.g. amount / requester / summary line */
  summary: string
  /** money amount for the document, if any (display + audit only here) */
  amount?: number
  /** policy decision from shouldOneTap() */
  oneTap: boolean
  /** optional localized button labels (default: Chinese) */
  labels?: { approve?: string; reject?: string; open?: string }
}

/**
 * Build the Dr.Ave card for an approval request.
 * - oneTap → approve/reject buttons (action_type 'approve_doc', payload carries
 *   docType/docId/stepNo + action). myOPS re-validates policy on the callback.
 * - !oneTap → single deep-link button (action_type 'open_url', payload.url).
 */
export function buildApprovalCard(args: BuildApprovalCardArgs): DravaCard {
  const { docType, docId, stepNo, title, summary, oneTap, labels } = args

  if (oneTap) {
    return {
      title,
      body: summary,
      actions: [
        {
          label: labels?.approve ?? '核准',
          action_type: 'approve_doc',
          payload: { docType, docId, stepNo, action: 'approve' },
          style: 'positive',
        },
        {
          label: labels?.reject ?? '退回',
          action_type: 'approve_doc',
          payload: { docType, docId, stepNo, action: 'reject' },
          style: 'destructive',
        },
      ],
    }
  }

  return {
    title,
    body: summary,
    actions: [
      {
        label: labels?.open ?? '前往簽核',
        action_type: 'open_url',
        payload: { url: docUrl(docType, docId) },
      },
    ],
  }
}
