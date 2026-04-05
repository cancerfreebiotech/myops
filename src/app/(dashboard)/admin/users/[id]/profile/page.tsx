import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProfileClient } from './ProfileClient'
import { getTranslations } from 'next-intl/server'

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentUser?.role !== 'admin') redirect('/')

  const { data: targetUser } = await service
    .from('users')
    .select('id, display_name, email, employment_type, department:departments(name)')
    .eq('id', id)
    .single()

  if (!targetUser) redirect('/admin/users')

  const { data: profile } = await service
    .from('user_profiles')
    .select('*')
    .eq('user_id', id)
    .single()

  const t = await getTranslations('admin.profile')

  return (
    <div>
      <PageHeader
        title={`${targetUser.display_name ?? targetUser.email} — ${t('title')}`}
        description="編輯員工人事基本資料、薪資設定與銀行資訊"
      />
      <ProfileClient
        targetUser={targetUser}
        initialProfile={profile}
      />
    </div>
  )
}
