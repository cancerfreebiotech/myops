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
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Search } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, '必填'),
  aliases: z.string(), // comma-separated
})
type FormValues = z.infer<typeof schema>

export function CompaniesManager({ companies }: { companies: any[] }) {
  const router = useRouter()
  const [editCompany, setEditCompany] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', aliases: '' },
  })

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.aliases?.some((a: string) => a.toLowerCase().includes(search.toLowerCase()))
  )

  const openEdit = (company: any) => {
    setEditCompany(company)
    form.reset({ name: company.name, aliases: (company.aliases ?? []).join(', ') })
    setShowForm(true)
  }

  const openCreate = () => {
    setEditCompany(null)
    form.reset({ name: '', aliases: '' })
    setShowForm(true)
  }

  const onSubmit = async (values: FormValues) => {
    const aliases = values.aliases.split(',').map(a => a.trim()).filter(Boolean)
    const payload = { name: values.name, aliases }
    const url = editCompany ? `/api/admin/companies/${editCompany.id}` : '/api/admin/companies'
    const method = editCompany ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error ?? '儲存失敗')
      return
    }
    toast.success(editCompany ? '公司已更新' : '公司已新增')
    setShowForm(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="搜尋公司名稱或別名..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openCreate} className="min-h-[44px]">
          <Plus size={16} className="mr-1" /> 新增公司
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800">
              <TableHead>公司名稱</TableHead>
              <TableHead>別名</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-8">無資料</TableCell></TableRow>
            ) : filtered.map(company => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(company.aliases ?? []).map((alias: string) => (
                      <Badge key={alias} variant="secondary" className="text-xs">{alias}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(company)} className="min-w-[44px] min-h-[44px]">
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
            <DialogTitle>{editCompany ? '編輯公司' : '新增公司'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>公司名稱</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="aliases" render={({ field }) => (
                <FormItem>
                  <FormLabel>別名（用逗號分隔，可空白）</FormLabel>
                  <FormControl><Input {...field} placeholder="例：CancerFree, CF Biotech" /></FormControl>
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
