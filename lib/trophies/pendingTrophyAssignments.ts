export type PendingTrophyMatch = {
  key: string;
  playerId: string | null;
  status: "ready" | "needs-player" | "duplicate";
  selected: boolean;
  manuallyReviewed: boolean;
  manualPlayerId: string | null;
};

export function assignPendingTrophyPlayer<T extends PendingTrophyMatch>(
  candidates: T[],
  key: string,
  playerId: string,
) {
  return candidates.map((candidate) =>
    candidate.key === key
      ? {
          ...candidate,
          playerId,
          status: "ready" as const,
          selected: true,
          manuallyReviewed: true,
          manualPlayerId: playerId,
        }
      : candidate,
  );
}

export function clearPendingTrophyPlayer<T extends PendingTrophyMatch>(
  candidates: T[],
  key: string,
) {
  return candidates.map((candidate) =>
    candidate.key === key
      ? {
          ...candidate,
          playerId: null,
          status: "needs-player" as const,
          selected: false,
          manuallyReviewed: true,
          manualPlayerId: null,
        }
      : candidate,
  );
}

export function parsePendingTrophyAssignments(value: string | null) {
  if (!value) return {} as Record<string, string | null>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, playerId]) =>
          key.trim() &&
          (playerId === null ||
            (typeof playerId === "string" && playerId.trim().length > 0)),
      ),
    ) as Record<string, string | null>;
  } catch {
    return {} as Record<string, string | null>;
  }
}

export function selectedTrophiesForReview<T extends PendingTrophyMatch>(
  candidates: T[],
) {
  return candidates.filter((candidate) => candidate.selected);
}

export function validTrophiesForImport<T extends PendingTrophyMatch>(
  candidates: T[],
) {
  return selectedTrophiesForReview(candidates).filter(
    (candidate) => candidate.status === "ready" && candidate.playerId,
  );
}
