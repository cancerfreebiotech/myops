import type { createClient } from '@/lib/supabase/server'

/** admin 或具 training_manage 者可管理課程/指派/證照 */
export async function canManageTraining(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' || !!(data?.granted_features as string[] | null)?.includes('training_manage')
}

export const TRAINING_CATEGORIES = ['gcp', 'biosafety', 'radiation', 'quality', 'general'] as const
