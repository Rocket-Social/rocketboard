import {Lock} from 'lucide-react'

import {Button} from '../../components/ui/button'

type UpgradePromptProps = {
  title: string
  description: string
  onUpgrade: () => void
}

export function UpgradePrompt({title, description, onUpgrade}: UpgradePromptProps) {
  return (
    <div className='flex flex-col items-center justify-center py-16 px-6'>
      <div className='mx-auto max-w-sm rounded-xl border border-border-subtle bg-surface-base p-8 text-center'>
        <Lock className='mx-auto h-8 w-8 text-text-muted/50'/>
        <h3 className='mt-4 font-display text-lg font-semibold text-text-strong'>{title}</h3>
        <p className='mt-2 text-sm text-text-muted'>{description}</p>
        <Button className='mt-6 w-full' onClick={onUpgrade} variant='primary'>
          Upgrade to Pro
        </Button>
        <button
          className='mt-3 text-sm text-text-muted underline-offset-2 hover:underline'
          onClick={onUpgrade}
          type='button'
        >
          See what&apos;s included
        </button>
      </div>
    </div>
  )
}

// Pre-built prompts for common scale limit scenarios
export const UPGRADE_PROMPTS = {
  members: {
    title: 'Your team is growing!',
    description: 'Free plans include 5 members. Upgrade to Pro to add unlimited teammates.',
  },
  projects: {
    title: "You're building a lot!",
    description: 'Free plans include 10 projects. Upgrade to Pro for unlimited projects.',
  },
  workspaces: {
    title: 'Ready to organize by team?',
    description: 'Free plans include 1 workspace. Upgrade to Pro for unlimited workspaces.',
  },
  storage: {
    title: "You've used your 1 GB of storage.",
    description: 'Upgrade to Pro for unlimited storage.',
  },
} as const
