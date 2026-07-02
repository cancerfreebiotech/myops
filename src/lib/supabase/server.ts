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
