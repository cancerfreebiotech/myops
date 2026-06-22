'use client'

import Link from 'next/link'

interface NoPermissionPageProps {
  /** 顯示在詩詞下方的說明，預設為通用訊息 */
  message?: string
}

export function NoPermissionPage({ message }: NoPermissionPageProps) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center overflow-hidden select-none">

      {/* 宣紙背景 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, #e8e0d0 0%, #f0ebe0 40%, #f5f0e8 100%)',
        }}
      />

      {/* 水墨暈染紋理 */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `
            radial-gradient(ellipse 80% 40% at 20% 80%, #c4b89a40 0%, transparent 60%),
            radial-gradient(ellipse 60% 30% at 80% 20%, #b8c4c840 0%, transparent 50%),
            radial-gradient(ellipse 40% 20% at 50% 10%, #a0b0bc50 0%, transparent 40%)
          `,
        }}
      />

      {/* 遠山 SVG */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 1200 340"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 最遠山 */}
        <path
          d="M0,280 Q150,180 280,220 Q380,160 480,200 Q560,150 640,190 Q720,140 820,180 Q920,130 1020,170 Q1100,150 1200,200 L1200,340 L0,340 Z"
          fill="#b8c4cc"
          opacity="0.25"
        />
        {/* 中遠山 */}
        <path
          d="M0,300 Q100,240 200,260 Q320,210 420,250 Q500,200 600,240 Q700,195 800,235 Q900,200 1000,230 Q1100,210 1200,250 L1200,340 L0,340 Z"
          fill="#9aacb4"
          opacity="0.30"
        />
        {/* 近山 */}
        <path
          d="M0,320 Q80,290 160,305 Q260,270 360,295 Q440,265 540,285 Q640,260 740,282 Q840,265 940,285 Q1040,270 1140,295 Q1180,300 1200,310 L1200,340 L0,340 Z"
          fill="#7a9298"
          opacity="0.35"
        />
        {/* 霧氣 */}
        <rect x="0" y="200" width="1200" height="60" fill="url(#mist)" opacity="0.5" />
        <defs>
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0ebe0" stopOpacity="0" />
            <stop offset="50%" stopColor="#e8e0d0" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#f0ebe0" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* 竹枝（左上角） */}
      <svg
        className="absolute top-0 left-0 w-64 h-64 opacity-20"
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="30" y1="200" x2="60" y2="0" stroke="#4a5040" strokeWidth="3" strokeLinecap="round" />
        <line x1="60" y1="200" x2="85" y2="10" stroke="#4a5040" strokeWidth="2.5" strokeLinecap="round" />
        {[20,50,80,110,140,170].map((y, i) => (
          <g key={i}>
            <ellipse cx={30 + (200-y)*0.15} cy={y} rx={18} ry={7} fill="#5a6448" transform={`rotate(-30,${30+(200-y)*0.15},${y})`} />
          </g>
        ))}
        {[10,40,70,100,130].map((y, i) => (
          <g key={i}>
            <ellipse cx={60 + (200-y)*0.12} cy={y} rx={15} ry={6} fill="#5a6448" transform={`rotate(25,${60+(200-y)*0.12},${y})`} />
          </g>
        ))}
      </svg>

      {/* 主內容 */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 py-12 max-w-lg text-center">

        {/* 柴扉 SVG */}
        <svg width="120" height="100" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
          {/* 門柱左 */}
          <rect x="8" y="10" width="8" height="85" rx="2" fill="#6b5744" />
          {/* 門柱右 */}
          <rect x="104" y="10" width="8" height="85" rx="2" fill="#6b5744" />
          {/* 橫樑 */}
          <rect x="8" y="10" width="104" height="7" rx="2" fill="#5a4835" />
          {/* 左扇門（半掩） */}
          <rect x="18" y="18" width="35" height="72" rx="1" fill="#8b6f47" opacity="0.85" />
          <line x1="26" y1="22" x2="26" y2="86" stroke="#6b5744" strokeWidth="1.5" />
          <line x1="34" y1="22" x2="34" y2="86" stroke="#6b5744" strokeWidth="1.5" />
          <line x1="42" y1="22" x2="42" y2="86" stroke="#6b5744" strokeWidth="1.5" />
          <line x1="18" y1="54" x2="53" y2="54" stroke="#6b5744" strokeWidth="2" />
          {/* 右扇門（微開） */}
          <rect x="67" y="18" width="35" height="72" rx="1" fill="#8b6f47" opacity="0.85"
            transform="skewX(-4) translate(2,0)" />
          <line x1="75" y1="22" x2="75" y2="86" stroke="#6b5744" strokeWidth="1.5" />
          <line x1="83" y1="22" x2="83" y2="86" stroke="#6b5744" strokeWidth="1.5" />
          <line x1="91" y1="22" x2="91" y2="86" stroke="#6b5744" strokeWidth="1.5" />
          <line x1="67" y1="54" x2="102" y2="54" stroke="#6b5744" strokeWidth="2" />
          {/* 門鎖 */}
          <circle cx="53" cy="55" r="3" fill="#c8a96e" />
          <circle cx="67" cy="55" r="3" fill="#c8a96e" />
          {/* 苔痕（地面） */}
          <ellipse cx="60" cy="95" rx="42" ry="4" fill="#7c9a72" opacity="0.25" />
        </svg>

        {/* 詩 */}
        <div
          className="flex flex-col gap-1.5 items-center"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {[
            '應憐屐齒印蒼苔',
            '小扣柴扉久不開',
            '春色滿園關不住',
            '一枝紅杏出牆來',
          ].map((line) => (
            <p
              key={line}
              className="text-lg tracking-[0.25em]"
              style={{ color: '#3d3328', letterSpacing: '0.25em' }}
            >
              {line}
            </p>
          ))}
          <p
            className="text-xs tracking-widest mt-1"
            style={{ color: '#8a7a68' }}
          >
            ── 葉紹翁《遊園不值》
          </p>
        </div>

        {/* 分隔線 */}
        <div className="flex items-center gap-3 w-48 opacity-40">
          <div className="flex-1 h-px" style={{ background: '#6b5744' }} />
          <span style={{ color: '#6b5744', fontSize: '10px' }}>✦</span>
          <div className="flex-1 h-px" style={{ background: '#6b5744' }} />
        </div>

        {/* 說明文字 */}
        <div className="flex flex-col items-center gap-1.5">
          <p
            className="text-sm font-medium tracking-wide"
            style={{ color: '#4a3f35' }}
          >
            {message ?? '您尚未取得此頁面的存取權限'}
          </p>
          <p className="text-xs" style={{ color: '#8a7a68' }}>
            請聯絡系統管理員開通權限
          </p>
        </div>

        {/* 返回按鈕 */}
        <Link
          href="/"
          className="px-6 py-2 text-sm tracking-widest border transition-colors duration-200"
          style={{
            color: '#6b5744',
            borderColor: '#b8a090',
            background: 'rgba(240,235,228,0.7)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(180,140,100,0.15)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(240,235,228,0.7)'
          }}
        >
          返　回
        </Link>
      </div>
    </div>
  )
}
