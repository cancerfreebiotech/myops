import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const isApiRoute = pathname.startsWith('/api/')

  // Public routes — no auth required
  const publicRoutes = ['/login', '/quick-start', '/api/auth/callback', '/api/locale']
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return supabaseResponse
  }

  // Cron endpoints — Vercel Cron has no session cookie; these routes enforce
  // their own fail-closed CRON_SECRET bearer check internally.
  // /api/bot/* are Dr.Ave inbound callbacks (card buttons / commands) that
  // authenticate with Bearer BOT_GATEWAY_TOKEN, not a user session, so they must
  // bypass the session gate here.
  const cronRoutes = ['/api/teams/clock-reminder', '/api/teams/daily-digest', '/api/teams/notify', '/api/bot/']
  if (cronRoutes.some(r => pathname.startsWith(r))) {
    return supabaseResponse
  }

  // Supabase's refresh-token rotation rejects every loser of a concurrent
  // refresh race with 409 "too many concurrent token refresh requests" — this
  // fires whenever a page load's parallel Link-prefetch/data requests all hit
  // an about-to-expire token at once, and only means "someone else on this
  // same session just refreshed", not "logged out". The still-cookied access
  // token is unexpired (refresh runs ahead of expiry), so let the request
  // through rather than force a redirect; RLS is the real auth boundary for
  // whatever the downstream page/route queries next.
  const isConcurrentRefreshRace = userError?.status === 409 && userError?.code === 'conflict'
  if (isConcurrentRefreshRace) {
    return supabaseResponse
  }

  // Not logged in → redirect to login (JSON 401 for API calls so client-side
  // fetch() doesn't follow a 307 into the login page's HTML and fail to parse it)
  if (!user) {
    if (isApiRoute) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // MFA routes — allow through for MFA setup/verify
  const mfaRoutes = ['/mfa/setup', '/mfa/verify']
  if (mfaRoutes.some(r => pathname.startsWith(r))) {
    return supabaseResponse
  }

  // Check AAL (MFA level)
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const currentLevel = aalData?.currentLevel
  const nextLevel = aalData?.nextLevel

  if (nextLevel === 'aal2' && currentLevel !== 'aal2') {
    // Has MFA enrolled but not verified this session
    if (isApiRoute) return NextResponse.json({ error: 'MFA required' }, { status: 401 })
    return NextResponse.redirect(new URL('/mfa/verify', request.url))
  }

  if (currentLevel === 'aal1' && nextLevel === 'aal1') {
    // No MFA enrolled yet — force setup
    if (isApiRoute) return NextResponse.json({ error: 'MFA setup required' }, { status: 401 })
    return NextResponse.redirect(new URL('/mfa/setup', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
