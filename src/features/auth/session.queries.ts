import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  linkGoogleIdentity,
  requestPasswordReset,
  removeAccountAvatar,
  sendMagicLink,
  sessionQueryOptions,
  signInFromLoginScreen,
  signInWithGoogle,
  signOutSession,
  signUpFromLoginScreen,
  uploadAccountAvatar,
  updateAccountPreferences,
  updateAccountPassword,
  updateAccountProfile,
  type AccountPreferencesInput,
  type AccountPasswordInput,
  type AccountProfileInput,
  type LinkGoogleIdentityInput,
  type LoginCredentials,
  type PasswordResetInput,
  type RegistrationCredentials,
} from './data'

async function invalidateAccountProfileQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access',
    }),
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'workspace-access',
    }),
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'workspace-access-search',
    }),
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'org-members',
    }),
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'wiki',
    }),
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'github-identity-candidates',
    }),
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey)
        && typeof query.queryKey[0] === 'string'
        && query.queryKey[0].startsWith('github-'),
    }),
  ])
}

export function useSessionQuery() {
  return useQuery(sessionQueryOptions())
}

export function useSignInMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials?: LoginCredentials) => signInFromLoginScreen(credentials),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
    },
  })
}

export function useSignInWithGoogleMutation() {
  return useMutation({
    mutationFn: (returnTo?: string) => signInWithGoogle(returnTo),
  })
}

export function useLinkGoogleIdentityMutation() {
  return useMutation({
    mutationFn: (input: LinkGoogleIdentityInput) => linkGoogleIdentity(input),
  })
}

export function useSignUpMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: RegistrationCredentials) => signUpFromLoginScreen(credentials),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
    },
  })
}

export function useSignOutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: signOutSession,
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
    },
  })
}

export function useSendMagicLinkMutation() {
  return useMutation({
    mutationFn: (email: string) => sendMagicLink(email),
  })
}

export function useRequestPasswordResetMutation() {
  return useMutation({
    mutationFn: (input: PasswordResetInput) => requestPasswordReset(input),
  })
}

export function useUpdateAccountProfileMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AccountProfileInput) => updateAccountProfile(input),
    onSuccess: async (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
      await invalidateAccountProfileQueries(queryClient)
    },
  })
}

export function useUploadAccountAvatarMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => uploadAccountAvatar(file),
    onSuccess: async (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
      await invalidateAccountProfileQueries(queryClient)
    },
  })
}

export function useRemoveAccountAvatarMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: removeAccountAvatar,
    onSuccess: async (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
      await invalidateAccountProfileQueries(queryClient)
    },
  })
}

export function useUpdateAccountPreferencesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AccountPreferencesInput) => updateAccountPreferences(input),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
    },
  })
}

export function useUpdateAccountPasswordMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AccountPasswordInput) => updateAccountPassword(input),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
    },
  })
}
