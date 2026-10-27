import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("automatic guided tour is retired while voluntary help infrastructure remains", () => {
  const layout = read("app/layout.tsx")
  const tour = read("components/tour/PlayerGuidedTour.tsx")
  assert.doesNotMatch(layout, /PlayerGuidedTour/)
  assert.match(layout, /OptionalSignInWelcome/)
  assert.match(read("components/tour/TourThisArea.tsx"), /krys-guided-tour-start/)
  assert.match(tour, /automatic first-login tour is intentionally retired/)
})

test("existing pages expose the tour anchors used by the controller", () => {
  assert.match(read("components/navigation/ArtworkNavigation.tsx"), /data-tour=.*main-hub/)
  assert.match(read("components/PlayerProfileHero.tsx"), /data-tour=.*handicap-tile/)
  assert.match(read("app/players/[id]/page.tsx"), /data-tour=.*handicap-history/)
  assert.match(read("app/players/[id]/page.tsx"), /data-tour=.*handicap-help/)
  assert.match(read("components/scorecards/PlayerScorecardSubmission.tsx"), /data-tour=.*scorecard-submissions/)
})
