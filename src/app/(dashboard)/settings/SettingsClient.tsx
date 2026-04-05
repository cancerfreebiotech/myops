'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Save, Shield, Sun, Moon, Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function SettingsClient({ profile }: { profile: any }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [language, setLanguage] = useState(profile?.language ?? 'zh-TW')
  const [loading, setLoading] = useState(false)
  const t = useTranslations('settings')
  const tc = useTranslations('common')

  const handleSave = async () => {
    if (!displayName.trim()) { toast.error(t('displayNameRequired')); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName })
      .eq('id', profile.id)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success(t('saved'))
    router.refresh()
  }

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme)
    const supabase = createClient()
    await supabase
      .from('users')
      .update({ theme: newTheme })
      .eq('id', profile.id)
  }

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    // Save to DB (fire-and-forget)
    const supabase = createClient()
    supabase.from('users').update({ language: lang }).eq('id', profile.id).then()
    // Redirect to API which sets cookie server-side, then redirects back
    window.location.href = `/api/locale?lang=${lang}&redirect=${encodeURIComponent('/settings')}`
  }

  const handleResetMfa = async () => {
    const supabase = createClient()
    const factors = await supabase.auth.mfa.listFactors()
    const totp = factors.data?.totp?.[0]
    if (!totp) { toast.info(t('mfaNotSet')); return }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id })
    if (error) { toast.error(error.message); return }
    toast.success(t('mfaResetSuccess'))
    router.push('/login')
  }

  return (
    <div className="max-w-lg space-y-8">
      {/* Profile */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
        <h3 className="font-medium text-slate-800 dark:text-slate-200">{t('profile')}</h3>
        <div>
          <label htmlFor="settings-email" className="text-sm text-slate-600 dark:text-slate-400">Email</label>
          <Input id="settings-email" value={profile?.email ?? ''} disabled className="mt-1 bg-slate-50 dark:bg-slate-900" />
        </div>
        <div>
          <label htmlFor="settings-name" className="text-sm text-slate-600 dark:text-slate-400">{t('displayName')}</label>
          <Input id="settings-name" value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1" />
        </div>
        <div className="flex gap-3 text-sm text-slate-500">
          <span>{t('role')}{profile?.role}</span>
          <span>·</span>
          <span>{t('employmentType')}{profile?.employment_type ?? '—'}</span>
        </div>
        <Button onClick={handleSave} disabled={loading} className="min-h-[44px]">
          <Save size={15} className="mr-1.5" />
          {loading ? tc('saving') : t('saveChanges')}
        </Button>
      </div>

      {/* Theme */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
        <h3 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />} {t('theme')}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => handleThemeChange('light')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer min-h-[44px] ${
              theme !== 'dark'
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            <Sun size={16} /> {t('themeLight')}
          </button>
          <button
            onClick={() => handleThemeChange('dark')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer min-h-[44px] ${
              theme === 'dark'
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            <Moon size={16} /> {t('themeDark')}
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
        <h3 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Globe size={16} /> {t('language')}
        </h3>
        <Select value={language} onValueChange={handleLanguageChange}>
          <SelectTrigger className="max-w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-TW">繁體中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ja">日本語</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* MFA */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
        <h3 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Shield size={16} /> {t('mfa')}
        </h3>
        <p className="text-sm text-slate-500">{t('mfaResetDescription')}</p>
        <Button variant="outline" onClick={handleResetMfa} className="min-h-[44px] text-red-600 border-red-200 hover:bg-red-50">
          {t('mfaReset')}
        </Button>
      </div>
    </div>
  )
}
