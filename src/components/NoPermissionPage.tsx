'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}
const useMounted = () => useSyncExternalStore(emptySubscribe, () => true, () => false)

interface NoPermissionPageProps {
  message?: string
}

export function NoPermissionPage({ message }: NoPermissionPageProps) {
  const { resolvedTheme } = useTheme()
  const mounted = useMounted()
  const dark = mounted && resolvedTheme === 'dark'

  const bg = dark
    ? 'radial-gradient(ellipse at 50% 30%, #1a2332 0%, #111c2a 40%, #0d1520 100%)'
    : 'radial-gradient(ellipse at 50% 30%, #e8e0d0 0%, #f0ebe0 40%, #f5f0e8 100%)'

  const inkOverlay = dark
    ? `radial-gradient(ellipse 80% 40% at 20% 80%, #0a1a2a60 0%, transparent 60%),
       radial-gradient(ellipse 60% 30% at 80% 20%, #1a2a3840 0%, transparent 50%),
       radial-gradient(ellipse 40% 20% at 50% 10%, #0d1e2e50 0%, transparent 40%)`
    : `radial-gradient(ellipse 80% 40% at 20% 80%, #c4b89a40 0%, transparent 60%),
       radial-gradient(ellipse 60% 30% at 80% 20%, #b8c4c840 0%, transparent 50%),
       radial-gradient(ellipse 40% 20% at 50% 10%, #a0b0bc50 0%, transparent 40%)`

  const mountainFar   = dark ? '#1e3a4a' : '#b8c4cc'
  const mountainMid   = dark ? '#162e3c' : '#9aacb4'
  const mountainNear  = dark ? '#0e2030' : '#7a9298'
  const mistColor     = dark ? '#111c2a' : '#f0ebe0'
  const gateColor     = dark ? '#8b7355' : '#6b5744'
  const gateLight     = dark ? '#a08060' : '#8b6f47'
  const gateDark      = dark ? '#6b5035' : '#5a4835'
  const gateGold      = dark ? '#d4b07a' : '#c8a96e'
  const bambooColor   = dark ? '#3a4a30' : '#4a5040'
  const bambooLeaf    = dark ? '#4a5a38' : '#5a6448'
  const mossColor     = dark ? '#2a4a38' : '#7c9a72'
  const textPrimary   = dark ? '#e8dcc8' : '#3d3328'
  const textSecond    = dark ? '#8a9a88' : '#8a7a68'
  const textMuted     = dark ? '#6a7a78' : '#8a7a68'
  const dividerColor  = dark ? '#4a5a50' : '#6b5744'
  const btnBorder     = dark ? '#5a6a60' : '#b8a090'
  const btnBg         = dark ? 'rgba(20,35,45,0.7)' : 'rgba(240,235,228,0.7)'
  const btnBgHover    = dark ? 'rgba(40,65,55,0.5)' : 'rgba(180,140,100,0.15)'
  const btnText       = dark ? '#a0b8a8' : '#6b5744'

  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ minHeight: 'calc(100dvh - 4rem)' }}
    >
      {/* 背景 */}
      <div className="absolute inset-0" style={{ background: bg }} />
      <div className="absolute inset-0 opacity-30" style={{ background: inkOverlay }} />

      {/* 遠山 */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 1200 340"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0,280 Q150,180 280,220 Q380,160 480,200 Q560,150 640,190 Q720,140 820,180 Q920,130 1020,170 Q1100,150 1200,200 L1200,340 L0,340 Z" fill={mountainFar} opacity="0.35" />
        <path d="M0,300 Q100,240 200,260 Q320,210 420,250 Q500,200 600,240 Q700,195 800,235 Q900,200 1000,230 Q1100,210 1200,250 L1200,340 L0,340 Z" fill={mountainMid} opacity="0.4" />
        <path d="M0,320 Q80,290 160,305 Q260,270 360,295 Q440,265 540,285 Q640,260 740,282 Q840,265 940,285 Q1040,270 1140,295 Q1180,300 1200,310 L1200,340 L0,340 Z" fill={mountainNear} opacity="0.45" />
        <rect x="0" y="200" width="1200" height="60" fill="url(#mist)" opacity="0.5" />
        <defs>
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mistColor} stopOpacity="0" />
            <stop offset="50%" stopColor={mistColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={mistColor} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* 竹枝左上 */}
      <svg className="absolute top-0 left-0 w-40 h-40 md:w-56 md:h-56 opacity-15" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <line x1="30" y1="200" x2="60" y2="0" stroke={bambooColor} strokeWidth="3" strokeLinecap="round" />
        <line x1="60" y1="200" x2="85" y2="10" stroke={bambooColor} strokeWidth="2.5" strokeLinecap="round" />
        {[170,140,110,80,50].map((y, i) => (
          <ellipse key={i} cx={30+(200-y)*0.15} cy={y} rx={18} ry={7} fill={bambooLeaf} transform={`rotate(-30,${30+(200-y)*0.15},${y})`} />
        ))}
        {[175,145,115,85].map((y, i) => (
          <ellipse key={i} cx={60+(200-y)*0.12} cy={y} rx={15} ry={6} fill={bambooLeaf} transform={`rotate(25,${60+(200-y)*0.12},${y})`} />
        ))}
      </svg>

      {/* 主內容 */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-5 py-10 w-full max-w-sm md:max-w-md text-center">

        {/* 柴扉 */}
        <svg width="110" height="92" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" className="opacity-75 shrink-0">
          <rect x="8"   y="10" width="8"   height="85" rx="2" fill={gateColor} />
          <rect x="104" y="10" width="8"   height="85" rx="2" fill={gateColor} />
          <rect x="8"   y="10" width="104" height="7"  rx="2" fill={gateDark} />
          <rect x="18" y="18" width="35" height="72" rx="1" fill={gateLight} opacity="0.85" />
          <line x1="26" y1="22" x2="26" y2="86" stroke={gateColor} strokeWidth="1.5" />
          <line x1="34" y1="22" x2="34" y2="86" stroke={gateColor} strokeWidth="1.5" />
          <line x1="42" y1="22" x2="42" y2="86" stroke={gateColor} strokeWidth="1.5" />
          <line x1="18" y1="54" x2="53"  y2="54" stroke={gateColor} strokeWidth="2" />
          <rect x="67" y="18" width="35" height="72" rx="1" fill={gateLight} opacity="0.85" transform="skewX(-4) translate(2,0)" />
          <line x1="75" y1="22" x2="75" y2="86" stroke={gateColor} strokeWidth="1.5" />
          <line x1="83" y1="22" x2="83" y2="86" stroke={gateColor} strokeWidth="1.5" />
          <line x1="91" y1="22" x2="91" y2="86" stroke={gateColor} strokeWidth="1.5" />
          <line x1="67" y1="54" x2="102" y2="54" stroke={gateColor} strokeWidth="2" />
          <circle cx="53" cy="55" r="3" fill={gateGold} />
          <circle cx="67" cy="55" r="3" fill={gateGold} />
          <ellipse cx="60" cy="95" rx="42" ry="4" fill={mossColor} opacity="0.25" />
        </svg>

        {/* ── 說明文字 + 返回（詩的上方）── */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium tracking-wide" style={{ color: textPrimary }}>
              {message ?? '您尚未取得此頁面的存取權限'}
            </p>
            <p className="text-xs" style={{ color: textMuted }}>
              請聯絡系統管理員開通權限
            </p>
          </div>

          <Link
            href="/"
            className="px-6 py-2 text-sm tracking-widest border transition-colors duration-200 min-h-[44px] inline-flex items-center"
            style={{ color: btnText, borderColor: btnBorder, background: btnBg }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = btnBgHover }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = btnBg }}
          >
            返　回
          </Link>
        </div>

        {/* 分隔線 */}
        <div className="flex items-center gap-3 w-36 opacity-35">
          <div className="flex-1 h-px" style={{ background: dividerColor }} />
          <span style={{ color: dividerColor, fontSize: '10px' }}>✦</span>
          <div className="flex-1 h-px" style={{ background: dividerColor }} />
        </div>

        {/* 詩 */}
        <div className="flex flex-col gap-1.5 items-center" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          {['應憐屐齒印蒼苔', '小扣柴扉久不開', '春色滿園關不住', '一枝紅杏出牆來'].map(line => (
            <p key={line} className="text-base md:text-lg tracking-[0.22em]" style={{ color: textPrimary }}>
              {line}
            </p>
          ))}
          <p className="text-xs tracking-widest mt-1" style={{ color: textSecond }}>
            ── 葉紹翁《遊園不值》
          </p>
        </div>

      </div>
    </div>
  )
}
