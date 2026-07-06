import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { LOCALE_COOKIE } from '@/i18n/config'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Enforce @cancerfree.io domain
  const email = data.user.email ?? ''
  if (!email.endsWith('@cancerfree.io')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`)
  }

  // 擷取 Microsoft refresh token（offline_access）供日後以當事人身分推 Outlook 行事曆
  const msRefresh = data.session?.provider_refresh_token
  if (msRefresh) {
    try {
      const { storeMsRefreshToken } = await import('@/lib/ms-calendar')
      await storeMsRefreshToken(data.user.id, msRefresh)
    } catch (e) {
      console.error('[auth callback] store MS refresh token failed:', e)
    }
  }

  // Sync locale cookie from user's saved language preference
  const service = await createServiceClient()
  const { data: dbUser } = await service
    .from('users')
    .select('language')
    .eq('id', data.user.id)
    .single()

  const response = NextResponse.redirect(`${origin}${next}`)
  if (dbUser?.language) {
    response.cookies.set(LOCALE_COOKIE, dbUser.language, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return response
}
