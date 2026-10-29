# Krys Leagues Decisions

This document records important architectural decisions made during the development of the Krys Leagues platform.

---

# 2026-08-05

## Decision 001 — One Platform

Decision

Krys Leagues is one platform composed of multiple applications.

Applications include:

- Website
- Discord Bot
- Future Desktop Tools
- Future Mobile Apps
- Future APIs

Reason

Everything shares the same player identity, history, and database.

---

## Decision 002 — Player Identity

Decision

The players table is the permanent identity for every player.

Reason

Players may change:

- Discord names
- Walkabout screen names
- Divisions
- Leagues

History must always remain attached to the player.

---

## Decision 003 — Discord Identity

Decision

Discord IDs are the permanent connection between Discord and player profiles.

Discord roles are NOT identity.

Reason

Roles change frequently.

Discord IDs do not.

---

## Decision 004 — Engines

Decision

The platform will be built as reusable engines instead of isolated features.

Initial engines include:

- Identity
- Community
- Game
- League
- Tournament
- Ladder
- Handicap
- Statistics
- Broadcast

Reason

Reusable engines reduce duplicate code and make future expansion easier.

---

## Decision 005 — Documentation First

Decision

Every significant architectural decision, feature, and completed milestone will be documented.

Reason

The documentation becomes the long-term memory of the project rather than relying on conversations.