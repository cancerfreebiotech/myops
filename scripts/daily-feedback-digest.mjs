#!/usr/bin/env node
/**
 * 每日 Feedback 彙整 — 寄給 pohan.chen@cancerfree.io
 * 用法：node scripts/daily-feedback-digest.mjs [--dry-run]
 *
 * ⚠️ 目前沒有任何排程在跑這支腳本（2026-07-31 查過：無 crontab、無 systemd timer、
 *    也不可能跑在 Vercel——它讀本機的 .env.local）。要每天自動寄需要另外掛排程。
 *
 * 寄信改走 FlightPath relay（與 /notify-release 同一條路）。原本直打 SendGrid，
 * 但 2026-07-23 憑證集中化之後 ~/.claude/notify-release.env 裡已經沒有
 * SENDGRID_API_KEY / SENDGRID_FROM_EMAIL 了，那條路等於是死的。
 * 憑證一律由檔案讀取，不寫在指令或程式碼裡。
 */
import { readFileSync } from 'fs'
import { request } from 'https'

const PROJECT_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DRY_RUN = process.argv.includes('--dry-run')

function getVal(src, key) {
  const m = src.match(new RegExp('^' + key + '=["\']?([^"\'\\n]+)["\']?', 'm'))
  return m ? m[1].trim().replace(/["']+$/, '').replace(/^["']+/, '') : null
}

const envLocal = readFileSync(`${PROJECT_ROOT}/.env.local`, 'utf8')
const envNotify = readFileSync(`${process.env.HOME}/.claude/notify-release.env`, 'utf8')

const SERVICE_KEY = getVal(envLocal, 'SUPABASE_SERVICE_ROLE_KEY')
const RELAY_SYSTEM = getVal(envNotify, 'FLIGHTPATH_SYSTEM_ID')
const RELAY_TOKEN = getVal(envNotify, 'FLIGHTPATH_BOT_TOKEN')
const FROM_NAME = getVal(envNotify, 'SENDGRID_FROM_NAME') ?? 'myOPS'
const TO_EMAIL = 'pohan.chen@cancerfree.io'
const SUPABASE_HOST = 'odzwvkhdrahomgqwlwba.supabase.co'

if (!DRY_RUN && (!RELAY_SYSTEM || !RELAY_TOKEN)) {
  console.error('缺少 FLIGHTPATH_SYSTEM_ID / FLIGHTPATH_BOT_TOKEN（~/.claude/notify-release.env）')
  process.exit(1)
}

function pgFetch(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: SUPABASE_HOST,
      path,
      method: 'GET',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
      }
    }
    const req = request(opts, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => resolve(JSON.parse(body)))
    })
    req.on('error', reject)
    req.end()
  })
}

