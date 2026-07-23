import { createClient } from '@/lib/supabase/server'
import { getSignedUploadUrl } from '@/lib/storage'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bucket, filename } = await request.json()
  const allowed = ['documents', 'feedback-screenshots', 'insurance-brackets', 'expense-receipts', 'asset-files', 'training-files', 'recruiting-files', 'leave-files']
  if (!allowed.includes(bucket)) return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })

  const ext = filename?.split('.').pop() ?? 'bin'
  const path = `${randomUUID()}.${ext}`

  try {
    const data = await getSignedUploadUrl(bucket, path)
    return NextResponse.json({ data: { ...data, path } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
