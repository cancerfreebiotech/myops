export function Footer() {
  const author = process.env.NEXT_PUBLIC_AUTHOR_NAME ?? '坂本'
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'
  const deployTime = process.env.NEXT_PUBLIC_DEPLOY_TIME ?? ''

  return (
    <footer className="text-xs text-slate-400 dark:text-slate-600 text-center py-2 border-t border-slate-100 dark:border-slate-800">
      {author} | v{version}{deployTime ? ` | Deployed: ${deployTime}` : ''}
    </footer>
  )
}
