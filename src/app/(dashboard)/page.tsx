import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">
        Dashboard
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
        歡迎回來，{user?.email}
      </p>
    </div>
  )
}
