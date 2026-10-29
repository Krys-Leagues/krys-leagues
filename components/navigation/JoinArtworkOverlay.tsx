"use client"

import type { User } from "@supabase/supabase-js"

type JoinArtworkOverlayProps = {
  user: User | null
  loading: boolean
  error: string
  onSignIn: () => void
  onSignOut: () => void
}

export function JoinArtworkOverlay({ user, loading, error, onSignIn, onSignOut }: JoinArtworkOverlayProps) {
  if (loading) {
    return (
      <section className="artwork-navigation__join-status" aria-live="polite" aria-busy="true">
        <p className="artwork-navigation__join-status-loading">Loading Discord status…</p>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="artwork-navigation__join-status" aria-labelledby="join-sign-in-title" aria-live="polite">
        <div className="artwork-navigation__join-status-copy">
          <h2 id="join-sign-in-title" className="artwork-navigation__join-status-title">Sign in with Discord first</h2>
          <p className="artwork-navigation__join-status-message">Then choose a league below.</p>
          {error ? <p className="artwork-navigation__join-status-message" role="alert">{error}</p> : null}
        </div>
        <button type="button" className="artwork-navigation__join-status-button" onClick={onSignIn}>
          Sign in with Discord
        </button>
      </section>
    )
  }

  return (
    <section className="artwork-navigation__join-status" aria-labelledby="join-signed-in-title" aria-live="polite">
      <div className="artwork-navigation__join-status-copy">
        <h2 id="join-signed-in-title" className="artwork-navigation__join-status-title">
          Discord signed in <span className="artwork-navigation__join-status-check" aria-hidden="true">✓</span>
        </h2>
        <p className="artwork-navigation__join-status-message">Choose a league below.</p>
        {error ? <p className="artwork-navigation__join-status-message" role="alert">{error}</p> : null}
      </div>
      <button type="button" className="artwork-navigation__join-status-signout" onClick={onSignOut}>Sign out</button>
    </section>
  )
}
