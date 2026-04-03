import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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

  return NextResponse.redirect(`${origin}${next}`)
}
