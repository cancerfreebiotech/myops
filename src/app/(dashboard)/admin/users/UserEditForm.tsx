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
          <FormField control={form.control} name="department_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('department')}</FormLabel>
              <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || null)}>
                <FormControl><SelectTrigger><SelectValue placeholder={t('department')} /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="">無</SelectItem>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          <FormField control={form.control} name="role" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('role')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="member">一般成員</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          <FormField control={form.control} name="employment_type" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('employmentType')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="full_time">正職</SelectItem>
                  <SelectItem value="intern">實習生</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          <FormField control={form.control} name="work_region" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('workRegion')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="TW">台灣</SelectItem>
                  <SelectItem value="JP">日本</SelectItem>
                  <SelectItem value="US">美國</SelectItem>
                  <SelectItem value="OTHER">其他</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          <FormField control={form.control} name="manager_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('manager')}</FormLabel>
              <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || null)}>
                <FormControl><SelectTrigger><SelectValue placeholder={t('manager')} /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="">無</SelectItem>
                  {otherUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          <FormField control={form.control} name="deputy_approver_id" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('deputyApprover')}</FormLabel>
              <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || null)}>
                <FormControl><SelectTrigger><SelectValue placeholder={t('deputyApprover')} /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="">無</SelectItem>
                  {otherUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          <FormField control={form.control} name="is_active" render={({ field }) => (
            <FormItem>
              <FormLabel>{t('status')}</FormLabel>
              <Select value={field.value ? 'true' : 'false'} onValueChange={v => field.onChange(v === 'true')}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="true">在職</SelectItem>
                  <SelectItem value="false">離職（停用）</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>

        {/* Granted Features */}
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
