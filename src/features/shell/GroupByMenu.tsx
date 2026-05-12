import {Check, ChevronDown, Layers} from 'lucide-react'

import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import type {TableGroupBy} from '../cards/card.types'

type GroupByMenuProps = {
  dateLabel?: string
  groupBy: TableGroupBy
  groupLabel?: string
  options: TableGroupBy[]
  onGroupByChange: (groupBy: TableGroupBy) => void
}

function getGroupByLabel(groupBy: TableGroupBy, dateLabel: string, groupLabel: string) {
  switch (groupBy) {
    case 'assignee':
      return 'Assignee'
    case 'due_date':
      return dateLabel
    case 'group':
      return groupLabel
    case 'priority':
      return 'Priority'
    case 'status':
      return 'Status'
  }

  const exhaustiveCheck: never = groupBy
  return exhaustiveCheck
}

export function GroupByMenu({dateLabel = 'Date', groupBy, groupLabel = 'Group', onGroupByChange, options}: GroupByMenuProps) {
  const isDefaultActive = groupBy === 'group'
  const normalizedOptions: TableGroupBy[] = options.includes('group') ? options : ['group', ...options]
  const propertyGroupOptions: TableGroupBy[] = normalizedOptions.filter((option): option is Exclude<TableGroupBy, 'group'> => option !== 'group')
  const activeLabel = getGroupByLabel(groupBy, dateLabel, groupLabel)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={isDefaultActive ? 'secondary' : 'primary'}>
          <Layers className='h-4 w-4'/>
          {isDefaultActive ? groupLabel : activeLabel}
          <ChevronDown className='h-3 w-3'/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onGroupByChange('group')}>
          <span className='flex-1'>{groupLabel} (default)</span>
          {isDefaultActive ? <Check className='h-4 w-4 text-primary'/> : null}
        </DropdownMenuItem>
        {propertyGroupOptions.length > 0 ? <DropdownMenuSeparator/> : null}
        {propertyGroupOptions.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => onGroupByChange(option)}
          >
            <span className='flex-1'>{getGroupByLabel(option, dateLabel, groupLabel)}</span>
            {groupBy === option ? (
              <Check className='h-4 w-4 text-primary'/>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
