'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { Sun, Moon, Globe, ChevronLeft, Smartphone, QrCode, KeyRound, CheckCircle2, Monitor, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const LANGUAGES = ['zh-TW', 'en', 'ja'] as const
type Locale = typeof LANGUAGES[number]

const LANG_LABELS: Record<Locale, string> = {
  'zh-TW': '中文',
  'en': 'EN',
  'ja': '日本語',
}

type Step = {
  icon: React.ReactNode
  title: string
  desc: string
  badge?: string
  sub?: string[]
}

type Content = {
  title: string
  subtitle: string
  backToLogin: string
  appsTitle: string
  appsDesc: string
  firstTimeBadge: string
  subsequentBadge: string
  steps: Step[]
}

const CONTENT: Record<Locale, Content> = {
  'zh-TW': {
    title: 'Quick Start',
    subtitle: '5 分鐘完成首次登入',
    backToLogin: '返回登入頁',
    appsTitle: '推薦驗證器 App',
    appsDesc: 'Google Authenticator 或 Microsoft Authenticator（免費，App Store / Google Play 可下載）',
    firstTimeBadge: '首次登入',
    subsequentBadge: '後續每次',
    steps: [
      {
        icon: <Monitor size={20} />,
        title: '開啟系統',
        desc: '使用瀏覽器前往 ops.cancerfree.io',
      },
      {
        icon: <ChevronLeft size={20} className="rotate-180" />,
        title: '點擊登入',
        desc: '點擊「使用 Microsoft 帳號登入」按鈕',
      },
      {
        icon: <ShieldCheck size={20} />,
        title: 'Microsoft 帳號驗證',
        desc: '在 Microsoft 登入頁面輸入公司 Email 與密碼，若公司有條件式存取政策請依指示完成',
      },
      {
        icon: <QrCode size={20} />,
        title: '設定雙因素驗證 MFA',
        desc: '首次登入後系統會要求設定 MFA，保護帳號安全：',
        badge: '首次登入',
        sub: [
          '手機安裝驗證器 App（Google Authenticator 或 Microsoft Authenticator）',
          '用 App 掃描畫面上的 QR Code',
          '輸入 App 顯示的 6 位數字',
          '點擊「驗證」完成設定',
        ],
      },
      {
        icon: <KeyRound size={20} />,
        title: '輸入 MFA 驗證碼',
        desc: '設定完成後，每次登入都需要輸入一次性驗證碼：',
        badge: '後續每次',
        sub: [
          '開啟手機驗證器 App',
          '輸入 App 目前顯示的 6 位數字（每 30 秒更新）',
          '點擊「驗證」',
        ],
      },
      {
        icon: <CheckCircle2 size={20} />,
        title: '登入完成',
        desc: '歡迎使用 myOPS！你已成功登入，可以開始使用系統。',
      },
    ],
  },

  'en': {
    title: 'Quick Start',
    subtitle: 'Get logged in within 5 minutes',
    backToLogin: 'Back to Login',
    appsTitle: 'Recommended Authenticator Apps',
    appsDesc: 'Google Authenticator or Microsoft Authenticator (free, available on App Store / Google Play)',
    firstTimeBadge: 'First Login',
    subsequentBadge: 'Every Login',
    steps: [
      {
        icon: <Monitor size={20} />,
        title: 'Open the System',
        desc: 'Navigate to ops.cancerfree.io in your browser',
      },
      {
        icon: <ChevronLeft size={20} className="rotate-180" />,
        title: 'Click Sign In',
        desc: 'Click the "Sign in with Microsoft" button',
      },
      {
        icon: <ShieldCheck size={20} />,
        title: 'Microsoft Account Verification',
        desc: 'Enter your company email and password on the Microsoft login page. Follow any additional prompts from your company\'s conditional access policy.',
      },
      {
        icon: <QrCode size={20} />,
        title: 'Set Up MFA (Two-Factor Authentication)',
        desc: 'On first login, you\'ll be prompted to set up MFA to protect your account:',
        badge: 'First Login',
        sub: [
          'Install an authenticator app on your phone (Google Authenticator or Microsoft Authenticator)',
          'Scan the QR code shown on screen using the app',
          'Enter the 6-digit code displayed in the app',
          'Click "Verify" to complete setup',
        ],
      },
      {
        icon: <KeyRound size={20} />,
        title: 'Enter MFA Code',
        desc: 'After setup, you\'ll need to enter a one-time code each time you log in:',
        badge: 'Every Login',
        sub: [
          'Open your authenticator app',
          'Enter the 6-digit code currently shown (refreshes every 30 seconds)',
          'Click "Verify"',
        ],
      },
      {
        icon: <CheckCircle2 size={20} />,
        title: 'You\'re In!',
        desc: 'Welcome to myOPS! You have successfully logged in and can start using the system.',
      },
    ],
  },

  'ja': {
    title: 'クイックスタート',
    subtitle: '5分で初回ログインを完了',
    backToLogin: 'ログインページに戻る',
    appsTitle: '推奨認証アプリ',
    appsDesc: 'Google Authenticator または Microsoft Authenticator（無料、App Store / Google Play でダウンロード可能）',
    firstTimeBadge: '初回ログイン',
    subsequentBadge: '毎回のログイン',
    steps: [
      {
        icon: <Monitor size={20} />,
        title: 'システムを開く',
        desc: 'ブラウザで ops.cancerfree.io にアクセスしてください',
      },
      {
        icon: <ChevronLeft size={20} className="rotate-180" />,
        title: 'ログインをクリック',
        desc: '「Microsoftアカウントでサインイン」ボタンをクリックしてください',
      },
      {
        icon: <ShieldCheck size={20} />,
        title: 'Microsoftアカウント認証',
        desc: 'Microsoftログインページで会社のメールアドレスとパスワードを入力してください。条件付きアクセスポリシーがある場合は、指示に従ってください。',
      },
      {
        icon: <QrCode size={20} />,
        title: 'MFA（二要素認証）の設定',
        desc: '初回ログイン後、アカウントを保護するためMFAの設定が必要です：',
        badge: '初回ログイン',
        sub: [
          'スマートフォンに認証アプリをインストール（Google Authenticator または Microsoft Authenticator）',
          '画面に表示されたQRコードをアプリでスキャン',
          'アプリに表示された6桁のコードを入力',
          '「確認」をクリックして設定完了',
        ],
      },
      {
        icon: <KeyRound size={20} />,
        title: 'MFAコードを入力',
        desc: '設定後、ログインのたびにワンタイムコードの入力が必要です：',
        badge: '毎回のログイン',
        sub: [
          '認証アプリを開く',
          '現在表示されている6桁のコードを入力（30秒ごとに更新）',
          '「確認」をクリック',
        ],
      },
      {
        icon: <CheckCircle2 size={20} />,
        title: 'ログイン完了',
        desc: 'myOPSへようこそ！ログインに成功しました。システムをご利用いただけます。',
      },
    ],
  },
}

