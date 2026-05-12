import {useMemo, useState} from 'react'

import type {CardRecord} from '../../cards/card.types'
import {useProjectSearchQuery} from '../../search/project-search.queries'

/**
 * Shared search + person-filter pipeline for task-based view routes.
 *
 * Provides search open/value state, runs the project search query,
 * and filters cards by person and search results.
 */
export function useViewSearchPipeline(
  projectId: string,
  cards: CardRecord[],
  personFilterUserId: string | null,
) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const activeSearchValue = searchValue.trim()

  const searchQuery = useProjectSearchQuery(
    projectId,
    activeSearchValue,
    searchOpen && activeSearchValue.length > 0,
  )

  const matchedCardIds = useMemo(
    () => new Set(searchQuery.data?.cards.map((c) => c.cardId) ?? []),
    [searchQuery.data],
  )

  const visibleCards = useMemo(() => {
    const filtered = personFilterUserId
      ? cards.filter((c) => c.assigneeUserId === personFilterUserId)
      : cards
    return !activeSearchValue
      ? filtered
      : filtered.filter((c) => matchedCardIds.has(c.id))
  }, [cards, personFilterUserId, activeSearchValue, matchedCardIds])

  return {
    searchOpen,
    setSearchOpen,
    searchValue,
    setSearchValue,
    activeSearchValue,
    visibleCards,
    searchQuery,
  }
}
