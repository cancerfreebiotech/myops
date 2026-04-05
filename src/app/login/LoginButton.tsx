'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function LoginButton() {
  const [loading, setLoading] = useState(false)
  const t = useTranslations('auth')
  const tc = useTranslations('common')

  const handleLogin = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid profile email offline_access Calendars.ReadWrite',
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
  }

  return (
    <Button
      onClick={handleLogin}
      disabled={loading}
      className="w-full"
      size="lg"
    >
      {loading ? tc('loading') : t('loginWith')}
    </Button>
  )
}
