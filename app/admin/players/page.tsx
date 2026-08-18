"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import PlayerAvatar from "@/components/PlayerAvatar"

type Player = {
  id: string
  screen_name: string
  discord_id: string | null
  discord_name: string | null
  status: string | null
  active: boolean | null
  avatar_path: string | null
  is_server_booster: boolean
  has_krys_server_tag: boolean
  profile_badges: string[]
}

type LeagueMembership = {
  player_id: string | null
  league_type: string
  season_number: number
  division: string
}

type TournamentEntry = {
  player_id: string | null
  tournament_type: string
  bracket: string | null
  status: string | null
}

type IdentityLink = {
  historical_player_id: string
  canonical_player_id: string
}

type LeagueKey = "stroke" | "pyp" | "skins" | "kwt"

const CURRENT_SEASON = 59

const LEAGUES: { value: LeagueKey; label: string }[] = [
  { value: "stroke", label: "Stroke" },
  { value: "pyp", label: "PYP" },
  { value: "skins", label: "Skins" },
  { value: "kwt", label: "KWT" },
]

const DIVISIONS_BY_LEAGUE: Record<LeagueKey, string[]> = {
  stroke: ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"],
  pyp: ["PYP D1", "PYP D2", "PYP D3", "PYP D4", "PYP D5"],
  skins: ["Skins D1", "Skins D2", "Skins D3", "Skins D4", "Skins D5"],
  kwt: ["Amateur", "Semi Pro", "Pro", "Elite"],
}

const TOURNAMENTS = [
  "KWT",
  "Spicy",
  "Krys",
  "Champion of Champions",
  "Blokhaven 1 Day Tourney",
]

const TOURNAMENT_BRACKETS = [
  "Amateur",
  "Semi Pro",
  "Pro",
  "Elite",
  "Open",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
]

const PLAYER_STATUSES = ["active", "inactive", "archived", "memorial"]
const PROFILE_BADGE_OPTIONS = ["Owner", "Co-Head Admin", "Tournament Admin", "Admin"] as const

const STATUS_COLORS: Record<string, string> = {
  active: "#16a34a",
  inactive: "#6b7280",
  archived: "#dc2626",
  memorial: "#9333ea",
  merged: "#7c3aed",
}

