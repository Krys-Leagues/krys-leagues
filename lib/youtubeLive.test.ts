import assert from "node:assert/strict"
import test from "node:test"

import {
  KRYS_LEAGUES_YOUTUBE_CHANNEL_URL,
  getYouTubeLiveState,
  liveAlertDismissalKey,
  shouldRenderPublicLiveAlert,
} from "./youtubeLive.ts"

test("offline state uses the authoritative Krys Leagues channel", () => {
  assert.deepEqual(getYouTubeLiveState({}), {
    isLive: false,
    destination: KRYS_LEAGUES_YOUTUBE_CHANNEL_URL,
    streamId: null,
  })
})

test("live state requires and uses the configured current stream URL", () => {
  assert.deepEqual(getYouTubeLiveState({
    NEXT_PUBLIC_KRYS_LEAGUES_STREAM_IS_LIVE: "true",
    NEXT_PUBLIC_KRYS_LEAGUES_LIVE_STREAM_URL: "https://www.youtube.com/watch?v=current-stream",
    NEXT_PUBLIC_KRYS_LEAGUES_LIVE_STREAM_ID: "current-stream",
  }), {
    isLive: true,
    destination: "https://www.youtube.com/watch?v=current-stream",
    streamId: "current-stream",
  })
  assert.equal(getYouTubeLiveState({ NEXT_PUBLIC_KRYS_LEAGUES_STREAM_IS_LIVE: "true" }).isLive, false)
})

test("public live alert excludes admin and authentication surfaces", () => {
  assert.equal(shouldRenderPublicLiveAlert("/"), true)
  assert.equal(shouldRenderPublicLiveAlert("/players/example"), true)
  for (const pathname of ["/admin", "/admin/majors", "/auth/callback", "/testing-access", "/access-denied"]) {
    assert.equal(shouldRenderPublicLiveAlert(pathname), false, pathname)
  }
})

test("live dismissal is scoped to the current stream", () => {
  assert.equal(liveAlertDismissalKey("abc"), "krys-leagues-live-alert:abc")
  assert.notEqual(liveAlertDismissalKey("abc"), liveAlertDismissalKey("def"))
})
