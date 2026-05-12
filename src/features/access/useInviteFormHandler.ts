import type {KeyboardEvent} from 'react'

import {useToast} from '../../components/ui/toast'
import {isEmailFormat} from '../../lib/email'

export type UseInviteFormHandlerInput = {
  email: string
  guard?: boolean
  isPending: boolean
  onValid: (trimmedEmail: string) => void
}

export type UseInviteFormHandlerResult = {
  handleSubmit: () => void
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

export function useInviteFormHandler(input: UseInviteFormHandlerInput): UseInviteFormHandlerResult {
  const {toast} = useToast()

  const handleSubmit = () => {
    if (input.guard === false) return
    if (input.isPending) return

    const trimmed = input.email.trim()
    if (!trimmed) {
      toast({title: 'Enter an email address', variant: 'error'})
      return
    }
    if (!isEmailFormat(trimmed)) {
      toast({
        title: 'That email format is not valid',
        description: 'Use an email like name@company.com. Remove quotes, angle brackets, or extra text.',
        variant: 'error',
      })
      return
    }

    input.onValid(trimmed)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    handleSubmit()
  }

  return {handleSubmit, handleKeyDown}
}
