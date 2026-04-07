'use client'

import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SuspendedPage() {
  const t = useTranslations('auth')
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-6 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <ShieldOff size={28} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('suspendedTitle')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {t('suspendedMessage')}
          </p>
        </div>
        <Button variant="outline" onClick={handleSignOut} className="w-full">
          {t('suspendedSignOut')}
        </Button>
      </div>
    </div>
  )
}
