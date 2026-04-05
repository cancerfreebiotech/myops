import { NextRequest, NextResponse } from 'next/server'
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from '@/i18n/config'

// GET /api/locale?lang=en&redirect=/current-path
// Sets locale cookie via server-side Set-Cookie header and redirects back.
// This is the most reliable way to set cookies across all environments.
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get('lang')
  const redirectTo = req.nextUrl.searchParams.get('redirect') || '/'

  if (!lang || !(SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
    return NextResponse.redirect(new URL(redirectTo, req.url))
  }

  const response = NextResponse.redirect(new URL(redirectTo, req.url))
  response.cookies.set(LOCALE_COOKIE, lang, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: true,
  })

  return response
}
