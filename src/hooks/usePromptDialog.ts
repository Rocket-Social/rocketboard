import {useCallback, useState} from 'react'

type PromptOptions = {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

type PromptState = PromptOptions & {
  resolve: (value: string | null) => void
}

export function usePromptDialog() {
  const [state, setState] = useState<PromptState | null>(null)

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setState({...options, resolve})
    })
  }, [])

  const handleConfirm = useCallback((value: string) => {
    state?.resolve(value)
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    state?.resolve(null)
    setState(null)
  }, [state])

  return {
    prompt,
    promptDialogProps: state ? {
      open: true as const,
      title: state.title,
      description: state.description,
      defaultValue: state.defaultValue,
      placeholder: state.placeholder,
      confirmLabel: state.confirmLabel,
      cancelLabel: state.cancelLabel,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    } : null,
  }
}
