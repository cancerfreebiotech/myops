import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

/**
 * ⚠️ 注意：這不是真正的 service-role client。
 * 因為帶入了 request cookies，只要使用者有 session，supabase-js 會以
 * 使用者的 JWT 作為 Authorization（service key 只放在 apikey header），
 * 所以所有查詢仍以「使用者身分」跑 RLS。
 * 全站 300+ 個呼叫點都是依這個行為寫的 — 不要直接改成無 cookies 的
 * 真 service client，會讓所有依賴 RLS 保護的 route 立刻繞過 RLS。
 * 需要真正繞過 RLS 時，請另建獨立的 admin client 並在該 route 補上
 * 明確的授權檢查。
 */
export async function createServiceClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

/**
 * ⚠️ 真正的 service-role client（不帶任何 cookies，故 Authorization 為 service key，
 * 真正繞過 RLS）。與 createServiceClient 不同——後者帶 request cookies 會以使用者身分跑 RLS。
 * 僅用於「需以他人身分操作」且呼叫端已自行做明確授權的情境（如：核准他人請假時，
 * 讀取當事人的 Microsoft refresh token 推送其 Outlook 行事曆）。切勿當一般查詢用。
 */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return [] }, setAll() {} },
    }
  )
}

/**
 * RLS-bypassing client for procurement WRITES only（等同 createAdminClient，
 * 但以語意化命名標示「這是刻意繞過 RLS 的寫入」）。
 *
 * 採購相關資料表（rfqs / purchase_requests / goods_receipts / inbound_* /
 * outbound_* / *_requests / *_evaluations / procurement_approval_steps /
 * vendors / vendor_products / products…）RLS 皆為「只有 SELECT 政策」，
 * 原設計就是寫入走真 service role。授權一律在應用層把關：
 * requireProcurementUser / requireInventoryUser / getProcurementAccess、
 * 核准與作廢的 MFA aal2、以及 approval-engine 的 canSubmit / canActOnStep /
 * 職責分立——不靠 RLS。
 *
 * ⚠️ 僅用於「寫入」（insert / update / delete）與只授權 service_role 的
 * SECURITY DEFINER RPC（post_inbound / post_outbound / unpost_* / next_doc_no）。
 * 會回傳資料列給瀏覽器的「讀取」必須維持 createServiceClient()（RLS-scoped）——
 * 那些 SELECT 政策靠 created_by = auth.uid() 做逐人過濾，繞過會造成資料外洩。
 */
export function procurementWriteClient() {
  return createAdminClient()
}