/** 經 FlightPath relay 寄出（寄件位址由 relay 固定，本端只能設顯示名稱） */
function sendEmail(subject, html) {
  if (DRY_RUN) {
    console.log('--- DRY RUN ---')
    console.log('to      :', TO_EMAIL)
    console.log('subject :', subject)
    console.log('html    :', html.length, 'chars')
    return Promise.resolve('dry-run')
  }
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      system: RELAY_SYSTEM,
      to: [TO_EMAIL],
      subject,
      html,
      fromName: FROM_NAME,
      replyTo: TO_EMAIL
    })
    const opts = {
      hostname: 'drava.cancerfree.io',
      path: '/api/systems/send-email',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + RELAY_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }
    const req = request(opts, res => {
      let body = ''
      res.on('data', d => { body += d })
      // relay 失敗會回 HTTP 4xx/5xx 加上 error.code，把 body 一起印出來才查得動
      res.on('end', () => resolve(res.statusCode === 200 ? 'HTTP 200' : `HTTP ${res.statusCode} ${body}`))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// 台北時間「今天 00:00」對應的 UTC 時刻。
// 原本的寫法在本機時區已經是台北時，會把時差再減一次 → 起算點變成前一天 16:00，
// 於是前一晚的回報每天都被算成「今天的」。改成用 UTC getter 讀台北日期，
// 不依賴本機時區設定。
const TAIPEI_MS = 8 * 3600 * 1000
const taipeiNow = new Date(Date.now() + TAIPEI_MS)
const y = taipeiNow.getUTCFullYear()
const m = taipeiNow.getUTCMonth()
const d = taipeiNow.getUTCDate()
// --since=YYYY-MM-DD 可補寄漏掉的某一天（起算點＝該日台北 00:00）
const sinceArg = (process.argv.find(a => a.startsWith('--since=')) ?? '').slice(8)
const sinceMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sinceArg)
const [yy, mm, dd] = sinceMatch
  ? [Number(sinceMatch[1]), Number(sinceMatch[2]) - 1, Number(sinceMatch[3])]
  : [y, m, d]
const todayIso = new Date(Date.UTC(yy, mm, dd) - TAIPEI_MS).toISOString()

const dateLabel = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`

// 回報有兩個管道：新單（feedback）與在既有單上追加說明／回覆（feedback_comments）。
// 兩張都要查——只查 feedback 會漏掉使用者的補充需求與對提問的回覆，
// 而 feedback 沒有 updated_at，「舊單有沒有新動靜」只能靠留言的 created_at 判斷。
// （2026-07-30 就是這樣漏掉 Linda 的兩則留言，其中一則是我們在等的答案。）
const [todayRows, allRows, todayComments] = await Promise.all([
  pgFetch(`/rest/v1/feedback?select=*&created_at=gte.${todayIso}&order=created_at.asc`),
  pgFetch(`/rest/v1/feedback?select=id`),
  pgFetch(`/rest/v1/feedback_comments?select=id,body,created_at,author_id,feedback_id,feedback(id,title,status)`
    + `&created_at=gte.${todayIso}&order=created_at.asc`)
])

const totalCount = Array.isArray(allRows) ? allRows.length : '?'
const todayFeedback = Array.isArray(todayRows) ? todayRows : []
const comments = Array.isArray(todayComments) ? todayComments : []

const esc = s => String(s ?? '').replace(/</g, '&lt;')

/** 今日留言區塊；沒有留言就回空字串 */
function commentsHtml() {
  if (comments.length === 0) return ''
  const rows = comments.map(c => {
    const timeStr = new Date(c.created_at).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
    })
    const f = c.feedback ?? {}
    return `<tr>
      <td style="padding:8px 10px;border:1px solid #eee;font-size:0.85em;color:#555;white-space:nowrap">${timeStr}</td>
      <td style="padding:8px 10px;border:1px solid #eee;font-size:0.85em">
        <div><strong>${esc(f.title) || '(單子已刪除)'}</strong>
          <span style="color:#888">${esc(f.status)}</span></div>
        <div style="color:#888;font-size:0.9em">#${String(c.feedback_id ?? '').slice(0, 8)}</div>
      </td>
      <td style="padding:8px 10px;border:1px solid #eee;font-size:0.9em">${esc(c.body).replace(/\n/g, '<br>')}</td>
    </tr>`
  }).join('')
  return `<h3 style="margin:1.6em 0 0.4em;font-size:1em">既有單據的新留言（${comments.length} 則）</h3>
    <p style="color:#888;font-size:0.85em;margin:0 0 0.6em">留言不會讓單子變成「新的一筆」，但常常是補充需求或對提問的回答。</p>
    <table style="border-collapse:collapse;width:100%;font-size:0.9em">
      <thead><tr style="background:#f0f0f0">
        <th style="padding:7px 10px;border:1px solid #eee;text-align:left">時間</th>
        <th style="padding:7px 10px;border:1px solid #eee;text-align:left">單據</th>
        <th style="padding:7px 10px;border:1px solid #eee;text-align:left">留言</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

let subject, html

if (todayFeedback.length === 0) {
  // 沒有新單但有留言時，主旨也要講出來——否則「今日無新 Feedback」會讓人直接跳過這封信
  subject = comments.length > 0
    ? `myOPS 今日無新 Feedback，但有 ${comments.length} 則新留言（${dateLabel}）`
    : `myOPS 今日無新 Feedback（${dateLabel}）`
  html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#222;max-width:700px">
    <p>Po-Han，</p>
    <p>今日（${dateLabel}）尚無新的使用者回饋。</p>
    ${commentsHtml()}
    <p style="color:#888;font-size:0.9em">累計總筆數：${totalCount} 筆</p>
    <p style="color:#aaa;font-size:0.85em;margin-top:2em">— myOPS 自動彙整（每日 20:00）</p>
  </div>`
} else {
  subject = comments.length > 0
    ? `myOPS 今日 Feedback 彙整：${todayFeedback.length} 筆 + ${comments.length} 則留言（${dateLabel}）`
    : `myOPS 今日 Feedback 彙整：${todayFeedback.length} 筆（${dateLabel}）`
  const rows = todayFeedback.map((f, i) => {
    const t = new Date(f.created_at)
    const timeStr = t.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
    const keys = Object.keys(f).filter(k => k !== 'id' && k !== 'created_at' && k !== 'user_id')
    const contentHtml = keys.map(k => `<div style="margin:2px 0"><strong>${k}：</strong>${String(f[k] ?? '').replace(/</g,'&lt;')}</div>`).join('')
    return `<tr style="${i%2===0?'':'background:#f9f9f9'}">
      <td style="padding:8px 10px;border:1px solid #eee;color:#888;font-size:0.85em;white-space:nowrap">#${i+1}</td>
      <td style="padding:8px 10px;border:1px solid #eee;font-size:0.85em;color:#555">${timeStr}</td>
      <td style="padding:8px 10px;border:1px solid #eee;font-size:0.85em;color:#555">${f.user_id ?? '—'}</td>
      <td style="padding:8px 10px;border:1px solid #eee">${contentHtml}</td>
    </tr>`
  }).join('')

  html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#222;max-width:700px">
    <p>Po-Han，</p>
    <p>今日（${dateLabel}）共收到 <strong>${todayFeedback.length}</strong> 筆使用者回饋：</p>
    <table style="border-collapse:collapse;width:100%;font-size:0.9em;margin:1em 0">
      <thead>
        <tr style="background:#f0f0f0">
          <th style="padding:7px 10px;border:1px solid #eee;text-align:left">#</th>
          <th style="padding:7px 10px;border:1px solid #eee;text-align:left">時間</th>
          <th style="padding:7px 10px;border:1px solid #eee;text-align:left">使用者</th>
          <th style="padding:7px 10px;border:1px solid #eee;text-align:left">內容</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${commentsHtml()}
    <p style="color:#888;font-size:0.9em">累計總筆數：${totalCount} 筆</p>
    <p style="color:#aaa;font-size:0.85em;margin-top:2em">— myOPS 自動彙整（每日 20:00）</p>
  </div>`
}

const status = await sendEmail(subject, html)
console.log(`[${dateLabel}] 今日回饋：${todayFeedback.length} 筆、新留言 ${comments.length} 則，寄送狀態：HTTP ${status}`)
