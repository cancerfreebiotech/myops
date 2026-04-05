import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import LoginButton from './LoginButton'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/')

  const t = await getTranslations('auth')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">
            myOPS
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            CancerFree Biotech OPS
          </p>
        </div>
        <LoginButton />
        <p className="text-xs text-slate-400 text-center">
          {t('loginDescription')}
        </p>
      </div>
    </div>
  )
}
