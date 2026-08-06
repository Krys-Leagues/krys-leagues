# Krys Leagues Architecture

## Platform Overview

Krys Leagues is built as a single platform composed of multiple applications that share the same player identity and database.

The website, Discord bot, tournaments, ladders, broadcasts, and future tools are all components of one system.

---

# Core Components

## Website

Purpose:

- Player profiles
- League management
- Tournament management
- Statistics
- Standings
- Administration

---

## Discord Bot

Purpose:

- Discord commands
- Game management
- League automation
- Notifications
- Role management
- Interactive workflows

---

## Database

Supabase is the single source of truth.

Core tables include:

- players
- discord_members
- player_league_memberships
- matches
- schedules
- results

Additional tables will be added as the platform grows.

---

# Identity

The players table is the master player record.

discord_members stores Discord account information and links Discord accounts to players.

Discord roles are not player identity.

Discord IDs are the permanent identity link between Discord and the platform.

---

# Platform Engines

The platform is divided into reusable engines.

## Identity Engine

Responsible for:

- Player profiles
- Discord linking
- Account management

---

## Game Engine

Responsible for:

- Casual games
- Community games
- Custom game modes
- Threads
- Join/Leave workflows

---

## League Engine

Responsible for:

- Seasons
- Divisions
- Scheduling
- Results
- Standings
- Promotions

---

## Tournament Engine

Responsible for:

- Brackets
- Cups
- Invitational events
- KWT

---

## Ladder Engine

Responsible for:

- Monthly ladders
- Rankings
- Promotions
- Relegations

---

## Handicap Engine

Responsible for:

- Ratings
- Differentials
- Handicap Index
- Course ratings

---

## Statistics Engine

Responsible for:

- Career statistics
- Records
- Achievements
- Historical reporting

---

## Broadcast Engine

Responsible for:

- Stream graphics
- OBS tools
- Live scoring
- Tournament broadcasts

---

# Design Principles

- One Player. One Identity.
- Preserve history.
- Build reusable systems.
- Website and bot work together.
- Long-term architecture takes priority over short-term shortcuts.