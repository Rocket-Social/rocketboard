import {User, X} from 'lucide-react'

import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {UserAvatar} from '../../components/ui/user-avatar'
import type {ProjectMember} from '../access/access.types'

type PersonFilterProps = {
  currentUserId: string
  onSelectPerson: (userId: string | null) => void
  projectMembers: ProjectMember[]
  selectedUserId: string | null
}

export function PersonFilter({
  currentUserId,
  onSelectPerson,
  projectMembers,
  selectedUserId,
}: PersonFilterProps) {
  const selectedMember = selectedUserId
    ? projectMembers.find((member) => member.id === selectedUserId)
    : null

  const sortedMembers = [...projectMembers].sort((left, right) => {
    if (left.id === currentUserId) return -1
    if (right.id === currentUserId) return 1
    return left.name.localeCompare(right.name)
  })

  const isActive = selectedUserId !== null

  return (
    <div className='flex items-center gap-1'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={isActive ? 'primary' : 'secondary'}>
            {selectedMember ? (
              <UserAvatar
                avatarUrl={selectedMember.avatarUrl}
                className='h-5 w-5'
                fallback={selectedMember.name.charAt(0).toUpperCase()}
                fallbackClassName='text-[10px]'
                name={selectedMember.name}
              />
            ) : (
              <User className='h-4 w-4'/>
            )}
            {selectedMember ? selectedMember.name : 'Person'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuLabel>Filter by person</DropdownMenuLabel>
          {sortedMembers.map((member) => (
            <DropdownMenuItem
              key={member.id}
              onClick={() => onSelectPerson(member.id === selectedUserId ? null : member.id)}
            >
              <UserAvatar
                avatarUrl={member.avatarUrl}
                className='h-6 w-6'
                fallback={member.name.charAt(0).toUpperCase()}
                fallbackClassName='text-[10px]'
                name={member.name}
              />
              <span className='flex-1'>{member.name}</span>
              {member.id === selectedUserId ? (
                <span className='text-primary'>&#10003;</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {isActive ? (
        <button
          className='flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-canvas-accent hover:text-text-strong'
          onClick={() => onSelectPerson(null)}
          type='button'
        >
          <X className='h-3.5 w-3.5'/>
        </button>
      ) : null}
    </div>
  )
}
