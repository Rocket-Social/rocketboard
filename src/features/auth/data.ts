import {queryOptions} from '@tanstack/react-query'

import type {WeekStartsOn} from '../../lib/week-preferences'
import {authCallbackRoutePath, loginRoutePath, resetPasswordRoutePath} from './auth.routes'
import {sessionRepository} from './session.repository'

export type SessionUser = {
  avatarUrl?: string | null
  email: string
  githubLogin: string | null
  id: string
  initials: string
  isInternalAdmin: boolean
  name: string
  weekStartsOn: WeekStartsOn
}

export type LoginCredentials = {
  email: string
  password: string
}

export type RegistrationCredentials = {
  email: string
  fullName?: string
  password: string
}

export type AccountProfileInput = {
  fullName: string
  githubLogin: string
}

export type AccountPreferencesInput = {
  weekStartsOn: WeekStartsOn
}

export type AccountPasswordInput = {
  password: string
}

export type PasswordResetInput = {
  email: string
}

export type LinkGoogleIdentityInput = {
  flowId: string
  redirectNonce: string
  returnTo?: string
}

export const minimumAccountPasswordLength = 8

export type SessionState =
  | {
      status: 'anonymous'
    }
  | {
      status: 'authenticated'
      user: SessionUser
    }

export {authCallbackRoutePath, loginRoutePath, resetPasswordRoutePath}

export async function getSession() {
  return sessionRepository.getSession()
}

export async function signInFromLoginScreen(credentials?: LoginCredentials) {
  return sessionRepository.signInFromLoginScreen(credentials)
}

export async function signInWithGoogle(returnTo?: string) {
  return sessionRepository.signInWithGoogle(returnTo)
}

export async function linkGoogleIdentity(input: LinkGoogleIdentityInput) {
  return sessionRepository.linkGoogleIdentity(input)
}

export async function signUpFromLoginScreen(credentials: RegistrationCredentials) {
  return sessionRepository.signUpFromLoginScreen(credentials)
}

export async function signOutSession() {
  return sessionRepository.signOut()
}

export async function sendMagicLink(email: string) {
  return sessionRepository.sendMagicLink(email)
}

export async function requestPasswordReset(input: PasswordResetInput) {
  return sessionRepository.requestPasswordReset(input)
}

export async function updateAccountProfile(input: AccountProfileInput) {
  return sessionRepository.updateAccountProfile(input)
}

export async function uploadAccountAvatar(file: File) {
  return sessionRepository.uploadAccountAvatar(file)
}

export async function removeAccountAvatar() {
  return sessionRepository.removeAccountAvatar()
}

export async function updateAccountPreferences(input: AccountPreferencesInput) {
  return sessionRepository.updateAccountPreferences(input)
}

export async function updateAccountPassword(input: AccountPasswordInput) {
  return sessionRepository.updateAccountPassword(input)
}

export function sessionQueryOptions() {
  return queryOptions({
    queryFn: getSession,
    queryKey: ['session'],
  })
}