export default function PlayersAdminPage() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>([])
  const [leagueMemberships, setLeagueMemberships] = useState<LeagueMembership[]>([])
  const [tournamentEntries, setTournamentEntries] = useState<TournamentEntry[]>([])
  const [identityLinks, setIdentityLinks] = useState<IdentityLink[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("active")

  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [newPlayerName, setNewPlayerName] = useState("")
  const [creatingPlayer, setCreatingPlayer] = useState(false)

  const [leaguePlayer, setLeaguePlayer] = useState<Player | null>(null)
  const [league, setLeague] = useState<LeagueKey>("stroke")
  const [division, setDivision] = useState("Stroke D1")
  const [savingLeague, setSavingLeague] = useState(false)

  const [tourneyPlayer, setTourneyPlayer] = useState<Player | null>(null)
  const [tournamentType, setTournamentType] = useState("KWT")
  const [tournamentBracket, setTournamentBracket] = useState("Open")
  const [savingTournament, setSavingTournament] = useState(false)

  const [statusPlayer, setStatusPlayer] = useState<Player | null>(null)
  const [playerStatus, setPlayerStatus] = useState("active")
  const [savingStatus, setSavingStatus] = useState(false)

  const [discordPlayer, setDiscordPlayer] = useState<Player | null>(null)
  const [discordId, setDiscordId] = useState("")
  const [discordName, setDiscordName] = useState("")
  const [savingDiscord, setSavingDiscord] = useState(false)
  const [discordError, setDiscordError] = useState("")
  const [recognitionPlayer, setRecognitionPlayer] = useState<Player | null>(null)
  const [recognitionBooster, setRecognitionBooster] = useState(false)
  const [recognitionServerTag, setRecognitionServerTag] = useState(false)
  const [recognitionBadges, setRecognitionBadges] = useState<string[]>([])
  const [savingRecognition, setSavingRecognition] = useState(false)
  const [recognitionError, setRecognitionError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    loadPlayers()
  }, [])

  function normalizeName(name: string) {
    return String(name || "").trim().toLowerCase()
  }

  function getPlayerStatus(player: Player) {
    return player.status || (player.active === false ? "inactive" : "active")
  }

  function isStatusActive(status: string) {
    return status === "active"
  }

  async function loadPlayers() {
    setLoading(true)

    const [playersResult, membershipsResult, tournamentsResult, identityLinksResult] = await Promise.all([
      supabase
        .from("players")
        .select("id, screen_name, discord_id, discord_name, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges")
        .order("screen_name", { ascending: true }),
      supabase
        .from("player_league_memberships")
        .select("player_id, league_type, season_number, division")
        .order("season_number", { ascending: false }),
      supabase
        .from("player_tournament_entries")
        .select("player_id, tournament_type, bracket, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("player_identity_links")
        .select("historical_player_id, canonical_player_id"),
    ])

    setLoading(false)

    const loadError = playersResult.error || membershipsResult.error || tournamentsResult.error || identityLinksResult.error
    if (loadError) {
      alert(loadError.message)
      return
    }

    setPlayers(playersResult.data || [])
    setLeagueMemberships(membershipsResult.data || [])
    setTournamentEntries(tournamentsResult.data || [])
    setIdentityLinks(identityLinksResult.data || [])
  }

  function formatLeagueName(leagueType: string) {
    const labels: Record<string, string> = {
      stroke: "Stroke",
      doubles: "Doubles",
      match: "Match",
      pyp: "PYP",
      skins: "Skins",
      kwt: "KWT",
    }

    return labels[leagueType.toLowerCase()] || leagueType
  }

  function compactDivision(divisionName: string) {
    const divisionMatch = divisionName.match(/\bD\d+\b/i)
    return divisionMatch ? divisionMatch[0].toUpperCase() : divisionName
  }

  function playerMembershipLabels(playerId: string) {
    const leagueLabels = leagueMemberships
      .filter((membership) => membership.player_id === playerId)
      .map((membership) =>
        `${formatLeagueName(membership.league_type)} S${membership.season_number} ${compactDivision(membership.division)}`
      )

    const tournamentLabels = tournamentEntries
      .filter((entry) => entry.player_id === playerId)
      .map((entry) => {
        const bracket = entry.bracket && entry.bracket !== "Open" ? ` ${entry.bracket}` : " Tournament"
        const status = entry.status && entry.status !== "registered" ? ` (${entry.status})` : ""
        return `${entry.tournament_type}${bracket}${status}`
      })

    return [...new Set([...leagueLabels, ...tournamentLabels])]
  }

  function handlePlayerAction(action: string, player: Player) {
    if (identityLinks.some((link) => link.historical_player_id === player.id) && action !== "profile") {
      alert("This is a retired merged identity. Open its profile to view the canonical player.")
      return
    }
    if (action === "profile") router.push(`/admin/players/${player.id}`)
    if (action === "league") openLeagueModal(player)
    if (action === "tournament") openTournamentModal(player)
    if (action === "status") openStatusModal(player)
    if (action === "recognition") openRecognitionModal(player)
    if (action === "merge") router.push(`/admin/players/merge?remove=${player.id}`)
  }

  function openRecognitionModal(player: Player) {
    setRecognitionPlayer(player)
    setRecognitionBooster(Boolean(player.is_server_booster))
    setRecognitionServerTag(Boolean(player.has_krys_server_tag))
    setRecognitionBadges(player.profile_badges || [])
    setRecognitionError("")
    setSuccessMessage("")
  }

  function toggleRecognitionBadge(badge: string) {
    setRecognitionBadges((current) => current.includes(badge)
      ? current.filter((currentBadge) => currentBadge !== badge)
      : [...current, badge])
  }

  async function saveProfileRecognition() {
    if (!recognitionPlayer) return
    setSavingRecognition(true)
    setRecognitionError("")
    const { data, error } = await supabase.rpc("set_site_player_profile_recognition", {
      p_player_id: recognitionPlayer.id,
      p_is_server_booster: recognitionBooster,
      p_has_krys_server_tag: recognitionServerTag,
      p_profile_badges: recognitionBadges,
    })
    setSavingRecognition(false)
    if (error) { setRecognitionError(error.message); return }

    const saved = (Array.isArray(data) ? data[0] : data) as {
      is_server_booster: boolean
      has_krys_server_tag: boolean
      profile_badges: string[]
    } | null
    if (!saved) { setRecognitionError("Recognition settings were not returned after saving."); return }

    const savedPlayerName = recognitionPlayer.screen_name
    setPlayers((current) => current.map((player) => player.id === recognitionPlayer.id ? {
      ...player,
      is_server_booster: saved.is_server_booster,
      has_krys_server_tag: saved.has_krys_server_tag,
      profile_badges: saved.profile_badges || [],
    } : player))
    setRecognitionPlayer(null)
    setSuccessMessage(`Profile recognition saved for ${savedPlayerName}.`)
  }

  function openDiscordModal(player: Player) {
    setDiscordPlayer(player)
    setDiscordId("")
    setDiscordName("")
    setDiscordError("")
    setSuccessMessage("")
  }

  async function saveDiscordIdentity() {
    if (!discordPlayer) return
    const trimmedDiscordId = discordId.trim()
    if (!trimmedDiscordId) {
      setDiscordError("Discord ID is required.")
      return
    }

    setSavingDiscord(true)
    setDiscordError("")
    const { error: saveError } = await supabase.rpc("set_site_player_discord_identity", {
      p_player_id: discordPlayer.id,
      p_discord_id: trimmedDiscordId,
      p_discord_name: discordName.trim() || null,
    })
    setSavingDiscord(false)

    if (saveError) {
      setDiscordError(saveError.message)
      return
    }

    const savedPlayerName = discordPlayer.screen_name
    setDiscordPlayer(null)
    setDiscordId("")
    setDiscordName("")
    await loadPlayers()
    setSuccessMessage(`Discord identity linked for ${savedPlayerName}.`)
  }

  async function createPlayer() {
    if (!newPlayerName.trim()) {
      alert("Enter player name")
      return
    }

    const existing = players.find(
      (p) => normalizeName(p.screen_name) === normalizeName(newPlayerName)
    )

    if (existing) {
      alert("Player already exists")
      return
    }

    setCreatingPlayer(true)

    const { error } = await supabase.from("players").insert([
      {
        screen_name: newPlayerName.trim(),
        active: true,
        status: "active",
      },
    ])

    setCreatingPlayer(false)

    if (error) {
      alert(error.message)
      return
    }

    setNewPlayerName("")
    setShowAddPlayer(false)

    await loadPlayers()

    alert("Player added ✔")
  }

  function openLeagueModal(player: Player) {
    const status = getPlayerStatus(player)

    if (!isStatusActive(status)) {
      alert("Only active players can be added to leagues.")
      return
    }

    setLeaguePlayer(player)
    setLeague("stroke")
    setDivision("Stroke D1")
  }

  function changeLeague(value: LeagueKey) {
    setLeague(value)
    setDivision(DIVISIONS_BY_LEAGUE[value][0])
  }

  async function saveLeagueRegistration() {
    if (!leaguePlayer || !league || !division) {
      alert("Missing league info")
      return
    }

    setSavingLeague(true)

    const { data: existingMemberships, error: checkError } = await supabase
      .from("player_league_memberships")
      .select("id")
      .eq("player_id", leaguePlayer.id)
      .eq("league_type", league)
      .eq("season_number", CURRENT_SEASON)
      .eq("division", division)

    if (checkError) {
      setSavingLeague(false)
      alert(checkError.message)
      return
    }

    if (existingMemberships && existingMemberships.length > 0) {
      setSavingLeague(false)
      alert(
        `${leaguePlayer.screen_name} is already registered for ${division} in Season ${CURRENT_SEASON}.`
      )
      return
    }

    const { error } = await supabase
      .from("player_league_memberships")
      .insert([
        {
          player_id: leaguePlayer.id,
          league_type: league,
          season_number: CURRENT_SEASON,
          division,
        },
      ])

    setSavingLeague(false)

    if (error) {
      alert(error.message)
      return
    }

    setLeaguePlayer(null)

    alert(`${leaguePlayer.screen_name} added to ${division} ✔`)
  }

  function openTournamentModal(player: Player) {
    const status = getPlayerStatus(player)

    if (!isStatusActive(status)) {
      alert("Only active players can be added to tournaments.")
      return
    }

    setTourneyPlayer(player)
    setTournamentType("KWT")
    setTournamentBracket("Open")
  }

  async function saveTournamentRegistration() {
    if (!tourneyPlayer || !tournamentType) {
      alert("Missing tournament info")
      return
    }

    setSavingTournament(true)

    const { data: existingEntries, error: checkError } = await supabase
      .from("player_tournament_entries")
      .select("id")
      .eq("player_id", tourneyPlayer.id)
      .eq("tournament_type", tournamentType)
      .eq("bracket", tournamentBracket)
      .eq("status", "registered")

    if (checkError) {
      setSavingTournament(false)
      alert(checkError.message)
      return
    }

    if (existingEntries && existingEntries.length > 0) {
      setSavingTournament(false)
      alert(
        `${tourneyPlayer.screen_name} is already registered for ${tournamentType} - ${tournamentBracket}.`
      )
      return
    }

    const { error } = await supabase
      .from("player_tournament_entries")
      .insert([
        {
          player_id: tourneyPlayer.id,
          player_name: tourneyPlayer.screen_name,
          tournament_type: tournamentType,
          bracket: tournamentBracket,
          status: "registered",
        },
      ])

    setSavingTournament(false)

    if (error) {
      alert(error.message)
      return
    }

    setTourneyPlayer(null)

    alert(`${tourneyPlayer.screen_name} added to ${tournamentType} ✔`)
  }

  function openStatusModal(player: Player) {
    setStatusPlayer(player)
    setPlayerStatus(getPlayerStatus(player))
  }

  async function savePlayerStatus() {
    if (!statusPlayer) return

    setSavingStatus(true)

    const shouldBeActive = playerStatus === "active"

    const { error } = await supabase
      .from("players")
      .update({
        status: playerStatus,
        active: shouldBeActive,
      })
      .eq("id", statusPlayer.id)

    setSavingStatus(false)

    if (error) {
      alert(error.message)
      return
    }

    await loadPlayers()

    setStatusPlayer(null)

    alert(`Player status updated to ${playerStatus} ✔`)
  }

  async function importPlayers() {
    setImporting(true)

    try {
      const { data: scheduleData } = await supabase
        .from("schedule")
        .select("player1, player2")

      const { data: handicapData } = await supabase
        .from("handicap_rounds")
        .select("player_name")

      const { data: careerData } = await supabase
        .from("player_career_events")
        .select("player_name")

      const uniqueImportMap = new Map<string, string>()

      function addName(value: unknown) {
        const clean = String(value || "").trim()
        if (!clean) return

        const key = normalizeName(clean)

        if (!uniqueImportMap.has(key)) {
          uniqueImportMap.set(key, clean)
        }
      }

      scheduleData?.forEach((row) => {
        addName(row.player1)
        addName(row.player2)
      })

      handicapData?.forEach((row) => {
        addName(row.player_name)
      })

      careerData?.forEach((row) => {
        addName(row.player_name)
      })

      const allNames = Array.from(uniqueImportMap.values())

      const { data: existing } = await supabase
        .from("players")
        .select("screen_name")

      const existingSet = new Set(
        (existing || []).map((p) => normalizeName(p.screen_name))
      )

      const newPlayers = allNames
        .filter((name) => !existingSet.has(normalizeName(name)))
        .map((name) => ({
          screen_name: name,
          active: true,
          status: "active",
        }))

      if (newPlayers.length > 0) {
        await supabase.from("players").insert(newPlayers)
      }

      await loadPlayers()

      alert(`Imported ${newPlayers.length} players ✔`)
    } catch {
      alert("Import failed")
    }

    setImporting(false)
  }

  const filteredPlayers = useMemo(() => {
    const q = normalizeName(search)

    return players.filter((p) => {
      const currentStatus = getPlayerStatus(p)

      const matchesSearch =
        !q || normalizeName(p.screen_name).includes(q)

      const matchesStatus =
        statusFilter === "all"
          ? true
          : currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [players, search, statusFilter])

  return (
    <main style={page}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push("/admin")}
          style={{
            background: "#333",
            border: "none",
            padding: "10px 16px",
            borderRadius: 8,
            color: "white",
            cursor: "pointer",
          }}
        >
          ← Back to Admin
        </button>
      </div>

      <div style={topBar}>
        <div>
          <h1 style={title}>Global Players</h1>

          <p style={subtitle}>
            Player command center for leagues, tournaments, profiles, merges, and legacy management.
          </p>
        </div>

        <button
          onClick={() => setShowAddPlayer(true)}
          style={addPlayerButton}
        >
          + Add Player
        </button>
      </div>

      <div style={controls}>
        <button onClick={loadPlayers} disabled={loading} style={button}>
          {loading ? "Loading..." : "Refresh Players"}
        </button>

        <button
          onClick={importPlayers}
          disabled={importing}
          style={{ ...button, background: "#16a34a" }}
        >
          {importing ? "Importing..." : "Import Existing Players"}
        </button>
      </div>

      {successMessage && <p role="status" style={successNotice}>{successMessage}</p>}

      <div style={{ marginTop: 16 }}>
        <div style={filterRow}>
          {["active", "inactive", "archived", "memorial", "all"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                ...filterButton,
                background: statusFilter === status ? "#2563eb" : "#222",
              }}
            >
              {status.toUpperCase()}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players..."
          style={searchInput}
        />
      </div>

      <table style={table}>
        <thead>
          <tr>
            <th style={tableHeading}>Player</th>
            <th style={tableHeading}>Status</th>
            <th style={tableHeading}>Discord</th>
            <th style={actionsHeading}>Actions</th>
            <th style={tableHeading}>Currently In</th>
          </tr>
        </thead>
        <tbody>
          {filteredPlayers.map((p) => {
            const identityLink = identityLinks.find((link) => link.historical_player_id === p.id)
            const currentStatus = identityLink ? "merged" : getPlayerStatus(p)
            const membershipLabels = playerMembershipLabels(p.id)

            return (
              <tr key={p.id}>
                <td style={playerTd}>
                  <div style={playerIdentityCell}>
                    <PlayerAvatar screenName={p.screen_name} avatarPath={p.avatar_path} size={40} />
                    <button
                      onClick={() => router.push(`/admin/players/${p.id}`)}
                      style={playerNameButton}
                    >
                      {p.screen_name}
                    </button>
                  </div>
                </td>

                <td style={td}>
                  <span
                    style={{
                      ...statusBadge,
                      background: STATUS_COLORS[currentStatus],
                    }}
                  >
                    {currentStatus.toUpperCase()}
                  </span>
                </td>

                <td style={td}>
                  {p.discord_id ? (
                    <span style={discordLinkedBadge}>DISCORD LINKED</span>
                  ) : (
                    <button type="button" style={addDiscordButton} onClick={() => openDiscordModal(p)}>
                      ADD DISCORD
                    </button>
                  )}
                </td>

                <td style={actionsTd}>
                  <select
                    aria-label={`Actions for ${p.screen_name}`}
                    value=""
                    onChange={(event) => handlePlayerAction(event.target.value, p)}
                    style={actionsSelect}
                  >
                    <option value="" disabled>Actions ▾</option>
                    <optgroup label="Player actions">
                      <option value="profile">Profile</option>
                      <option value="league">League</option>
                      <option value="tournament">Tournament</option>
                      <option value="status">Status</option>
                      <option value="recognition">Profile Recognition</option>
                    </optgroup>
                    <optgroup label="Identity — use carefully">
                      <option value="merge">Merge</option>
                    </optgroup>
                  </select>
                </td>

                <td style={membershipTd}>
                  <div style={membershipList}>
                    {identityLink && <span style={membershipBadge}>Merged → {players.find((player) => player.id === identityLink.canonical_player_id)?.screen_name || identityLink.canonical_player_id}</span>}
                    {membershipLabels.length > 0 ? membershipLabels.map((label) => (
                      <span key={label} style={membershipBadge}>{label}</span>
                    )) : <span style={emptyMembership}>—</span>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {showAddPlayer && (
        <Modal title="Add Player" onClose={() => setShowAddPlayer(false)}>
          <input
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Player Name"
            style={modalInput}
          />

          <button
            onClick={createPlayer}
            disabled={creatingPlayer}
            style={saveButton}
          >
            {creatingPlayer ? "Adding..." : "Add Player"}
          </button>
        </Modal>
      )}

      {leaguePlayer && (
        <Modal title="Add To League" onClose={() => setLeaguePlayer(null)}>
          <p style={modalPlayerName}>{leaguePlayer.screen_name}</p>

          <label style={label}>League</label>

          <select
            value={league}
            onChange={(e) => changeLeague(e.target.value as LeagueKey)}
            style={modalInput}
          >
            {LEAGUES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <label style={label}>Division</label>

          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            style={modalInput}
          >
            {DIVISIONS_BY_LEAGUE[league].map((div) => (
              <option key={div}>{div}</option>
            ))}
          </select>

          <p style={hint}>Season auto-applied: S{CURRENT_SEASON}</p>

          <button
            onClick={saveLeagueRegistration}
            disabled={savingLeague}
            style={saveButton}
          >
            {savingLeague ? "Saving..." : "Save League"}
          </button>
        </Modal>
      )}

      {tourneyPlayer && (
        <Modal
          title="Add To Tournament"
          onClose={() => setTourneyPlayer(null)}
        >
          <p style={modalPlayerName}>{tourneyPlayer.screen_name}</p>

          <label style={label}>Tournament</label>

          <select
            value={tournamentType}
            onChange={(e) => setTournamentType(e.target.value)}
            style={modalInput}
          >
            {TOURNAMENTS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <label style={label}>Bracket / Division</label>

          <select
            value={tournamentBracket}
            onChange={(e) => setTournamentBracket(e.target.value)}
            style={modalInput}
          >
            {TOURNAMENT_BRACKETS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <button
            onClick={saveTournamentRegistration}
            disabled={savingTournament}
            style={saveButton}
          >
            {savingTournament ? "Saving..." : "Save Tournament"}
          </button>
        </Modal>
      )}

      {statusPlayer && (
        <Modal title="Player Status" onClose={() => setStatusPlayer(null)}>
          <p style={modalPlayerName}>{statusPlayer.screen_name}</p>

          <label style={label}>Status</label>

          <select
            value={playerStatus}
            onChange={(e) => setPlayerStatus(e.target.value)}
            style={modalInput}
          >
            {PLAYER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <p style={hint}>
            Active players show in league and tournament tools. Inactive, Archived, and Memorial players are preserved but removed from active assignment.
          </p>

          <button
            onClick={savePlayerStatus}
            disabled={savingStatus}
            style={saveButton}
          >
            {savingStatus ? "Saving..." : "Save Status"}
          </button>
        </Modal>
      )}


      {discordPlayer && (
        <Modal title="Add Discord" onClose={() => !savingDiscord && setDiscordPlayer(null)}>
          <p style={modalPlayerName}>{discordPlayer.screen_name}</p>

          <label style={label} htmlFor="discord-id">Discord ID</label>
          <input
            id="discord-id"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={discordId}
            onChange={(event) => setDiscordId(event.target.value)}
            style={modalInput}
            disabled={savingDiscord}
            required
          />

          <label style={label} htmlFor="discord-name">Discord Name</label>
          <input
            id="discord-name"
            type="text"
            autoComplete="off"
            value={discordName}
            onChange={(event) => setDiscordName(event.target.value)}
            style={modalInput}
            disabled={savingDiscord}
          />

          {discordError && <p role="alert" style={modalError}>{discordError}</p>}

          <div style={modalActions}>
            <button type="button" style={cancelButton} disabled={savingDiscord} onClick={() => setDiscordPlayer(null)}>Cancel</button>
            <button type="button" style={saveButton} disabled={savingDiscord || !discordId.trim()} onClick={saveDiscordIdentity}>
              {savingDiscord ? "Saving..." : "Save Discord"}
            </button>
          </div>
        </Modal>
      )}

      {recognitionPlayer && (
        <Modal title="Profile Recognition" onClose={() => !savingRecognition && setRecognitionPlayer(null)}>
          <p style={modalPlayerName}>{recognitionPlayer.screen_name}</p>
          <p style={hint}>Presentation only. These controls never grant site permissions.</p>

          <div style={recognitionToggleGrid}>
            <label style={recognitionToggle}>
              <input type="checkbox" checked={recognitionBooster} disabled={savingRecognition} onChange={(event) => setRecognitionBooster(event.target.checked)} />
              Server Booster
            </label>
            <label style={recognitionToggle}>
              <input type="checkbox" checked={recognitionServerTag} disabled={savingRecognition} onChange={(event) => setRecognitionServerTag(event.target.checked)} />
              Krys Server Tag
            </label>
          </div>

          <fieldset style={recognitionBadgeFieldset} disabled={savingRecognition}>
            <legend style={recognitionLegend}>Profile Badge / Staff Recognition</legend>
            {PROFILE_BADGE_OPTIONS.map((badge) => (
              <label key={badge} style={recognitionBadgeOption}>
                <input type="checkbox" checked={recognitionBadges.includes(badge)} onChange={() => toggleRecognitionBadge(badge)} />
                {badge}
              </label>
            ))}
          </fieldset>

          {recognitionError && <p role="alert" style={modalError}>{recognitionError}</p>}
          <div style={modalActions}>
            <button type="button" style={cancelButton} disabled={savingRecognition} onClick={() => setRecognitionPlayer(null)}>Cancel</button>
            <button type="button" style={saveButton} disabled={savingRecognition} onClick={saveProfileRecognition}>
              {savingRecognition ? "Saving..." : "Save Recognition"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={modalTop}>
          <h2>{title}</h2>

          <button onClick={onClose} style={closeButton}>
            ✕
          </button>
        </div>

        <div style={modalBody}>{children}</div>
      </div>
    </div>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 36,
}

const subtitle: React.CSSProperties = {
  color: "#aaa",
  marginTop: 6,
}

const controls: React.CSSProperties = {
  marginTop: 18,
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
}

const button: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  padding: "10px 16px",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const addPlayerButton: React.CSSProperties = {
  background: "#16a34a",
  border: "none",
  padding: "12px 18px",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const searchInput: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
  width: "100%",
  maxWidth: 520,
}

const table: React.CSSProperties = {
  marginTop: 18,
  borderCollapse: "collapse",
  width: "100%",
}

const td: React.CSSProperties = {
  borderBottom: "1px solid #333",
  padding: 8,
}

const playerTd: React.CSSProperties = {
  ...td,
  fontWeight: 800,
  fontSize: 18,
  width: "24%",
}

const tableHeading: React.CSSProperties = {
  padding: "0 8px 8px",
  color: "#a1a1aa",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}

const actionsHeading: React.CSSProperties = {
  ...tableHeading,
  textAlign: "right",
}

const playerNameButton: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "white",
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 800,
  padding: 0,
  textAlign: "left",
}

const membershipTd: React.CSSProperties = {
  ...td,
  width: "52%",
}

const membershipList: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
}

const membershipBadge: React.CSSProperties = {
  display: "inline-flex",
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid #3f3f46",
  background: "#18181b",
  color: "#d4d4d8",
  fontSize: 12,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
}

const emptyMembership: React.CSSProperties = {
  color: "#71717a",
}

const playerIdentityCell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const actionsTd: React.CSSProperties = {
  ...td,
  width: 110,
  textAlign: "right",
}

const actionsSelect: React.CSSProperties = {
  width: 104,
  padding: "6px 8px",
  borderRadius: 7,
  border: "1px solid #52525b",
  background: "#18181b",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
}

const filterRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 14,
}

const filterButton: React.CSSProperties = {
  border: "none",
  color: "white",
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer",
}

const statusBadge: React.CSSProperties = {
  color: "white",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
}

const discordLinkedBadge: React.CSSProperties = {
  ...statusBadge,
  display: "inline-flex",
  background: "#14532d",
  color: "#bbf7d0",
  whiteSpace: "nowrap",
}

const addDiscordButton: React.CSSProperties = {
  padding: "6px 9px",
  borderRadius: 7,
  border: "1px solid #5865f2",
  background: "transparent",
  color: "#a5b4fc",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.75)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
}

const modal: React.CSSProperties = {
  width: 520,
  maxWidth: "92vw",
  background: "#111",
  border: "1px solid #444",
  borderRadius: 14,
  padding: 24,
}

const modalTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
}

const modalBody: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 14,
}

const closeButton: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "white",
  fontSize: 20,
  cursor: "pointer",
}

const modalInput: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
  width: "100%",
}

const label: React.CSSProperties = {
  color: "#ddd",
  fontWeight: 700,
  marginTop: 6,
}

const modalPlayerName: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  margin: 0,
}

const hint: React.CSSProperties = {
  color: "#aaa",
  margin: 0,
  lineHeight: 1.4,
}

const saveButton: React.CSSProperties = {
  background: "#16a34a",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 8,
}

const modalActions: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 8,
}

const cancelButton: React.CSSProperties = {
  ...button,
  background: "#27272a",
}

const modalError: React.CSSProperties = {
  margin: 0,
  padding: 10,
  borderRadius: 8,
  background: "#450a0a",
  color: "#fecaca",
}

const successNotice: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 8,
  border: "1px solid #166534",
  background: "#052e16",
  color: "#bbf7d0",
}

const recognitionToggleGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }
const recognitionToggle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: 11, border: "1px solid #3f3f46", borderRadius: 9, background: "#18181b", cursor: "pointer" }
const recognitionBadgeFieldset: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 9, padding: 13, border: "1px solid #3f3f46", borderRadius: 9 }
const recognitionLegend: React.CSSProperties = { padding: "0 6px", color: "#d4d4d8", fontWeight: 800 }
const recognitionBadgeOption: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 999, background: "#27272a", cursor: "pointer" }
