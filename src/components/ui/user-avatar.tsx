import {useEffect, useState} from 'react'

import {cn} from '../../lib/cn'
import {Avatar, AvatarFallback} from './avatar'

function getInitials(name: string | null | undefined, fallback = '?') {
  const normalized = name?.trim() ?? ''
  if (!normalized) {
    return fallback
  }

  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }

  return normalized.slice(0, 2).toUpperCase()
}

type UserAvatarProps = {
  alt?: string
  avatarUrl?: string | null
  className?: string
  fallback?: string
  fallbackClassName?: string
  imgClassName?: string
  name?: string | null
}

export function UserAvatar({
  alt,
  avatarUrl,
  className,
  fallback,
  fallbackClassName,
  imgClassName,
  name,
}: UserAvatarProps) {
  const normalizedAvatarUrl = avatarUrl?.trim() ? avatarUrl : null
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [normalizedAvatarUrl])

  const initials = getInitials(name, fallback)

  return (
    <Avatar className={className}>
      {normalizedAvatarUrl && !imageFailed ? (
        <img
          alt={alt ?? ''}
          aria-hidden={alt ? undefined : true}
          className={cn('h-full w-full object-cover', imgClassName)}
          onError={() => setImageFailed(true)}
          src={normalizedAvatarUrl}
        />
      ) : null}
      {!normalizedAvatarUrl || imageFailed ? (
        <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
      ) : null}
    </Avatar>
  )
}
