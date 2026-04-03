import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket')
  const path = searchParams.get('path')
  if (!bucket || !path) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 400 })

  return NextResponse.redirect(data.signedUrl)
}
