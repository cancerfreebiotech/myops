import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/daily-report/tasks?mine=true
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mine = searchParams.get('mine') !== 'false'

  let query = supabase
    .from('dr_tasks')
    .select(`
      *,
      assignees:dr_task_assignees(user:users(id, display_name, email)),
      subtasks:dr_task_subtasks(*)
    `)
    .order('created_at', { ascending: false })

  if (mine) {
    query = query.eq('dr_task_assignees.user_id', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tasks = (data ?? []).map((t: any) => ({
    ...t,
    assignees: (t.assignees ?? []).map((a: any) => a.user).filter(Boolean),
    subtasks: (t.subtasks ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }))

  return NextResponse.json({ data: tasks })
}

// POST /api/daily-report/tasks  { title, content, deadline, priority, assignee_ids, subtask_titles }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, content, deadline, priority, assignee_ids, subtask_titles } = body

  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })

  const { data: task, error: taskErr } = await service
    .from('dr_tasks')
    .insert({ title, content: content ?? '', deadline: deadline || null, priority: priority ?? 'med', created_by: user.id })
    .select()
    .single()

  if (taskErr || !task) return NextResponse.json({ error: taskErr?.message ?? 'Failed' }, { status: 500 })

  if (Array.isArray(assignee_ids) && assignee_ids.length) {
    await service.from('dr_task_assignees').insert(
      assignee_ids.map((uid: string) => ({ task_id: task.id, user_id: uid }))
    )
  }
  if (Array.isArray(subtask_titles) && subtask_titles.length) {
    await service.from('dr_task_subtasks').insert(
      subtask_titles.map((t: string, i: number) => ({ task_id: task.id, title: t, done: false, sort_order: i }))
    )
  }

  return NextResponse.json({ data: task })
}

// PATCH /api/daily-report/tasks  { id, status?, member_done?, deadline?, priority? }
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const allowed = ['status', 'member_done', 'deadline', 'priority', 'title', 'content']
  const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  const { data, error } = await supabase
    .from('dr_tasks')
    .update(filtered)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/daily-report/tasks?id=xxx  (viewer/admin only)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await service.from('dr_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: null })
}
