import {useQuery} from '@tanstack/react-query'
import {useParams} from '@tanstack/react-router'
import {Globe} from 'lucide-react'
import {useEffect, useMemo} from 'react'

import {Button} from '../../components/ui/button'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {RichTextEditor} from '../rich-text/RichTextEditor'
import type {RichTextDocument} from '../rich-text/rich-text'
import {publicWikiPageQueryOptions} from './wiki.queries'

// Strip internal wiki links from TipTap content JSON.
// Internal links matching /org/.../wiki/... or /wiki/... are removed.
// External links are preserved.
export function stripInternalLinks(doc: RichTextDocument): RichTextDocument {
  if (!doc || !doc.content) return doc

  function processNode(node: Record<string, unknown>): Record<string, unknown> {
    const result = {...node}

    // Process marks: remove link marks that point to internal wiki URLs
    if (Array.isArray(result.marks)) {
      result.marks = (result.marks as Record<string, unknown>[]).filter((mark) => {
        if (mark.type !== 'link') return true
        const href = (mark.attrs as Record<string, unknown> | undefined)?.href
        if (typeof href !== 'string') return true
        // Strip internal wiki links
        return !href.match(/^\/(?:org\/[^/]+\/)?wiki\//)
      })
      if ((result.marks as unknown[]).length === 0) {
        delete result.marks
      }
    }

    // Recurse into children
    if (Array.isArray(result.content)) {
      result.content = (result.content as Record<string, unknown>[]).map(processNode)
    }

    return result
  }

  return processNode(doc) as RichTextDocument
}

export function PublicWikiPage() {
  const {shareToken} = useParams({strict: false}) as {shareToken: string}
  const pageQuery = useQuery(publicWikiPageQueryOptions(shareToken))

  // Set noindex meta tag
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  const processedContent = useMemo(() => {
    if (!pageQuery.data?.contentJson) return null
    return stripInternalLinks(pageQuery.data.contentJson)
  }, [pageQuery.data?.contentJson])

  if (pageQuery.isPending) {
    return (
      <div className='min-h-screen bg-canvas'>
        <header className='border-b border-border-subtle px-6 py-3'>
          <div className='mx-auto flex max-w-3xl items-center gap-2 text-sm text-text-muted'>
            <Globe className='h-4 w-4'/>
            <span>Shared via Rocketboard</span>
          </div>
        </header>
        <div className='mx-auto max-w-3xl px-6 py-8 lg:px-12'>
          <div className='mb-4 h-8 w-64 animate-pulse rounded bg-border-subtle/30'/>
          <div className='mb-2 h-4 w-full animate-pulse rounded bg-border-subtle/30'/>
          <div className='mb-2 h-4 w-full animate-pulse rounded bg-border-subtle/30'/>
          <div className='h-4 w-3/4 animate-pulse rounded bg-border-subtle/30'/>
        </div>
      </div>
    )
  }

  if (pageQuery.error || !pageQuery.data) {
    return (
      <div className='min-h-screen bg-canvas'>
        <header className='border-b border-border-subtle px-6 py-3'>
          <div className='mx-auto flex max-w-3xl items-center gap-2 text-sm text-text-muted'>
            <Globe className='h-4 w-4'/>
            <span>Shared via Rocketboard</span>
          </div>
        </header>
        <div className='mx-auto max-w-3xl px-6 py-16'>
          <div className='rounded-[28px] border border-border-subtle bg-surface-elevated p-8 text-center shadow-panel'>
            <p className='font-display text-xl font-semibold text-text-strong'>This page is no longer available</p>
            <p className='mt-3 text-sm text-text-medium'>
              {pageQuery.error
                ? getErrorMessage(pageQuery.error)
                : 'The author may have removed it or revoked public access.'}
            </p>
            <Button className='mt-6' onClick={() => window.location.reload()} variant='ghost'>
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const page = pageQuery.data

  return (
    <div className='min-h-screen bg-canvas'>
      <header className='border-b border-border-subtle px-6 py-3'>
        <div className='mx-auto flex max-w-3xl items-center gap-2 text-sm text-text-muted'>
          <Globe className='h-4 w-4'/>
          <span>Shared via Rocketboard</span>
        </div>
      </header>

      <article className='mx-auto max-w-3xl px-6 py-8 lg:px-12'>
        <h1 className='mb-2 text-2xl font-bold text-text-strong'>
          {page.icon ? <span className='mr-2'>{page.icon}</span> : null}
          {page.title || 'Untitled'}
        </h1>
        <p className='mb-8 font-mono text-xs text-text-muted'>
          anonymous &middot; read-only
        </p>

        <RichTextEditor
          editable={false}
          minHeightClassName='min-h-[12rem]'
          value={processedContent as RichTextDocument}
        />
      </article>

      <footer className='border-t border-border-subtle px-6 py-4 text-center text-xs text-text-muted'>
        Powered by Rocketboard
      </footer>
    </div>
  )
}
