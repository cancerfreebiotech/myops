import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { UsersTable } from './UsersTable'
import { getTranslations } from 'next-intl/server'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: currentUser } = await supabase.from('users').select('role, granted_features').eq('id', authUser.id).single()
  const isAdmin = currentUser?.role === 'admin'
  // 與全站 HR 判定一致（lifecycle/recruiting/RLS has_feature('hr_manager')）
  const isHR = !!(currentUser?.granted_features as string[] | null)?.includes('hr_manager')
  if (!isAdmin && !isHR) redirect('/no-permission')

  const service = await createServiceClient()

  const { data: users } = await service
    .from('users')
    .select(`
      *,
      department:departments(id, name, code)
    `)
    .order('created_at', { ascending: false })

  const { data: departments } = await service
    .from('departments')
    .select('id, name, code')
    .is('deleted_at', null)
    .order('code')

  const t = await getTranslations('admin.users')

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      {/* 帳號開立政策說明（Linda 回報「沒有找到新增使用者功能」）：users.id 是 auth.users(id)
          的外鍵，使用者列由 handle_new_user() trigger 在首次 Entra 登入時建立，所以這裡本來就
          不可能「先新增」一個帳號。把政策寫在畫面上，避免每個新人資都再問一次。 */}
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{t('accountPolicyTitle')}</p>
        <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">{t('accountPolicyNotice')}</p>
      </div>
      <UsersTable users={users ?? []} departments={departments ?? []} isAdmin={isAdmin} />
    </div>
  )
}
