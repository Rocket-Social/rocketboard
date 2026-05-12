// AI Kanban — `/ai-agents` page shell.
//
// Three-tab layout:
//   1. My AI Kanban — default, your work, status-grouped grid + +New Task
//   2. AI Agent Profiles — the personas surface
//   3. Jobs & Schedules — the prebuilt Jobs catalog + active schedules
//
// Tab is URL-driven via the `?tab=profiles|templates` search param so
// the assignee hover card's "View profile" button (and any other
// cross-surface link) can deep-link straight to the profiles tab
// without an extra click. Missing param defaults to the kanban tab.
// (The `?tab=templates` value is preserved for back-compat with any
// linked surfaces; the visible label reads "Jobs & Schedules".)

import {useEffect, useState} from 'react'
import {useNavigate, useSearch} from '@tanstack/react-router'
import {Bot, FileStack, ListTodo, Users} from 'lucide-react'

import {PillTabs, type PillTab} from '../../components/ui/pill-tabs'
import {useSignedInAppFrame} from '../shell/SignedInAppFrame'
import {AgentProfilesTab} from './components/AgentProfilesTab'
import {HelpCallout} from './components/HelpCallout'
import {MyAiKanbanTab} from './components/MyAiKanbanTab'
import {OrgBudgetMeter} from './components/OrgBudgetMeter'
import {OrgQuotaMeter} from './components/OrgQuotaMeter'
import {JobsAndSchedulesTab} from './components/TemplatesAndSchedulesTab'

type TabId = 'kanban' | 'profiles' | 'templates'

const TABS: PillTab[] = [
  {icon: ListTodo, id: 'kanban', label: 'My AI Kanban'},
  {icon: Users, id: 'profiles', label: 'AI Agent Profiles'},
  {icon: FileStack, id: 'templates', label: 'Jobs & Schedules'},
]

function parseTabFromSearch(value: unknown): TabId {
  return value === 'profiles' || value === 'templates' ? value : 'kanban'
}

export function AiAgentsPage() {
  const search = useSearch({strict: false}) as {tab?: string}
  const rawNavigate = useNavigate()
  const {currentWorkspace, workspaces} = useSignedInAppFrame()
  const organizationId =
    currentWorkspace?.organizationId ?? workspaces[0]?.organizationId ?? null
  const [activeTab, setActiveTab] = useState<TabId>(() => parseTabFromSearch(search.tab))

  // Keep local tab state in sync with `?tab=` if the user navigates to
  // /ai-agents with the param (e.g. via the hover-card View profile
  // link or a deep link from elsewhere).
  useEffect(() => {
    setActiveTab(parseTabFromSearch(search.tab))
  }, [search.tab])

  const handleTabChange = (next: TabId) => {
    setActiveTab(next)
    void rawNavigate({
      replace: true,
      search: () => (next === 'kanban' ? {} : {tab: next}),
    } as never)
  }

  return (
    <div className='w-full px-6 py-8'>
      <div className='mb-6'>
        <div className='flex items-center gap-3'>
          <Bot className='h-6 w-6 text-primary'/>
          <h1 className='font-display text-2xl font-semibold text-text-strong'>AI Agents</h1>
        </div>
        <p className='mt-1 text-sm text-text-muted'>Your AI team</p>
      </div>

      <OrgBudgetMeter organizationId={organizationId}/>
      <OrgQuotaMeter organizationId={organizationId}/>

      <div className='mb-6'>
        <PillTabs
          activeTab={activeTab}
          ariaLabel='AI Agents sections'
          onTabChange={(id) => handleTabChange(id as TabId)}
          tabs={TABS}
        />
      </div>

      {activeTab === 'kanban' ? (
        <MyAiKanbanTab
          onNavigateToProfiles={() => handleTabChange('profiles')}
          onNavigateToTemplates={() => handleTabChange('templates')}
        />
      ) : null}

      {activeTab === 'profiles' ? <AgentProfilesTab/> : null}

      {activeTab === 'templates' ? <JobsAndSchedulesTab/> : null}

      <HelpCallout/>
    </div>
  )
}
