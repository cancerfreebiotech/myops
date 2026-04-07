'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { FEATURE_KEYS } from '@/lib/features'
import { useTranslations } from 'next-intl'

const schema = z.object({
  department_id: z.string().nullable(),
  role: z.enum(['member', 'admin']),
  employment_type: z.enum(['full_time', 'intern']),
  work_region: z.enum(['TW', 'JP', 'US', 'OTHER']),
  manager_id: z.string().nullable(),
  deputy_approver_id: z.string().nullable(),
  is_active: z.boolean(),
  granted_features: z.array(z.string()),
})

type FormValues = z.infer<typeof schema>

interface UserEditFormProps {
  user: any
  departments: any[]
  allUsers: any[]
  onClose: () => void
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理員',
  member: '一般員工',
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: '正職',
  intern: '實習生',
}

const REGION_LABELS: Record<string, string> = {
  TW: '台灣',
  JP: '日本',
  US: '美國',
  OTHER: '其他',
}

export function UserEditForm({ user, departments, allUsers, onClose }: UserEditFormProps) {
  const router = useRouter()
  const t = useTranslations('admin.users')
  const tc = useTranslations('common')
  const tFeatures = useTranslations('features')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      department_id: user.department_id ?? null,
      role: user.role,
      employment_type: user.employment_type,
      work_region: user.work_region,
      manager_id: user.manager_id ?? null,
      deputy_approver_id: user.deputy_approver_id ?? null,
      is_active: user.is_active,
      granted_features: user.granted_features ?? [],
    },
  })

  const onSubmit = async (values: FormValues) => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!res.ok) {
      toast.error('儲存失敗')
      return
    }
    toast.success('儲存成功')
    router.refresh()
    onClose()
  }

  const features = form.watch('granted_features')

  const toggleFeature = (key: string) => {
    const current = form.getValues('granted_features')
    if (current.includes(key)) {
      form.setValue('granted_features', current.filter(f => f !== key))
    } else {
      form.setValue('granted_features', [...current, key])
    }
  }

  const otherUsers = allUsers.filter(u => u.id !== user.id)

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {user.display_name} <span className="text-slate-400 font-normal">({user.email})</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* 部門 */}
          <FormField control={form.control} name="department_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('department')}</FormLabel>
              <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || null)}>
                <FormControl>
                  <SelectTrigger>
                    <span className="truncate text-sm">
                      {field.value
                        ? (departments.find(d => d.id === field.value)?.name ?? field.value)
                        : <span className="text-slate-400">無</span>}
                    </span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="">無</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          {/* 角色 */}
          <FormField control={form.control} name="role" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('role')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <span className="text-sm">{ROLE_LABELS[field.value] ?? field.value}</span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          {/* 僱用類型 */}
          <FormField control={form.control} name="employment_type" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('employmentType')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <span className="text-sm">{EMPLOYMENT_LABELS[field.value] ?? field.value}</span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(EMPLOYMENT_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          {/* 工作地區 */}
          <FormField control={form.control} name="work_region" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('workRegion')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <span className="text-sm">{REGION_LABELS[field.value] ?? field.value}</span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(REGION_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          {/* 直屬主管 */}
          <FormField control={form.control} name="manager_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('manager')}</FormLabel>
              <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || null)}>
                <FormControl>
                  <SelectTrigger>
                    <span className="truncate text-sm">
                      {field.value
                        ? (() => { const u = otherUsers.find(u => u.id === field.value); return u?.display_name ?? u?.email ?? field.value })()
                        : <span className="text-slate-400">無</span>}
                    </span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="">無</SelectItem>
                  {otherUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          {/* 代理審核人 */}
          <FormField control={form.control} name="deputy_approver_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('deputyApprover')}</FormLabel>
              <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || null)}>
                <FormControl>
                  <SelectTrigger>
                    <span className="truncate text-sm">
                      {field.value
                        ? (() => { const u = otherUsers.find(u => u.id === field.value); return u?.display_name ?? u?.email ?? field.value })()
                        : <span className="text-slate-400">無</span>}
                    </span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="">無</SelectItem>
                  {otherUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          {/* 狀態 */}
          <FormField control={form.control} name="is_active" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('status')}</FormLabel>
              <Select value={field.value ? 'true' : 'false'} onValueChange={v => field.onChange(v === 'true')}>
                <FormControl>
                  <SelectTrigger>
                    <span className="text-sm">{field.value ? '在職' : '離職（停用）'}</span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="true">在職</SelectItem>
                  <SelectItem value="false">離職（停用）</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>

        {/* 授權功能 */}
        <div>
          <FormLabel className="text-sm">{t('grantedFeatures')}</FormLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {FEATURE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleFeature(key)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors min-h-[36px] ${
                  features.includes(key)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600'
                }`}
              >
                {tFeatures(key)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? tc('saving') : tc('save')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
