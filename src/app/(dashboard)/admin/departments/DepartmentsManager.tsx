'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Plus, Pencil } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, '必填'),
  code: z.string().min(1, '必填').max(10).toUpperCase(),
})
type FormValues = z.infer<typeof schema>

export function DepartmentsManager({ departments }: { departments: any[] }) {
  const router = useRouter()
  const [editDept, setEditDept] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '' },
  })

  const openEdit = (dept: any) => {
    setEditDept(dept)
    form.reset({ name: dept.name, code: dept.code })
    setShowForm(true)
  }

  const openCreate = () => {
    setEditDept(null)
    form.reset({ name: '', code: '' })
    setShowForm(true)
  }

  const onSubmit = async (values: FormValues) => {
    const url = editDept ? `/api/admin/departments/${editDept.id}` : '/api/admin/departments'
    const method = editDept ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error ?? '儲存失敗')
      return
    }
    toast.success(editDept ? '部門已更新' : '部門已新增')
    setShowForm(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate} className="min-h-[44px]">
          <Plus size={16} className="mr-1" /> 新增部門
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800">
              <TableHead>代號</TableHead>
              <TableHead>部門名稱</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map(dept => (
              <TableRow key={dept.id}>
                <TableCell className="font-mono font-medium text-slate-600 dark:text-slate-400">{dept.code}</TableCell>
                <TableCell>{dept.name}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(dept)} className="min-w-[44px] min-h-[44px]">
                    <Pencil size={15} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDept ? '編輯部門' : '新增部門'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>部門名稱</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>代號（英文大寫）</FormLabel>
                  <FormControl><Input {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} className="font-mono" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>取消</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? '儲存中...' : '儲存'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
