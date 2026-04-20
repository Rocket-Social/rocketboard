import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.99.3'
import {z, type ZodSchema} from 'https://esm.sh/zod@3.23.8'

import {captureEdgeException} from './monitoring.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export {z}
export type {ZodSchema}

export function createServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ?? Deno.env.get('SUPABASE_ANON_KEY'))
  const {data: {user}} = await supabase.auth.getUser(token)
  return user
}

const APP_ORIGIN = Deno.env.get('APP_URL') ?? 'https://rocketboard.app'

export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': APP_ORIGIN,
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {...corsHeaders, 'Content-Type': 'application/json'},
  })
}

export function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({error: message}), {
    status,
    headers: {...corsHeaders, 'Content-Type': 'application/json'},
  })
}

export class HttpError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * Parse a JSON request body against a Zod schema. Throws HttpError(400)
 * with a concise issue summary on any parse or validation failure so the
 * caller can use errorResponseForException and stay off the crash path.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: {safeParse(input: unknown): {success: true; data: T} | {success: false; error: {issues: Array<{path: (string | number)[]; message: string}>}}},
): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new HttpError('Invalid JSON body', 400)
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new HttpError(`Invalid request body — ${summary}`, 400)
  }
  return result.data
}

export function errorResponseForException(err: unknown, fallbackMessage: string, functionName?: string) {
  if (err instanceof HttpError) {
    return errorResponse(err.message, err.status)
  }

  // 5xx path — send to error monitoring. fire-and-forget, never awaited.
  if (functionName) {
    void captureEdgeException(err, {functionName})
  }

  return errorResponse(err instanceof Error ? err.message : fallbackMessage, 500)
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: corsHeaders})
  }
  return null
}

export async function requireOrgAdmin(req: Request, orgId: string) {
  const user = await getAuthenticatedUser(req)
  if (!user) throw new HttpError('Unauthorized', 401)

  const supabase = createServiceClient()
  const {data: membership} = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership || (membership.role !== 'admin')) {
    throw new HttpError('Organization admin access required', 403)
  }

  const {data: org} = await supabase
    .from('organizations')
    .select('id, name, slug, billing_email, stripe_customer_id')
    .eq('id', orgId)
    .single()

  if (!org) throw new HttpError('Organization not found', 404)

  return {userId: user.id, organization: org}
}
