import {User, X} from 'lucide-react'

import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import type {ProjectMember} from '../access/access.types'
import {AssigneeIdentity} from '../access/AssigneeIdentity'
import type {AssignablePersona} from '../ai/agent.types'
import {getAssignablePersonFilterEntries, getPersonFilterMembers} from './person-filter-options'

type PersonFilterProps = {
  // Phase 4 PR 4-B-2 (D10): assignable agents for this project. When
  // populated, the filter shows an "AI agents" section so users can
  // narrow the board to a single agent's queue. Optional — surfaces
  // that haven't wired the persona query yet stay humans-only.
  assignablePersonas?: AssignablePersona[]
  currentUserId: string
  eligibleUserIds: ReadonlySet<string>
  onSelectPerson: (userId: string | null) => void
  projectMembers: ProjectMember[]
  selectedUserId: string | null
}

export function PersonFilter({
  assignablePersonas,
  currentUserId,
  eligibleUserIds,
  onSelectPerson,
  projectMembers,
  selectedUserId,
}: PersonFilterProps) {
  const sortedMembers = getPersonFilterMembers(projectMembers, eligibleUserIds, currentUserId, selectedUserId)
  const sortedPersonas = getAssignablePersonFilterEntries(
    assignablePersonas ?? [],
    eligibleUserIds,
    selectedUserId,
  )

  const isActive = selectedUserId !== null

  return (
    <div className='flex items-center gap-1'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={isActive ? 'primary' : 'secondary'}>
            {selectedUserId ? (
              <AssigneeIdentity
                assignablePersonas={assignablePersonas}
                hideName
                hideSparkle
                projectMembers={projectMembers}
                size='sm'
                userId={selectedUserId}
              />
            ) : (
              <User className='h-4 w-4'/>
            )}
            {selectedUserId
              ? sortedMembers.find((m) => m.id === selectedUserId)?.name
                ?? sortedPersonas.find((p) => p.agentUserId === selectedUserId)?.name
                ?? 'Person'
              : 'Person'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuLabel>Filter by person</DropdownMenuLabel>
          {sortedMembers.length === 0 && sortedPersonas.length === 0 ? (
            <DropdownMenuItem disabled>
              No assigned people
            </DropdownMenuItem>
          ) : null}
          {sortedMembers.map((member) => (
            <DropdownMenuItem
              key={member.id}
              onClick={() => onSelectPerson(member.id === selectedUserId ? null : member.id)}
            >
              <AssigneeIdentity
                assignablePersonas={assignablePersonas}
                hideSparkle
                projectMembers={projectMembers}
                size='sm'
                userId={member.id}
              />
              {member.id === selectedUserId ? (
                <span className='ml-auto text-primary'>&#10003;</span>
              ) : null}
            </DropdownMenuItem>
          ))}
          {sortedPersonas.length > 0 ? (
            <>
              <DropdownMenuSeparator/>
              <DropdownMenuLabel>AI agents</DropdownMenuLabel>
              {sortedPersonas.map((persona) => (
                <DropdownMenuItem
                  key={persona.agentUserId}
                  onClick={() =>
                    onSelectPerson(persona.agentUserId === selectedUserId ? null : persona.agentUserId)
                  }
                >
                  <AssigneeIdentity
                    assignablePersonas={assignablePersonas}
                    projectMembers={projectMembers}
                    size='sm'
                    userId={persona.agentUserId}
                  />
                  {persona.agentUserId === selectedUserId ? (
                    <span className='ml-auto text-primary'>&#10003;</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
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
