import { useEffect, useState } from 'react'

export const COMPACT_VIEWPORT_QUERY =
  '(max-width: 900px), (max-height: 520px), (hover: none), (pointer: coarse)'

export function useMediaQuery(query: string, initialValue = false): boolean {
  const [matches, setMatches] = useState(() => getMatch(query, initialValue))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    const handleChange = () => setMatches(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [query])

  return matches
}

/**
 * Robust mobile/compact detector for choosing the dedicated phone UI.
 *
 * `matchMedia('(pointer: coarse)')` is not enough on every iOS/browser mode
 * (for example when Safari requests a desktop-like viewport), so we combine:
 * viewport size, visualViewport, touch capability, and mobile user-agent hints.
 */
export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(() => getCompactViewportMatch())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(COMPACT_VIEWPORT_QUERY)
    const update = () => setCompact(getCompactViewportMatch())

    update()
    mediaQuery.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)

    return () => {
      mediaQuery.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return compact
}

function getMatch(query: string, fallback: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return fallback
  return window.matchMedia(query).matches
}

function getCompactViewportMatch(): boolean {
  if (typeof window === 'undefined') return false

  const width = window.visualViewport?.width ?? window.innerWidth
  const height = window.visualViewport?.height ?? window.innerHeight
  const shortestSide = Math.min(width, height)
  const longestSide = Math.max(width, height)
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent)

  return (
    getMatch(COMPACT_VIEWPORT_QUERY, false) ||
    width <= 900 ||
    height <= 520 ||
    (hasTouch && shortestSide <= 900) ||
    (mobileUA && longestSide <= 1200)
  )
}
