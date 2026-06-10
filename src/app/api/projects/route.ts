import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'

export async function POST(request: NextRequest) {
  const t = await getTranslations('apiErrors')
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })

  const { name, description, owner_id } = await request.json()
  if (!name) return NextResponse.json({ error: t('projects.missingName') }, { status: 400 })

  const { data, error } = await service.from('projects').insert({
    name, description: description ?? null,
    owner_id: owner_id ?? user.id,
    is_active: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Add creator as lead member
  await service.from('project_members').insert({ project_id: data.id, user_id: user.id, role: 'lead' })

  return NextResponse.json({ data })
}
