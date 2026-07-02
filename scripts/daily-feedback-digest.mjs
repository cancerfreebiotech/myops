#!/usr/bin/env node
/**
 * 每日 Feedback 彙整 — 寄給 pohan.chen@cancerfree.io
 * 排程：每日 20:00 Asia/Taipei
 * 用法：node scripts/daily-feedback-digest.mjs
 */
import { readFileSync } from 'fs'
import { request } from 'https'

const PROJECT_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

function getVal(src, key) {
  const m = src.match(new RegExp('^' + key + '=["\']?([^"\'\\n]+)["\']?', 'm'))
  return m ? m[1].trim().replace(/["']+$/, '').replace(/^["']+/, '') : null
}

const envLocal = readFileSync(`${PROJECT_ROOT}/.env.local`, 'utf8')
const envNotify = readFileSync(`${process.env.HOME}/.claude/notify-release.env`, 'utf8')

const SERVICE_KEY = getVal(envLocal, 'SUPABASE_SERVICE_ROLE_KEY')
const SENDGRID_KEY = getVal(envNotify, 'SENDGRID_API_KEY')
const FROM_EMAIL = getVal(envNotify, 'SENDGRID_FROM_EMAIL')
const TO_EMAIL = 'pohan.chen@cancerfree.io'
const SUPABASE_HOST = 'odzwvkhdrahomgqwlwba.supabase.co'

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

function sendEmail(subject, html) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: { email: FROM_EMAIL, name: 'Po-Han Chen (myOPS)' },
      reply_to: { email: TO_EMAIL },
      subject,
      content: [{ type: 'text/html', value: html }],
      personalizations: [{ to: [{ email: TO_EMAIL }] }]
    })
    const opts = {
      hostname: 'api.sendgrid.com',
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + SENDGRID_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }
    const req = request(opts, res => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// Asia/Taipei 今天 00:00 UTC
const now = new Date()
const taipeiOffset = 8 * 60
const localMs = now.getTime() + (now.getTimezoneOffset() + taipeiOffset) * 60000
const todayTaipei = new Date(localMs)
todayTaipei.setHours(0, 0, 0, 0)
const todayUtc = new Date(todayTaipei.getTime() - taipeiOffset * 60000)
const todayIso = todayUtc.toISOString()

const dateLabel = `${todayTaipei.getFullYear()}-${String(todayTaipei.getMonth()+1).padStart(2,'0')}-${String(todayTaipei.getDate()).padStart(2,'0')}`

const [todayRows, allRows] = await Promise.all([
  pgFetch(`/rest/v1/feedback?select=*&created_at=gte.${todayIso}&order=created_at.asc`),
  pgFetch(`/rest/v1/feedback?select=id`)
])

const totalCount = Array.isArray(allRows) ? allRows.length : '?'
const todayFeedback = Array.isArray(todayRows) ? todayRows : []

let subject, html

if (todayFeedback.length === 0) {
  subject = `myOPS 今日無新 Feedback（${dateLabel}）`
  html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#222;max-width:600px">
    <p>Po-Han，</p>
    <p>今日（${dateLabel}）尚無新的使用者回饋。</p>
    <p style="color:#888;font-size:0.9em">累計總筆數：${totalCount} 筆</p>
    <p style="color:#aaa;font-size:0.85em;margin-top:2em">— myOPS 自動彙整（每日 20:00）</p>
  </div>`
} else {
  subject = `myOPS 今日 Feedback 彙整：${todayFeedback.length} 筆（${dateLabel}）`
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
    <p style="color:#888;font-size:0.9em">累計總筆數：${totalCount} 筆</p>
    <p style="color:#aaa;font-size:0.85em;margin-top:2em">— myOPS 自動彙整（每日 20:00）</p>
  </div>`
}

const status = await sendEmail(subject, html)
console.log(`[${dateLabel}] 今日回饋：${todayFeedback.length} 筆，寄送狀態：HTTP ${status}`)
