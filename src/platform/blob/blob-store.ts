import {getSupabaseBrowserClient} from '../supabase/client'

const PROJECT_ATTACHMENT_BUCKET = 'project-attachments'
const PROFILE_AVATAR_BUCKET = 'avatars'

function sanitizeFileName(value: string) {
  const normalized = value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
  return normalized || 'attachment'
}

function extractPublicBucketPath(bucket: string, value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const marker = `/storage/v1/object/public/${bucket}/`

  try {
    const parsed = new URL(normalized)
    const index = parsed.pathname.indexOf(marker)
    if (index === -1) {
      return null
    }

    return decodeURIComponent(parsed.pathname.slice(index + marker.length))
  } catch {
    return normalized.includes('/') ? normalized : null
  }
}

async function removeFromBucket(bucket: string, paths: string[]) {
  if (paths.length === 0) {
    return
  }

  const {error} = await getSupabaseBrowserClient().storage.from(bucket).remove(paths)

  if (error) {
    throw error
  }
}

export const blobStore = {
  async remove(paths: string[]) {
    await removeFromBucket(PROJECT_ATTACHMENT_BUCKET, paths)
  },
  async removeProfileAvatar(value: string | null | undefined) {
    const storagePath = value ? extractPublicBucketPath(PROFILE_AVATAR_BUCKET, value) : null
    if (!storagePath) {
      return
    }

    await removeFromBucket(PROFILE_AVATAR_BUCKET, [storagePath])
  },
  async uploadProfileAvatar(input: {
    file: File
    userId: string
  }) {
    const storagePath = `${input.userId}/${crypto.randomUUID()}-${sanitizeFileName(input.file.name)}`
    const storage = getSupabaseBrowserClient().storage.from(PROFILE_AVATAR_BUCKET)
    const {error} = await storage.upload(storagePath, input.file, {
      contentType: input.file.type || undefined,
      upsert: false,
    })

    if (error) {
      throw error
    }

    const {data} = storage.getPublicUrl(storagePath)

    return {
      publicUrl: data.publicUrl,
      storagePath,
    }
  },
  async uploadProjectAttachment(input: {
    file: File
    parentId: string
    projectId: string
  }) {
    const storagePath = `${input.projectId}/${input.parentId}/${crypto.randomUUID()}-${sanitizeFileName(input.file.name)}`
    const {error} = await getSupabaseBrowserClient().storage.from(PROJECT_ATTACHMENT_BUCKET).upload(storagePath, input.file, {
      contentType: input.file.type || undefined,
      upsert: false,
    })

    if (error) {
      throw error
    }

    return storagePath
  },
}
