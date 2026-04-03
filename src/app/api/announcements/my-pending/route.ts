import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('document_recipients')
    .select(`
      id, document_id, requires_confirmation, created_at,
      document:documents!document_recipients_document_id_fkey(
        id, title, content_zh, announcement_category, created_at, status
      )
    `)
    .eq('user_id', user.id)
    .eq('requires_confirmation', true)
    .is('confirmed_at', null)
    .not('document', 'is', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
