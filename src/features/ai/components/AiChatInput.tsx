import { Send, Square } from 'lucide-react'
import { useCallback, useRef } from 'react'

type AiChatInputProps = {
  disabled?: boolean
  isStreaming?: boolean
  onSend: (message: string) => void
  onStop?: () => void
  value: string
  onChange: (value: string) => void
}

export function AiChatInput({
  disabled = false,
  isStreaming = false,
  onSend,
  onStop,
  value,
  onChange,
}: AiChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const trimmed = value.trim()
        if (trimmed && !disabled && !isStreaming) {
          onSend(trimmed)
        }
      }
    },
    [value, disabled, isStreaming, onSend],
  )

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed && !disabled && !isStreaming) {
      onSend(trimmed)
      textareaRef.current?.focus()
    }
  }, [value, disabled, isStreaming, onSend])

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
      // Auto-resize
      const el = e.target
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    },
    [onChange],
  )

  return (
    <div className="border-t border-border-subtle bg-surface-base px-4 py-3">
      <div className="flex items-end gap-2 rounded-2xl border border-border-subtle bg-surface-elevated px-3 py-2 transition-colors focus-within:border-primary">
        <textarea
          className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent text-sm text-text-strong outline-none placeholder:text-text-muted"
          disabled={disabled}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          ref={textareaRef}
          rows={1}
          value={value}
        />
        {isStreaming ? (
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error transition-colors hover:bg-error/20"
            onClick={onStop}
            title="Stop generating"
            type="button"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-strong disabled:opacity-40"
            disabled={disabled || !value.trim()}
            onClick={handleSend}
            title="Send message"
            type="button"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
