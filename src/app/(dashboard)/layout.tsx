import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import type { User } from '@/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: dbUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!dbUser || !dbUser.is_active) redirect('/login')

  // Sync user's language preference to locale cookie for next-intl
  const cookieStore = await cookies()
  const currentLocale = cookieStore.get('locale')?.value
  if (dbUser.language && dbUser.language !== currentLocale) {
    cookieStore.set('locale', dbUser.language, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      <div className="hidden lg:flex lg:flex-col">
        <Sidebar user={dbUser as User} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
