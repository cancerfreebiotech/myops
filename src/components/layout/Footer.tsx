export function Footer() {
  const author = process.env.NEXT_PUBLIC_AUTHOR_NAME ?? '坂本'
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'
  const deployTimeRaw = process.env.NEXT_PUBLIC_DEPLOY_TIME ?? ''

  let deployTime = ''
  if (deployTimeRaw) {
    // NEXT_PUBLIC_DEPLOY_TIME is UTC (e.g. "2026-04-03 13:11"), convert to Taipei (UTC+8)
    const utc = new Date(deployTimeRaw.replace(' ', 'T') + ':00Z')
    const taipei = new Date(utc.getTime() + 8 * 60 * 60 * 1000)
    deployTime = taipei.toISOString().slice(0, 16).replace('T', ' ')
  }

  // PRD-mandated format: 坂本  |  v{version}  |  Deployed: {YYYY-MM-DD HH:mm}
  const text = `${author}  |  v${version}${deployTime ? `  |  Deployed: ${deployTime}` : ''}`

  return (
    <footer className="mt-8 border-t border-border px-4 py-3">
      <p className="whitespace-pre-wrap text-center text-xs text-muted-foreground">{text}</p>
    </footer>
  )
}
