import { createServiceClient } from './supabase/server'

export async function getSignedUploadUrl(bucket: string, path: string) {
  const supabase = await createServiceClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path)
  if (error) throw error
  return data
}

export async function getSignedDownloadUrl(bucket: string, path: string, expiresIn = 3600) {
  const supabase = await createServiceClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}
