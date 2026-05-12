import {IS_SELF_HOSTED} from '../../app/config'
import {callEdgeFunction, EdgeFunctionError} from '../../platform/edge/edge-client'

export type InviteEmailPayload = {
  acceptToken: string
  email: string
  inviterName: string
  message?: string
  resourceId: string
  resourceName: string
  role: string
  type: 'organization' | 'project' | 'workspace'
}

type InviteEmailResponse = {
  code?: number | string
  error?: string
  message?: string
  success?: boolean
}

export async function sendInviteEmail(input: InviteEmailPayload) {
  if (IS_SELF_HOSTED) {
    return
  }

  let payload: InviteEmailResponse
  try {
    payload = await callEdgeFunction<InviteEmailResponse>('send-invite-email', {
      body: input as unknown as Record<string, unknown>,
      errorFallback: 'Rocketboard could not send the invite email.',
    })
  } catch (error) {
    if (error instanceof EdgeFunctionError) {
      throw new Error(error.message)
    }
    if (error instanceof Error && error.message === 'Not authenticated') {
      throw new Error('Rocketboard could not verify your session to send the invite email.')
    }
    throw error
  }

  if (!payload?.success) {
    throw new Error(payload?.error ?? payload?.message ?? 'Rocketboard could not send the invite email.')
  }
}
