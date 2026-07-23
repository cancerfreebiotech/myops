interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Optional localized badge (e.g. a beta/測試中 label). Pass a translated string; omit to render no badge. */
  badge?: string
}

export function PageHeader({ title, description, actions, badge }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 font-[Lexend]">{title}</h1>
          {badge && <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 border border-yellow-400 dark:border-yellow-500 rounded px-1.5 py-0.5 leading-none">{badge}</span>}
        </div>
        {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
