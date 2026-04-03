export function Footer() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'
  const deployTimeRaw = process.env.NEXT_PUBLIC_DEPLOY_TIME ?? ''

  let deployTime = ''
  if (deployTimeRaw) {
    // NEXT_PUBLIC_DEPLOY_TIME is UTC (e.g. "2026-04-03 13:11"), convert to Taipei (UTC+8)
    const utc = new Date(deployTimeRaw.replace(' ', 'T') + ':00Z')
    const taipei = new Date(utc.getTime() + 8 * 60 * 60 * 1000)
    deployTime = taipei.toISOString().slice(0, 16).replace('T', ' ')
  }

  return (
    <footer className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
      <p className="text-xs text-slate-400 dark:text-slate-500">v{version}</p>
      {deployTime && (
        <p className="text-xs text-slate-300 dark:text-slate-600">{deployTime}</p>
      )}
    </footer>
  )
}
