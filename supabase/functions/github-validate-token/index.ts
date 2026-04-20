import { encryptToken } from '../_shared/github-crypto.ts'
import {
  createServiceClient,
  errorResponseForException,
  getAuthenticatedUser,
  handleCors,
  jsonResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'

const DisconnectBodySchema = z.object({
  action: z.literal('disconnect'),
  source_id: z.string().min(1),
})

const ValidateBodySchema = z.object({
  action: z.literal('validate').optional(),
  scope_type: z.enum(['organization', 'personal']),
  organization_id: z.string().uuid().nullable().optional(),
  token: z.string().min(1),
})

export const GithubValidateTokenBodySchema = z.union([
  DisconnectBodySchema,
  ValidateBodySchema,
])

Deno.serve(withMonitoring('github-validate-token', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabase = createServiceClient()
    const body = await parseJsonBody(req, GithubValidateTokenBodySchema)

    if ('action' in body && body.action === 'disconnect') {
      const sourceId = body.source_id

      const { data: source } = await supabase
        .from('github_connection_sources')
        .select('id, scope_type, organization_id, owner_user_id')
        .eq('id', sourceId)
        .maybeSingle()

      if (!source) {
        return jsonResponse({ error: 'Source not found' }, 404)
      }

      if (!(await canManageSource(supabase, source, user.id))) {
        return jsonResponse({ error: 'Forbidden', message: 'You cannot disconnect this source.' }, 403)
      }

      const { error: deleteError } = await supabase
        .from('github_connection_sources')
        .delete()
        .eq('id', sourceId)

      if (deleteError) {
        return jsonResponse({ error: 'disconnect_failed', message: 'Failed to disconnect GitHub source.' }, 500)
      }

      return jsonResponse({ success: true })
    }

    const { scope_type: scopeType, organization_id: organizationId, token } = body

    if (scopeType === 'organization') {
      if (!organizationId) {
        return jsonResponse({ error: 'organization_id required' }, 400)
      }

      if (!(await canManageOrganization(supabase, organizationId, user.id))) {
        return jsonResponse({ error: 'Forbidden', message: 'Only organization admins can save org GitHub sources.' }, 403)
      }
    }

    const ghResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Rocketboard',
      },
    })

    if (!ghResponse.ok) {
      if (ghResponse.status === 401) {
        return jsonResponse({
          error: 'invalid_token',
          message: 'Invalid token. Check that it is current and copied correctly.',
        }, 400)
      }

      return jsonResponse({ error: 'github_error', message: `GitHub returned ${ghResponse.status}` }, 400)
    }

    const ghUser = await ghResponse.json()
    const scopes = ghResponse.headers.get('x-oauth-scopes') ?? ''
    const scopeList = scopes.split(',').map((value: string) => value.trim()).filter(Boolean)
    const hasRepo = scopeList.includes('repo')
    const hasReadUser = scopeList.includes('read:user') || scopeList.includes('user')
    const hasReadOrg = scopeList.includes('read:org') || scopeList.includes('admin:org')

    const missing = []
    if (!hasRepo) missing.push('repo')
    if (!hasReadUser) missing.push('read:user')
    if (scopeType === 'organization' && !hasReadOrg) missing.push('read:org')

    if (missing.length > 0) {
      return jsonResponse({
        error: 'missing_scopes',
        message: `Token is valid but missing required scopes: ${missing.join(', ')}.`,
        missing,
        scopes: scopeList,
        user: { login: ghUser.login },
      }, 400)
    }

    const encryptedToken = await encryptToken(token)
    const now = new Date().toISOString()

    const existingSource = await findExistingPatSource(supabase, {
      accountLogin: ghUser.login,
      organizationId: scopeType === 'organization' ? organizationId ?? null : null,
      ownerUserId: scopeType === 'personal' ? user.id : null,
    })

    const payload = {
      account_avatar_url: ghUser.avatar_url ?? null,
      account_login: ghUser.login as string,
      account_type: 'User',
      auth_type: 'pat',
      installation_id: 0,
      installed_by: user.id,
      last_validated_at: now,
      organization_id: scopeType === 'organization' ? organizationId ?? null : null,
      owner_user_id: scopeType === 'personal' ? user.id : null,
      permissions: { oauth_token_encrypted: encryptedToken },
      scope_type: scopeType,
      status: 'active',
      updated_at: now,
    }

    let sourceId = existingSource?.id ?? null
    let saveError: { message?: string } | null = null

    if (existingSource) {
      const { error } = await supabase
        .from('github_connection_sources')
        .update(payload)
        .eq('id', existingSource.id)
      saveError = error
    } else {
      const { data, error } = await supabase
        .from('github_connection_sources')
        .insert({
          ...payload,
          created_at: now,
        })
        .select('id')
        .single()
      sourceId = data?.id ?? null
      saveError = error
    }

    if (saveError || !sourceId) {
      console.error('[github-validate-token] Save error:', saveError)
      return jsonResponse({ error: 'save_failed', message: 'Failed to save GitHub source.' }, 500)
    }

    return jsonResponse({
      scopes: scopeList,
      source: {
        account_login: ghUser.login,
        auth_type: 'pat',
        id: sourceId,
        scope_type: scopeType,
      },
      success: true,
      user: {
        avatar_url: ghUser.avatar_url ?? null,
        login: ghUser.login,
      },
    })
  } catch (err) {
    console.error('[github-validate-token] Error:', err)
    return errorResponseForException(err, 'Internal error', 'github-validate-token')
  }
}))

async function findExistingPatSource(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    accountLogin: string
    organizationId: string | null
    ownerUserId: string | null
  },
) {
  let query = supabase
    .from('github_connection_sources')
    .select('id')
    .eq('auth_type', 'pat')
    .eq('account_login', input.accountLogin)

  if (input.organizationId) {
    query = query.eq('scope_type', 'organization').eq('organization_id', input.organizationId)
  } else if (input.ownerUserId) {
    query = query.eq('scope_type', 'personal').eq('owner_user_id', input.ownerUserId)
  }

  const { data } = await query.maybeSingle()
  return data
}

async function canManageOrganization(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: string,
  userId: string,
) {
  const { data, error } = await supabase.rpc('can_manage_organization', {
    target_org_id: organizationId,
    target_user_id: userId,
  })

  if (error) {
    console.error('[github-validate-token] Failed to resolve org admin access:', error)
    return false
  }

  return data === true
}

async function canManageSource(
  supabase: ReturnType<typeof createServiceClient>,
  source: {organization_id?: string | null; owner_user_id?: string | null; scope_type?: string | null},
  userId: string,
) {
  if (source.scope_type === 'personal') {
    return source.owner_user_id === userId
  }

  if (source.scope_type === 'organization' && source.organization_id) {
    return canManageOrganization(supabase, source.organization_id, userId)
  }

  return false
}

