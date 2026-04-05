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

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Public routes — no auth required
  const publicRoutes = ['/login', '/api/auth/callback', '/api/locale']
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return supabaseResponse
  }

  // Not logged in → redirect to login
  if (!user) {
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

  const isApiRoute = pathname.startsWith('/api/')

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
