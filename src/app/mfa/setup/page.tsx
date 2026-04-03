'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function MFASetupPage() {
  const router = useRouter()
  const [qrCode, setQrCode] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const enroll = async () => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error || !data) return
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
    }
    enroll()
  }, [])

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      setError('請輸入 6 位數驗證碼')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) {
      setError(challengeError.message)
      setLoading(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    })
    if (verifyError) {
      setError('驗證碼錯誤，請重試')
      setLoading(false)
      return
    }
    router.refresh()
    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">設定雙因素驗證</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">使用 Authenticator App 掃描 QR Code</p>
        </div>

        {qrCode && (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-2 rounded-lg">
              <Image src={qrCode} alt="MFA QR Code" width={180} height={180} unoptimized />
            </div>
            <p className="text-xs text-slate-400 text-center break-all">
              手動輸入密鑰：<span className="font-mono text-slate-600 dark:text-slate-300">{secret}</span>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Input
            placeholder="輸入 6 位數驗證碼"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            className="text-center text-xl tracking-widest"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <Button onClick={handleVerify} disabled={loading || code.length !== 6}>
          {loading ? '驗證中...' : '驗證並啟用'}
        </Button>
      </div>
    </div>
  )
}
