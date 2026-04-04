import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const VALID_LOCALES = ['zh-TW', 'en', 'ja']

export async function POST(request: NextRequest) {
  const { locale } = await request.json()

  if (!locale || !VALID_LOCALES.includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }

  // Update user's language preference in DB
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const service = await createServiceClient()
    await service.from('users').update({ language: locale }).eq('id', user.id)
  }

  // Set cookie via Set-Cookie header (server-side, most reliable)
  const response = NextResponse.json({ ok: true })
  response.cookies.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: true,
  })

  return response
}
