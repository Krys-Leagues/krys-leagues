"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  loadGlobalPlayerDirectory,
  type GlobalPlayerDirectoryEntry,
} from "@/lib/identity/globalPlayerDirectory";
import {
  findTrophyDuplicate,
  parseTrophyAsset,
  resolveTrophyPlayer,
  type TrophyDuplicateComparable,
  type TrophyImportCandidate,
} from "@/lib/trophies/trophyImport";
import {
  TROPHY_IMAGE_BUCKET,
  trophyImageObjectPath,
  trophyImagePublicUrl,
  trophyImageSha256,
  validateTrophyImageFile,
} from "@/lib/trophies/trophyImages";
import styles from "./trophies.module.css";
import TrophyMedia from "@/components/TrophyMedia";
import {
  assignPendingTrophyPlayer,
  clearPendingTrophyPlayer,
  monthlyTrophyNeedsPlacement,
  parsePendingTrophyAssignments,
  parsePendingTrophyMetadata,
  selectedTrophiesForReview,
  updatePendingTrophyMetadata,
  validTrophiesForImport,
} from "@/lib/trophies/pendingTrophyAssignments";

type Trophy = {
  id: string;
  player_name: string;
  player_id: string | null;
  trophy_title: string | null;
  event_type: string | null;
  placement: string | null;
  event_name: string | null;
  league_type: string | null;
  division: string | null;
  season: string | null;
  month: string | null;
  image_url: string | null;
  source_key: string | null;
};
type ReviewCandidate = TrophyImportCandidate & {
  selected: boolean;
  manuallyReviewed: boolean;
  manualPlayerId: string | null;
};

const PENDING_ASSIGNMENTS_KEY = "krys-leagues:trophy-importer:pending-assignments:v1";
const PENDING_METADATA_KEY = "krys-leagues:trophy-importer:pending-metadata:v1";

function readPendingAssignments() {
  return parsePendingTrophyAssignments(
    window.localStorage.getItem(PENDING_ASSIGNMENTS_KEY),
  );
}

function readPendingMetadata() {
  return parsePendingTrophyMetadata(
    window.localStorage.getItem(PENDING_METADATA_KEY),
  );
}

function displayMetadata(value: string | null | undefined) {
  return value?.trim() || "Missing";
}

