import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

async function getRole(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single()
  return data?.role ?? null
}

// 目前使用者可否管理此 task（admin / 建立者 / 任一 assignee 的 viewer）
async function canManageTask(supabase: SupabaseClient, userId: string, taskId: string): Promise<boolean> {
  const role = await getRole(supabase, userId)
  if (role === 'admin') return true
  const { data } = await supabase.rpc('dr_can_manage_task', { p_task_id: taskId })
  return data === true
}

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
    const { data: myAssignments, error: assignErr } = await supabase
      .from('dr_task_assignees')
      .select('task_id')
      .eq('user_id', user.id)
    if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 })
    const taskIds = (myAssignments ?? []).map(r => r.task_id)
    if (!taskIds.length) return NextResponse.json({ data: [] })
    query = query.in('id', taskIds)
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
// viewer/admin only；viewer 只能指派自己群組的 member
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, content, deadline, priority, assignee_ids, subtask_titles } = body

  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })

  const role = await getRole(supabase, user.id)
  const isAdmin = role === 'admin'

  if (!isAdmin) {
    // 必須是至少一個（未刪除）群組的 viewer
    const { data: viewerRows } = await supabase
      .from('daily_report_group_members')
      .select('group_id, group:daily_report_groups!inner(id)')
      .eq('user_id', user.id)
      .eq('role', 'viewer')
      .is('group.deleted_at', null)
    if (!viewerRows?.length) {
      return NextResponse.json({ error: 'Forbidden: viewer only' }, { status: 403 })
    }

    // 指派對象必須是自己群組的 member（或自己）
    if (Array.isArray(assignee_ids) && assignee_ids.length) {
      const groupIds = viewerRows.map(r => r.group_id)
      const { data: memberRows } = await supabase
        .from('daily_report_group_members')
        .select('user_id')
        .in('group_id', groupIds)
        .eq('role', 'member')
      const viewable = new Set((memberRows ?? []).map(r => r.user_id))
      const bad = assignee_ids.filter((id: string) => !viewable.has(id) && id !== user.id)
      if (bad.length) {
        return NextResponse.json({ error: 'Forbidden: assignee not in your groups' }, { status: 403 })
      }
    }
  }

  const { data: task, error: taskErr } = await supabase
    .from('dr_tasks')
    .insert({ title, content: content ?? '', deadline: deadline || null, priority: priority ?? 'med', created_by: user.id })
    .select()
    .single()

  if (taskErr || !task) return NextResponse.json({ error: taskErr?.message ?? 'Failed' }, { status: 500 })

  if (Array.isArray(assignee_ids) && assignee_ids.length) {
    const { error: assignErr } = await supabase.from('dr_task_assignees').insert(
      assignee_ids.map((uid: string) => ({ task_id: task.id, user_id: uid }))
    )
    if (assignErr) {
      await supabase.from('dr_tasks').delete().eq('id', task.id)
      return NextResponse.json({ error: assignErr.message }, { status: 500 })
    }
  }
  if (Array.isArray(subtask_titles) && subtask_titles.length) {
    const { error: subErr } = await supabase.from('dr_task_subtasks').insert(
      subtask_titles.map((t: string, i: number) => ({ task_id: task.id, title: t, done: false, sort_order: i }))
    )
    if (subErr) {
      await supabase.from('dr_tasks').delete().eq('id', task.id)
      return NextResponse.json({ error: subErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ data: task })
}

// PATCH /api/daily-report/tasks
//   task:    { id, status?, member_done?, deadline?, priority?, title?, content? }
//   subtask: { subtask_id, done?, title?, sort_order? }
// 純 assignee 只能改 member_done（task）/ done（subtask）；管理者全欄位
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, subtask_id, ...updates } = body

  // ── Subtask 更新 ──
  if (subtask_id) {
    const { data: sub } = await supabase
      .from('dr_task_subtasks')
      .select('id, task_id')
      .eq('id', subtask_id)
      .maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const manage = await canManageTask(supabase, user.id, sub.task_id)
    const allowed = manage ? ['done', 'title', 'sort_order'] : ['done']
    const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
    if (!Object.keys(filtered).length) {
      return NextResponse.json({ error: 'No permitted fields' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('dr_task_subtasks')
      .update(filtered)
      .eq('id', subtask_id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // ── Task 更新 ──
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const manage = await canManageTask(supabase, user.id, id)
  const allowed = manage
    ? ['status', 'member_done', 'deadline', 'priority', 'title', 'content']
    : ['member_done']
  const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
  if (!Object.keys(filtered).length) {
    return NextResponse.json({ error: 'No permitted fields' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('dr_tasks')
    .update(filtered)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/daily-report/tasks?id=xxx  (admin / 建立者 / 可管理 viewer)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const manage = await canManageTask(supabase, user.id, id)
  if (!manage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: deleted, error } = await supabase
    .from('dr_tasks')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.length) return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
  return NextResponse.json({ data: null })
}
