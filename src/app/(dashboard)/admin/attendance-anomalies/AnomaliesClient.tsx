'use client'

import { AlertTriangle, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Props {
  anomalies: { user: any; auto_days: number; recent_dates: string[] }[]
  internAnomalies: { user: any; missed: number }[]
}

export function AnomaliesClient({ anomalies, internAnomalies }: Props) {
  return (
    <div className="space-y-6">
      {/* Full-time auto-clock anomalies */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            正職員工連續自動補打（近 30 天 ≥ 3 次）
          </h3>
          {anomalies.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium border border-amber-200">
              {anomalies.length} 人
            </span>
          )}
        </div>
        {anomalies.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400 text-sm">
            無異常紀錄
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">員工</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">部門</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-400">自動補打天數</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">最近日期</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {anomalies.map(({ user, auto_days, recent_dates }) => (
                  <tr key={user?.id} className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{user?.display_name}</td>
                    <td className="px-4 py-3 text-slate-500">{user?.department?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-bold ${auto_days >= 5 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {auto_days} 天
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{recent_dates.join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Intern missed clock */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <UserX size={16} className="text-red-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            實習生本月漏打卡超過 3 次
          </h3>
          {internAnomalies.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium border border-red-200">
              {internAnomalies.length} 人
            </span>
          )}
        </div>
        {internAnomalies.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400 text-sm">
            無異常紀錄
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 dark:border-red-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-red-50 dark:bg-red-900/20">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-red-700 dark:text-red-400">員工</th>
                  <th className="text-center px-4 py-3 font-medium text-red-700 dark:text-red-400">本月漏打次數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 dark:divide-red-900">
                {internAnomalies.map(({ user, missed }) => (
                  <tr key={user?.id} className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{user?.display_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
                        {missed} 次
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
