"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import PlayerAvatar from "@/components/PlayerAvatar"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { playerProfilesArtwork } from "@/lib/artworkPageMaps"
import {
  loadCanonicalPublicPlayers,
  type CanonicalPublicPlayer,
} from "@/lib/publicPlayers"
import styles from "./page.module.css"

export default function PlayerProfilesPage() {
  const router = useRouter()
  const [players, setPlayers] = useState<CanonicalPublicPlayer[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [resultsOpen, setResultsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  useEffect(() => {
    let active = true

    void loadCanonicalPublicPlayers().then((response) => {
      if (!active) return

      if (response.error) {
        setMessage(response.error.message)
      } else {
        setPlayers(response.data)
      }

      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return players

    return players.filter((player) =>
      player.screen_name.toLowerCase().includes(query)
    )
  }, [players, search])

  function updateSearch(value: string) {
    setSearch(value)
    setHighlightedIndex(0)
    setResultsOpen(true)
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setResultsOpen(true)
      setHighlightedIndex((index) => filteredPlayers.length ? (index + 1) % filteredPlayers.length : 0)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setResultsOpen(true)
      setHighlightedIndex((index) => filteredPlayers.length ? (index - 1 + filteredPlayers.length) % filteredPlayers.length : 0)
    } else if (event.key === "Enter") {
      const player = filteredPlayers[highlightedIndex] || (filteredPlayers.length === 1 ? filteredPlayers[0] : null)
      if (player) {
        event.preventDefault()
        router.push(`/players/${player.id}`)
        setResultsOpen(false)
      }
    } else if (event.key === "Escape") {
      event.preventDefault()
      setResultsOpen(false)
    }
  }

  const overlay = (
    <div className={styles.searchOverlay}>
      <label className={styles.searchRegion}>
          <span className="sr-only">Search players</span>
          <input
            type="search"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            onFocus={() => setResultsOpen(true)}
            onClick={() => setResultsOpen(true)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Search players by screen name"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="player-profile-search-results"
            aria-expanded={resultsOpen}
            aria-activedescendant={resultsOpen && filteredPlayers[highlightedIndex] ? `player-profile-option-${filteredPlayers[highlightedIndex].id}` : undefined}
            autoComplete="off"
            placeholder=""
            className={styles.searchInput}
          />
      </label>

        {resultsOpen ? (
          <div id="player-profile-search-results" className={styles.results} role="listbox" aria-label="Matching Global Players">
            {filteredPlayers.length ? filteredPlayers.map((player, index) => (
              <Link
                id={`player-profile-option-${player.id}`}
                key={player.id}
                href={`/players/${player.id}`}
                role="option"
                aria-selected={index === highlightedIndex}
                className={styles.result}
                onClick={() => setResultsOpen(false)}
              >
                <PlayerAvatar screenName={player.screen_name} avatarPath={player.avatar_path} size={40} />
                <span className={styles.resultName}>{player.screen_name}</span>
              </Link>
            )) : (
              <p className={styles.resultMessage}>{loading ? "Loading player profiles..." : message || "No players match that search."}</p>
            )}
          </div>
        ) : null}

      {message && !search.trim() ? <p className={styles.status} role="alert">{message}</p> : null}
    </div>
  )

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backButton} aria-label="Back to Krys Leagues">
        ← Krys Leagues
      </Link>
      <ArtworkNavigation definition={playerProfilesArtwork} overlay={overlay} />
    </div>
  )
}