function sourceFilename(imageUrl: string) {
  const filename = imageUrl.split(/[\\/]/).at(-1)?.split(/[?#]/)[0];
  if (!filename) return "Missing";
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

function publishedTrophyComparable(trophy: Trophy): TrophyDuplicateComparable {
  return {
    playerId: trophy.player_id,
    playerName: trophy.player_name,
    trophyTitle: trophy.trophy_title || "",
    eventType: trophy.event_type || "",
    eventName: trophy.event_name || "",
    leagueType: trophy.league_type || "",
    division: trophy.division || "",
    placement: trophy.placement || "",
    season: trophy.season || "",
    month: trophy.month || "",
    imageUrl: trophy.image_url,
    sourceKey: trophy.source_key,
  };
}

function isManualAssignment(
  candidate: ReviewCandidate,
  players: GlobalPlayerDirectoryEntry[],
) {
  if (candidate.manuallyReviewed !== undefined) {
    return candidate.manuallyReviewed;
  }
  const parsedName =
    parseTrophyAsset(candidate.imageUrl)?.playerName || candidate.playerName;
  const automaticPlayer = resolveTrophyPlayer(parsedName, players);
  return Boolean(candidate.playerId && automaticPlayer?.id !== candidate.playerId);
}

function TrophyPlayerPicker({
  players,
  selectedPlayer,
  onSelect,
}: {
  players: GlobalPlayerDirectoryEntry[];
  selectedPlayer: GlobalPlayerDirectoryEntry | undefined;
  onSelect: (playerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeWithoutSelecting(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeWithoutSelecting);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWithoutSelecting);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const query = search.trim().toLocaleLowerCase();
  const results = players.filter((player) =>
    [player.screenName, ...player.verifiedAliases].some((name) =>
      name.toLocaleLowerCase().includes(query),
    ),
  );

  return (
    <div className={styles.playerPicker} ref={pickerRef}>
      <button
        type="button"
        className={styles.pickerButton}
        onClick={() => {
          setSearch("");
          setOpen((current) => !current);
        }}
        aria-expanded={open}
      >
        {selectedPlayer ? "Change player" : "Choose a player"}
      </button>
      {open && (
        <div className={styles.pickerMenu} role="dialog" aria-label="Choose a canonical player">
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search screen name or alias…"
            aria-label="Search canonical players"
          />
          <div className={styles.pickerResults}>
            {results.length ? (
              results.map((player) => (
                <button
                  type="button"
                  key={player.id}
                  onClick={() => {
                    onSelect(player.id);
                    setOpen(false);
                  }}
                >
                  {player.screenName}
                </button>
              ))
            ) : (
              <span>No players found.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STANDARD_PLACEMENTS = ["", "1st", "2nd", "3rd", "Winner", "Champion"];

function PendingMetadataControls({
  candidate,
  onChange,
}: {
  candidate: ReviewCandidate;
  onChange: (
    update: Partial<Pick<ReviewCandidate, "playerName" | "placement">>,
  ) => void;
}) {
  const customPlacement =
    Boolean(candidate.placement) &&
    !STANDARD_PLACEMENTS.includes(candidate.placement);
  return (
    <div className={styles.metadataControls}>
      <label data-missing={!candidate.placement.trim()}>
        Placement
        <select
          value={customPlacement ? "Other" : candidate.placement}
          onChange={(event) => onChange({ placement: event.target.value })}
        >
          <option value="">Missing</option>
          <option value="1st">1st</option>
          <option value="2nd">2nd</option>
          <option value="3rd">3rd</option>
          <option value="Winner">Winner</option>
          <option value="Champion">Champion</option>
          <option value="Other">Other / custom</option>
        </select>
      </label>
      {(customPlacement || candidate.placement === "Other") && (
        <label>
          Custom placement
          <input
            value={candidate.placement === "Other" ? "" : candidate.placement}
            onChange={(event) => onChange({ placement: event.target.value })}
            placeholder="Enter award type"
          />
        </label>
      )}
      <label data-missing={!candidate.playerName.trim()}>
        Historical Name
        <input
          value={candidate.playerName}
          onChange={(event) => onChange({ playerName: event.target.value })}
          placeholder="Missing"
        />
      </label>
    </div>
  );
}

export default function TrophyAdminPage() {
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [players, setPlayers] = useState<GlobalPlayerDirectoryEntry[]>([]);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reviewingImport, setReviewingImport] = useState(false);
  const [previewCandidate, setPreviewCandidate] =
    useState<ReviewCandidate | null>(null);
  const importReviewRef = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState<
    "all" | "ready" | "needs-player" | "duplicate"
  >("all");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [uploadForm, setUploadForm] = useState({
    playerId: "",
    displayName: "",
    title: "",
    eventName: "",
    division: "",
    placement: "",
    season: "",
    month: "",
  });
  const [editing, setEditing] = useState<Trophy | null>(null);
  const uploadPreview = useMemo(
    () => (uploadFile ? URL.createObjectURL(uploadFile) : null),
    [uploadFile],
  );

  const trophySelect =
    "id, player_name, player_id, trophy_title, event_type, placement, event_name, league_type, division, season, month, image_url, source_key";

  useEffect(() => {
    Promise.all([
      supabase
        .from("player_trophies")
        .select(trophySelect)
        .order("created_at", { ascending: false }),
      loadGlobalPlayerDirectory(),
    ])
      .then(([trophyResult, directory]) => {
        if (trophyResult.error) throw trophyResult.error;
        setTrophies((trophyResult.data || []) as Trophy[]);
        setPlayers(directory);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load trophy data.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(
    () => () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    },
    [uploadPreview],
  );
  useEffect(() => {
    if (candidates.length === 0) return;
    const pending = Object.fromEntries(
      candidates
        .map((candidate) => {
          if (candidate.manuallyReviewed !== undefined) {
            return candidate.manuallyReviewed
              ? [candidate.sourceKey, candidate.manualPlayerId]
              : null;
          }
          return isManualAssignment(candidate, players) && candidate.playerId
            ? [candidate.sourceKey, candidate.playerId]
            : null;
        })
        .filter((entry): entry is [string, string | null] => entry !== null),
    );
    window.localStorage.setItem(PENDING_ASSIGNMENTS_KEY, JSON.stringify(pending));
  }, [candidates, players]);
  useEffect(() => {
    if (candidates.length === 0) return;
    const pendingMetadata = Object.fromEntries(
      candidates
        .filter((candidate) => candidate.status !== "duplicate")
        .map((candidate) => [
          candidate.sourceKey,
          {
            historicalName: candidate.playerName,
            placement: candidate.placement,
          },
        ]),
    );
    window.localStorage.setItem(
      PENDING_METADATA_KEY,
      JSON.stringify(pendingMetadata),
    );
  }, [candidates]);
  useEffect(() => {
    if (!reviewingImport) return;
    importReviewRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [reviewingImport]);
  useEffect(() => {
    if (!previewCandidate) return;
    function closePreviewOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewCandidate(null);
    }
    document.addEventListener("keydown", closePreviewOnEscape);
    return () => document.removeEventListener("keydown", closePreviewOnEscape);
  }, [previewCandidate]);

  async function scanLibrary() {
    setScanning(true);
    setMessage("");
    try {
      const response = await fetch("/api/trophies/assets");
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not scan trophy assets.");
      const existingTrophies = trophies.map(publishedTrophyComparable);
      const pendingAssignments = readPendingAssignments();
      const pendingMetadata = readPendingMetadata();
      setCandidates(
        (payload.candidates as TrophyImportCandidate[]).map((candidate) => {
          const automaticPlayer = resolveTrophyPlayer(candidate.playerName, players);
          const hasPendingAssignment = Object.hasOwn(
            pendingAssignments,
            candidate.sourceKey,
          );
          const pendingPlayer = hasPendingAssignment
            ? players.find(
                (player) => player.id === pendingAssignments[candidate.sourceKey],
              )
            : undefined;
          const player = hasPendingAssignment ? pendingPlayer : automaticPlayer;
          const metadata = pendingMetadata[candidate.sourceKey];
          const matched = {
            ...candidate,
            playerId: player?.id || null,
            playerName: metadata?.historicalName ?? candidate.playerName,
            placement: metadata?.placement ?? candidate.placement,
          };
          const duplicate = Boolean(
            findTrophyDuplicate(matched, existingTrophies),
          );
          const status = duplicate
            ? "duplicate"
            : player
              ? "ready"
              : "needs-player";
          return {
            ...matched,
            status,
            selected: status === "ready",
            manuallyReviewed: !duplicate && hasPendingAssignment,
            manualPlayerId: !duplicate && hasPendingAssignment ? player?.id || null : null,
          };
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not scan trophy assets.",
      );
    } finally {
      setScanning(false);
    }
  }

  function assignPlayer(key: string, playerId: string) {
    const player = players.find((item) => item.id === playerId);
    if (!player) return;
    setCandidates((current) =>
      assignPendingTrophyPlayer(current, key, player.id),
    );
  }

  function clearPlayer(key: string) {
    setCandidates((current) => clearPendingTrophyPlayer(current, key));
  }


  function updateMetadata(
    key: string,
    update: Partial<Pick<ReviewCandidate, "playerName" | "placement">>,
  ) {
    setCandidates((current) =>
      updatePendingTrophyMetadata(current, key, update),
    );
  }

  function reviewSelected() {
    if (!candidates.some((candidate) => candidate.selected)) {
      setMessage("Select at least one trophy before opening final review.");
      return;
    }
    setMessage("");
    setReviewingImport(true);
  }

  async function confirmImport() {
    const selected = validTrophiesForImport(candidates);
    if (selected.length === 0) {
      setMessage(
        "No selected trophies have a canonical player. Correct the Needs Player items before confirming.",
      );
      return;
    }
    setImporting(true);
    setMessage("");
    const rows = selected.map((candidate) => ({
      player_name:
        candidate.playerName ||
        players.find((player) => player.id === candidate.playerId)?.screenName ||
        "",
      player_id: candidate.playerId,
      event_type: candidate.eventType,
      event_name: candidate.eventName,
      league_type: candidate.leagueType,
      division: candidate.division,
      placement: candidate.placement,
      season: candidate.season,
      month: candidate.month,
      trophy_title: candidate.trophyTitle,
      image_url: candidate.imageUrl,
      source_key: candidate.sourceKey,
      notes: "Imported from trophy asset library",
    }));
    const { error } = await supabase.from("player_trophies").insert(rows);
    if (error) setMessage(error.message);
    else {
      setMessage(
        `${rows.length} ${rows.length === 1 ? "trophy" : "trophies"} imported and connected to player profiles.`,
      );
      setCandidates((current) =>
        current.map((candidate) =>
          selected.some((item) => item.key === candidate.key)
            ? {
                ...candidate,
                status: "duplicate",
                selected: false,
                manuallyReviewed: false,
                manualPlayerId: null,
              }
            : candidate,
        ),
      );
      const { data } = await supabase
        .from("player_trophies")
        .select(trophySelect)
        .order("created_at", { ascending: false });
      setTrophies((data || []) as Trophy[]);
    }
    setImporting(false);
    setReviewingImport(false);
  }

  async function uploadTrophy() {
    const player = players.find((item) => item.id === uploadForm.playerId);
    if (!uploadFile || !player || !uploadForm.title.trim()) {
      setMessage(
        "Choose an image and canonical player, then enter the trophy title.",
      );
      return;
    }
    setUploading(true);
    setMessage("");
    let objectPath = "";
    try {
      const validation = await validateTrophyImageFile(uploadFile);
      if (validation) throw new Error(validation);
      const digest = await trophyImageSha256(uploadFile);
      const sourceKey = `upload:sha256:${digest}`;
      const pendingTrophy: TrophyDuplicateComparable = {
        playerId: player.id,
        playerName: player.screenName,
        trophyTitle: uploadForm.title,
        eventType: "Uploaded",
        eventName: uploadForm.eventName,
        leagueType: "",
        division: uploadForm.division,
        placement: uploadForm.placement,
        season: uploadForm.season,
        month: uploadForm.month,
        sourceKey,
      };
      const duplicate = findTrophyDuplicate(
        pendingTrophy,
        trophies.map(publishedTrophyComparable),
      );
      if (duplicate?.kind === "source" || duplicate?.kind === "image") {
        throw new Error("This exact source file has already been imported.");
      }
      if (duplicate) {
        throw new Error(
          `Already recorded: ${duplicate.trophy.trophyTitle || duplicate.trophy.eventName || "this exact trophy achievement"}.`,
        );
      }
      objectPath = trophyImageObjectPath(player.id, uploadFile, digest);
      const { error: uploadError } = await supabase.storage
        .from(TROPHY_IMAGE_BUCKET)
        .upload(objectPath, uploadFile, {
          contentType: uploadFile.type,
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);
      const imageUrl = trophyImagePublicUrl(objectPath);
      const { error: insertError } = await supabase
        .from("player_trophies")
        .insert({
          player_name: uploadForm.displayName.trim() || player.screenName,
          player_id: player.id,
          event_type: "Uploaded",
          event_name: uploadForm.eventName.trim(),
          league_type: "",
          division: uploadForm.division.trim(),
          placement: uploadForm.placement.trim(),
          season: uploadForm.season.trim(),
          month: uploadForm.month.trim(),
          trophy_title: uploadForm.title.trim(),
          image_url: imageUrl,
          source_key: sourceKey,
          notes: "Uploaded through Trophy Importer",
        });
      if (insertError) {
        await supabase.storage.from(TROPHY_IMAGE_BUCKET).remove([objectPath]);
        throw new Error(insertError.message);
      }
      const { data } = await supabase
        .from("player_trophies")
        .select(trophySelect)
        .order("created_at", { ascending: false });
      setTrophies((data || []) as Trophy[]);
      setUploadFile(null);
      setUploadForm({
        playerId: "",
        displayName: "",
        title: "",
        eventName: "",
        division: "",
        placement: "",
        season: "",
        month: "",
      });
      setMessage(
        "Trophy image uploaded and the canonical player trophy was published.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Trophy upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function saveEdit() {
    if (!editing?.player_id || !editing.trophy_title?.trim())
      return setMessage("Canonical player and trophy title are required.");
    const owner = players.find((player) => player.id === editing.player_id);
    if (!owner) return setMessage("Choose a canonical player.");
    const { error } = await supabase
      .from("player_trophies")
      .update({
        player_id: owner.id,
        player_name: editing.player_name.trim() || owner.screenName,
        trophy_title: editing.trophy_title.trim(),
        event_name: editing.event_name?.trim() || "",
        division: editing.division?.trim() || "",
        placement: editing.placement?.trim() || "",
        season: editing.season?.trim() || "",
        month: editing.month?.trim() || "",
      })
      .eq("id", editing.id);
    if (error) return setMessage(error.message);
    setTrophies((current) =>
      current.map((trophy) => (trophy.id === editing.id ? editing : trophy)),
    );
    setEditing(null);
    setMessage("Trophy record updated.");
  }

  async function deleteTrophy(trophy: Trophy) {
    if (!confirm(`Delete ${trophy.trophy_title || "this trophy"}?`)) return;
    const { error } = await supabase
      .from("player_trophies")
      .delete()
      .eq("id", trophy.id);
    if (error) return setMessage(error.message);
    const marker = "/storage/v1/object/public/trophy-images/";
    const path = trophy.image_url?.includes(marker)
      ? decodeURIComponent(trophy.image_url.split(marker)[1])
      : null;
    if (path) await supabase.storage.from(TROPHY_IMAGE_BUCKET).remove([path]);
    setTrophies((current) => current.filter((item) => item.id !== trophy.id));
    setEditing(null);
    setMessage("Trophy record deleted.");
  }

  const counts = useMemo(
    () => ({
      ready: candidates.filter((item) => item.status === "ready").length,
      review: candidates.filter((item) => item.status === "needs-player")
        .length,
      duplicate: candidates.filter((item) => item.status === "duplicate")
        .length,
      selected: candidates.filter((item) => item.selected).length,
    }),
    [candidates],
  );
  const visible =
    filter === "all"
      ? candidates
      : candidates.filter((item) => item.status === filter);
  const manualAssignments = candidates.filter(
    (candidate) => isManualAssignment(candidate, players) && candidate.playerId,
  );
  const selectedForReview = selectedTrophiesForReview(candidates);
  const validSelectedForReview = validTrophiesForImport(candidates);
  const reviewHasInvalid = selectedForReview.some(
    (candidate) =>
      candidate.status !== "ready" ||
      !candidate.playerId ||
      monthlyTrophyNeedsPlacement(candidate),
  );
  const filteredPlayers = useMemo(
    () =>
      players.filter(
        (player) =>
          !playerSearch.trim() ||
          [player.screenName, ...player.verifiedAliases].some((name) =>
            name
              .toLocaleLowerCase()
              .includes(playerSearch.trim().toLocaleLowerCase()),
          ),
      ),
    [players, playerSearch],
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Krys Leagues · Awards Desk</p>
            <h1>Trophy Importer</h1>
            <p>
              Scan the artwork library, match winners to canonical player
              identities, and publish their achievements to every trophy case.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/admin">Admin home</Link>
            <Link href="/champions">Hall of Champions</Link>
          </div>
        </header>
        <section className={styles.stats} aria-label="Trophy importer summary">
          <div>
            <strong>{trophies.length}</strong>
            <span>Published</span>
          </div>
          <div>
            <strong>{counts.ready}</strong>
            <span>Ready</span>
          </div>
          <div>
            <strong>{counts.review}</strong>
            <span>Needs a player</span>
          </div>
          <div>
            <strong>{counts.duplicate}</strong>
            <span>Already imported</span>
          </div>
        </section>
        <section className={styles.toolbar}>
          <div>
            <h2>Artwork library</h2>
            <p>
              The importer reads Monthly trophy images already shipped in{" "}
              <code>public/league-media/trophies</code>.
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={scanLibrary}
              disabled={scanning || loading}
            >
              {scanning
                ? "Scanning…"
                : candidates.length
                  ? "Scan again"
                  : "Scan trophy library"}
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={reviewSelected}
              disabled={importing || counts.selected === 0}
            >
              {`Import selected (${counts.selected})`}
            </button>
          </div>
        </section>
        {manualAssignments.length > 0 && (
          <section className={styles.reviewPanel}>
            <div>
              <h2>Current Manual Assignments</h2>
              <p>Pending browser review only. Nothing here is published yet.</p>
            </div>
            <div className={styles.assignmentList}>
              {manualAssignments.map((candidate) => {
                const player = players.find(
                  (item) => item.id === candidate.playerId,
                );
                return (
                  <div key={candidate.key} className={styles.assignmentRow}>
                    <div>
                      <strong>{player?.screenName || "Needs Player"}</strong>
                      <span>
                        {displayMetadata(candidate.playerName)} · {displayMetadata(candidate.month)} · {displayMetadata(candidate.season)} · {displayMetadata(candidate.division)} · {displayMetadata(candidate.placement)}
                      </span>
                      <small>{sourceFilename(candidate.imageUrl)}</small>
                    </div>
                    <div className={styles.assignmentActions}>
                      <TrophyPlayerPicker
                        players={players}
                        selectedPlayer={player}
                        onSelect={(playerId) => assignPlayer(candidate.key, playerId)}
                      />
                      <button
                        type="button"
                        className={styles.clearPlayer}
                        onClick={() => clearPlayer(candidate.key)}
                      >
                        Clear Player
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {reviewingImport && (
          <section ref={importReviewRef} className={styles.reviewPanel} aria-label="Final trophy import review">
            <div>
              <h2>Final Import Review</h2>
              <p>Confirm these exact canonical owners before publishing.</p>
              {reviewHasInvalid && (
                <p className={styles.reviewWarning}>
                  Needs Player items and Monthly trophies with Missing Placement cannot be published. Correct them below, or confirm to import only the valid reviewed trophies.
                </p>
              )}
            </div>
            <div className={styles.importReviewList}>
              {selectedForReview.map((candidate) => {
                const player = players.find((item) => item.id === candidate.playerId);
                const needsPlacement = monthlyTrophyNeedsPlacement(candidate);
                const valid =
                  candidate.status === "ready" &&
                  Boolean(player) &&
                  !needsPlacement;
                return (
                  <article key={candidate.key}>
                    <div className={styles.reviewThumbnail}>
                      <TrophyMedia src={candidate.imageUrl} alt={candidate.trophyTitle} />
                      <button
                        type="button"
                        className={styles.previewTrigger}
                        onClick={() => setPreviewCandidate(candidate)}
                        aria-label={`Open large preview of ${candidate.trophyTitle}`}
                      />
                    </div>
                    <div>
                      <strong>{player?.screenName || "Needs Player"}</strong>
                      <span>Historical Name: {displayMetadata(candidate.playerName)}</span>
                      <span>Month: {displayMetadata(candidate.month)}</span>
                      <span>Year: {displayMetadata(candidate.season)}</span>
                      <span>Division: {displayMetadata(candidate.division)}</span>
                      <span>Placement: {displayMetadata(candidate.placement)}</span>
                      <small>{sourceFilename(candidate.imageUrl)}</small>
                      <b data-valid={valid}>
                        {valid
                          ? "Ready"
                          : needsPlacement
                            ? "Needs Placement"
                            : "Needs Player"}
                      </b>
                      <PendingMetadataControls
                        candidate={candidate}
                        onChange={(update) =>
                          updateMetadata(candidate.key, update)
                        }
                      />
                    </div>
                  </article>
                );
              })}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => setReviewingImport(false)} disabled={importing}>
                Back to review
              </button>
              <button type="button" className={styles.primary} onClick={confirmImport} disabled={importing || validSelectedForReview.length === 0}>
                {importing ? "Importing…" : `Confirm Import (${validSelectedForReview.length})`}
              </button>
            </div>
          </section>
        )}
        {previewCandidate && (
          <div
            className={styles.previewOverlay}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setPreviewCandidate(null);
              }
            }}
          >
            <div
              className={styles.previewModal}
              role="dialog"
              aria-modal="true"
              aria-label={`Large preview of ${previewCandidate.trophyTitle}`}
            >
              <button
                type="button"
                className={styles.previewClose}
                onClick={() => setPreviewCandidate(null)}
                aria-label="Close large trophy preview"
              >
                ×
              </button>
              <div className={styles.largePreviewMedia}>
                <TrophyMedia
                  src={previewCandidate.imageUrl}
                  alt={previewCandidate.trophyTitle}
                />
              </div>
            </div>
          </div>
        )}
        <section className={styles.uploadPanel}>
          <div>
            <h2>Upload from computer</h2>
            <p>
              The selected file is copied to Supabase Storage before its trophy
              record is saved. Only the player, title, and image are required.
            </p>
          </div>
          <div className={styles.uploadGrid}>
            <label>
              Image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                onChange={(event) =>
                  setUploadFile(event.target.files?.[0] || null)
                }
              />
            </label>
            <label>
              Search Global Players
              <input
                value={playerSearch}
                placeholder="Screen name or verified alias"
                onChange={(event) => setPlayerSearch(event.target.value)}
              />
            </label>
            <label>
              Canonical player
              <select
                value={uploadForm.playerId}
                onChange={(event) =>
                  setUploadForm({ ...uploadForm, playerId: event.target.value })
                }
              >
                <option value="">Choose a player…</option>
                {filteredPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.screenName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Historical/display name
              <input
                value={uploadForm.displayName}
                placeholder="Defaults to current player name"
                onChange={(event) =>
                  setUploadForm({
                    ...uploadForm,
                    displayName: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Trophy title
              <input
                value={uploadForm.title}
                onChange={(event) =>
                  setUploadForm({ ...uploadForm, title: event.target.value })
                }
              />
            </label>
            <label>
              Event
              <input
                value={uploadForm.eventName}
                onChange={(event) =>
                  setUploadForm({
                    ...uploadForm,
                    eventName: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Division
              <input
                value={uploadForm.division}
                onChange={(event) =>
                  setUploadForm({ ...uploadForm, division: event.target.value })
                }
              />
            </label>
            <label>
              Placement / award type
              <input
                list="trophy-placement-options"
                value={uploadForm.placement}
                onChange={(event) =>
                  setUploadForm({
                    ...uploadForm,
                    placement: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Season / year
              <input
                value={uploadForm.season}
                onChange={(event) =>
                  setUploadForm({ ...uploadForm, season: event.target.value })
                }
              />
            </label>
            <label>
              Month / event detail
              <input
                value={uploadForm.month}
                onChange={(event) =>
                  setUploadForm({ ...uploadForm, month: event.target.value })
                }
              />
            </label>
          </div>
          <datalist id="trophy-placement-options">
            {[
              "Champion",
              "Winner",
              "1st Place",
              "2nd Place",
              "3rd Place",
              "Division Winner",
            ].map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {uploadPreview && (
            <div className={styles.uploadPreview}>
              <TrophyMedia src={uploadPreview} alt="Selected trophy preview" kind={uploadFile?.type === "video/mp4" ? "video" : "image"} />
              <div>
                <strong>{uploadForm.title || "Trophy preview"}</strong>
                <span>
                  {players.find((player) => player.id === uploadForm.playerId)
                    ?.screenName || "Choose a player"}
                </span>
                <span>
                  {[
                    uploadForm.eventName,
                    uploadForm.division,
                    uploadForm.placement,
                    uploadForm.season,
                    uploadForm.month,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </div>
          )}
          <button
            className={styles.primary}
            onClick={uploadTrophy}
            disabled={uploading || loading}
          >
            {uploading ? "Uploading…" : "Upload and publish trophy"}
          </button>
        </section>
        {message && (
          <p className={styles.message} role="status">
            {message}
          </p>
        )}
        {candidates.length > 0 && (
          <>
            <nav className={styles.filters} aria-label="Filter candidates">
              {(["all", "ready", "needs-player", "duplicate"] as const).map(
                (item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    aria-pressed={filter === item}
                  >
                    {item === "needs-player"
                      ? "Needs player"
                      : item[0].toUpperCase() + item.slice(1)}
                  </button>
                ),
              )}
            </nav>
            <section
              className={styles.grid}
              aria-label="Trophy import candidates"
            >
              {visible.map((candidate) => {
                const canonicalPlayer = players.find(
                  (player) => player.id === candidate.playerId,
                );
                return (
                  <article
                    className={styles.card}
                    key={candidate.key}
                    data-status={candidate.status}
                  >
                    <div className={styles.art}>
                      <TrophyMedia
                        src={candidate.imageUrl}
                        alt={candidate.trophyTitle}
                      />
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.cardHeading}>
                        <span className={styles.badge}>
                          {candidate.status === "needs-player"
                            ? "Review · Needs Player"
                            : candidate.status}
                        </span>
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={candidate.selected}
                            disabled={candidate.status !== "ready"}
                            onChange={(event) =>
                              setCandidates((current) =>
                                current.map((item) =>
                                  item.key === candidate.key
                                    ? {
                                        ...item,
                                        selected: event.target.checked,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />{" "}
                          Select
                        </label>
                      </div>
                      <p className={styles.playerName}>
                        <span>Player</span>
                        {canonicalPlayer?.screenName || "Needs Player"}
                      </p>
                      <dl className={styles.metadata}>
                        <div>
                          <dt>Historical Name</dt>
                          <dd>{displayMetadata(candidate.playerName)}</dd>
                        </div>
                        <div>
                          <dt>Month</dt>
                          <dd>{displayMetadata(candidate.month)}</dd>
                        </div>
                        <div>
                          <dt>Year</dt>
                          <dd>{displayMetadata(candidate.season)}</dd>
                        </div>
                        <div>
                          <dt>Division</dt>
                          <dd>{displayMetadata(candidate.division)}</dd>
                        </div>
                        <div>
                          <dt>Placement</dt>
                          <dd>{displayMetadata(candidate.placement)}</dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd title={sourceFilename(candidate.imageUrl)}>
                            {sourceFilename(candidate.imageUrl)}
                          </dd>
                        </div>
                      </dl>
                      {candidate.status !== "duplicate" && (
                        <>
                          <PendingMetadataControls
                            candidate={candidate}
                            onChange={(update) =>
                              updateMetadata(candidate.key, update)
                            }
                          />
                          <div className={styles.assignmentActions}>
                            <TrophyPlayerPicker
                              players={players}
                              selectedPlayer={canonicalPlayer}
                              onSelect={(playerId) =>
                                assignPlayer(candidate.key, playerId)
                              }
                            />
                            {candidate.manuallyReviewed && candidate.playerId && (
                              <button
                                type="button"
                                className={styles.clearPlayer}
                                onClick={() => clearPlayer(candidate.key)}
                              >
                                Clear Player
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
        {!loading && candidates.length === 0 && (
          <section className={styles.empty}>
            <span>🏆</span>
            <h2>Ready for the first scan</h2>
            <p>
              Nothing is written until you review the matches and choose Import
              selected.
            </p>
          </section>
        )}
        <section className={styles.uploadPanel}>
          <div>
            <h2>Published trophies</h2>
            <p>Edit incorrect metadata or delete an incorrect trophy record.</p>
          </div>
          <div className={styles.publishedList}>
            {trophies.map((trophy) => (
              <article key={trophy.id} className={styles.publishedRow}>
                {trophy.image_url && <TrophyMedia src={trophy.image_url} alt={trophy.trophy_title || "Trophy media"} />}
                {editing?.id === trophy.id ? (
                  <div className={styles.editGrid}>
                    <label>
                      Canonical player
                      <select
                        value={editing.player_id || ""}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            player_id: event.target.value,
                          })
                        }
                      >
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.screenName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Historical/display name
                      <input
                        value={editing.player_name}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            player_name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Title
                      <input
                        value={editing.trophy_title || ""}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            trophy_title: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Event
                      <input
                        value={editing.event_name || ""}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            event_name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Division
                      <input
                        value={editing.division || ""}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            division: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Placement
                      <input
                        value={editing.placement || ""}
                        onChange={(event) =>
                          setEditing({
                            ...editing,
                            placement: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Season
                      <input
                        value={editing.season || ""}
                        onChange={(event) =>
                          setEditing({ ...editing, season: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Month
                      <input
                        value={editing.month || ""}
                        onChange={(event) =>
                          setEditing({ ...editing, month: event.target.value })
                        }
                      />
                    </label>
                    <div className={styles.actions}>
                      <button className={styles.primary} onClick={saveEdit}>
                        Save changes
                      </button>
                      <button
                        className={styles.secondary}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong>{trophy.trophy_title || "Trophy"}</strong>
                    <p>
                      {trophy.player_name} ·{" "}
                      {[
                        trophy.event_name,
                        trophy.division,
                        trophy.placement,
                        trophy.season,
                        trophy.month,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className={styles.actions}>
                      <button
                        className={styles.secondary}
                        onClick={() => setEditing({ ...trophy })}
                      >
                        Edit
                      </button>
                      <button
                        className={styles.danger}
                        onClick={() => deleteTrophy(trophy)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