const BADGE_COLOR: Record<string, string> = {
  '首次登入': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'First Login': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  '初回ログイン': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  '後續每次': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Every Login': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  '毎回のログイン': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
}

function getCookieLocale(): Locale {
  if (typeof document === 'undefined') return 'zh-TW'
  const match = document.cookie.match(/MYOPS_LOCALE=([^;]+)/)
  const val = match?.[1]
  return (LANGUAGES as readonly string[]).includes(val ?? '') ? (val as Locale) : 'zh-TW'
}

export default function QuickStartPage() {
  const { theme, setTheme } = useTheme()
  const [locale, setLocale] = useState<Locale>('zh-TW')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setLocale(getCookieLocale())
  }, [])

  const content = CONTENT[locale]

  const handleLanguageChange = (lang: Locale) => {
    document.cookie = `MYOPS_LOCALE=${lang}; path=/; max-age=31536000; SameSite=Lax`
    setLocale(lang)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-slate-800 dark:text-slate-200 font-[Lexend]">myOPS</span>
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-slate-400" aria-hidden />
            <div className="flex items-center gap-0.5">
              {LANGUAGES.map(lang => (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium transition-colors',
                    locale === lang
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  )}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle theme"
            >
              {mounted && theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 pb-16">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-[Lexend]">
            {content.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{content.subtitle}</p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {content.steps.map((step, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5"
            >
              <div className="flex items-start gap-4">
                {/* Step number + icon */}
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                    {i + 1}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-slate-800 dark:text-slate-200">{step.title}</h2>
                    {step.badge && (
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', BADGE_COLOR[step.badge])}>
                        {step.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{step.desc}</p>
                  {step.sub && (
                    <ol className="mt-3 space-y-2">
                      {step.sub.map((s, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs shrink-0 mt-0.5">
                            {j + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recommended apps */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Smartphone size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">{content.appsTitle}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{content.appsDesc}</p>
            </div>
          </div>
        </div>

        {/* Back to login */}
        <div className="mt-8 flex justify-center">
          <Link
            href="/login"
            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ChevronLeft size={16} />
            {content.backToLogin}
          </Link>
        </div>
      </main>
    </div>
  )
}
