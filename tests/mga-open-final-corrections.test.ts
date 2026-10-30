import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

const root = resolve(import.meta.dirname, "..")
const signupPage = readFileSync(resolve(root, "app/majors/[slug]/page.tsx"), "utf8")
const vipPage = readFileSync(resolve(root, "app/majors/[slug]/vip/page.tsx"), "utf8")
const signupCss = readFileSync(resolve(root, "app/majors/[slug]/page.module.css"), "utf8")
const timezoneControl = readFileSync(resolve(root, "components/MajorTimeZoneControl.tsx"), "utf8")

test("MGA Open uses the approved Gardens of Babylon display and continuous slot picker", () => {
  assert.match(signupPage, /Gardens of Babylon Easy/u)
  assert.match(signupPage, /Gardens of Babylon Hard/u)
  assert.match(signupPage, /Choose Your Time Slot/u)
  assert.match(signupPage, /slotNumbers\.get\(slot\.id\)/u)
  assert.match(signupPage, /ALL SKILL LEVELS WELCOME!/u)
  assert.match(signupCss, /url\("\/approved-pages\/gardens-of-babylon-background\.png"\)/u)
  assert.match(signupCss, /\.slotSelect\s*\{/u)
})

test("MGA Open artwork is the previously approved asset", () => {
  const artwork = readFileSync(resolve(root, "public/approved-pages/the mga open.jpg"))
  assert.equal(
    createHash("sha256").update(artwork).digest("hex").toUpperCase(),
    "35E66D4F0A386CBFA0689B980BD3AA0B8D3204C0619A40FD16060A47013296FD",
  )
})

test("MGA Open uses the supplied trophy with transparent background", () => {
  const trophy = readFileSync(resolve(root, "public/approved-pages/mga-cup.png"))
  assert.equal(
    createHash("sha256").update(trophy).digest("hex").toUpperCase(),
    "692B2F5E12B3A2432E328D65AFA4E07ADAAF4249793D328A83AAA159DB1B6D8D",
  )
  assert.match(signupPage, /approved-pages\/mga-cup\.png/u)
  assert.match(signupPage, /className=\{styles\.mgaCup\}/u)
})

test("MGA Open shows personalized VIP status without exposing eligibility mechanics", () => {
  assert.match(signupPage, /The MGA Open — Four rounds, November 12–15, 2026\./u)
  assert.match(signupPage, /const displayDescription = mgaOpen/u)
  assert.match(signupPage, /!mgaOpen && <p className=\{styles\.meta\}/u)
  assert.match(signupPage, /signupState === "priority" \? "VIP REGISTRATION OPEN"/u)
  assert.match(signupPage, /signupState === "priority" \? "priority" : signupState/u)
  assert.match(signupPage, /fetch\("\/api\/majors\/home-banner"/u)
  assert.match(signupPage, /Authorization/u)
  assert.match(signupPage, /sessionResult\.data\.session/u)
  assert.match(signupPage, /signupState === "upcoming" \? ""/u)
  assert.match(signupPage, /General registration opens/u)
  assert.doesNotMatch(signupPage, /Staging configuration; Production registration remains closed\./u)
  assert.doesNotMatch(signupPage, />Priority signup is open for eligible previous-Major players\./u)
  assert.doesNotMatch(signupPage, /Priority registration is restricted to verified eligible players/u)
})

test("MGA VIP status can verify the signed-in browser session without weakening the server check", () => {
  const route = readFileSync(resolve(root, "app/api/majors/home-banner/route.ts"), "utf8")
  assert.match(route, /request\.headers\.get\("authorization"\)/u)
  assert.match(route, /authClient\.auth\.getUser\(accessToken\)/u)
  assert.match(route, /current_user_canonical_player_id/u)
  assert.match(route, /major_final_placements/u)
  assert.match(route, /field_placement\) <= 10/u)
  assert.doesNotMatch(route, /disable.*RLS|service_role.*client.*browser/i)
})

test("OAuth callback prefers the exact Vercel Preview host without exposing tokens", () => {
  const authReturnTo = readFileSync(resolve(root, "lib/authReturnTo.ts"), "utf8")
  assert.match(authReturnTo, /NEXT_PUBLIC_VERCEL_URL/u)
  assert.match(authReturnTo, /krys-leagues-projects\.vercel\.app/u)
  assert.match(authReturnTo, /AUTH_CALLBACK_PATH, authCallbackOrigin\(\) \|\| window\.location\.origin/u)
  assert.doesNotMatch(authReturnTo, /access_token|refresh_token|VERCEL_SHARE|_vercel_share/u)
})

test("Majors admins retain independent full schedule access", () => {
  const adminLayout = readFileSync(resolve(root, "app/admin/layout.tsx"), "utf8")
  const schedulingPage = readFileSync(resolve(root, "app/admin/majors/scheduling/page.tsx"), "utf8")
  assert.match(adminLayout, /admin-authorization/u)
  assert.match(adminLayout, /permissions\.siteAdmin/u)
  assert.match(schedulingPage, /major_time_slots/u)
  assert.match(schedulingPage, /MajorTimeZoneControl/u)
  assert.match(schedulingPage, /setSlots\(/u)
  assert.doesNotMatch(schedulingPage, /get_major_signup_status|signupState|priorityWindow/u)
})

test("site admins can browse slot controls without bypassing registration gates", () => {
  assert.match(signupPage, /api\/auth\/admin-authorization/u)
  assert.match(signupPage, /const refreshSiteAdminAccess = useCallback/u)
  assert.match(signupPage, /setSiteAdmin\(authorized\)/u)
  assert.match(signupPage, /supabase\.auth\.onAuthStateChange/u)
  assert.match(signupPage, /TOKEN_REFRESHED/u)
  assert.match(signupPage, /const canChooseSlots = !signupDisabled \|\| siteAdmin/u)
  assert.match(signupPage, /disabled=\{locked \|\| !canChooseSlots\}/u)
  assert.match(signupPage, /data-disabled-reason=/u)
  assert.match(signupPage, /data-schedule-access=/u)
  assert.match(signupPage, /administrator authorization could not be verified/u)
  assert.match(signupPage, /disabled=\{saving \|\| signupDisabled \|\| !allFourSelected\}/u)
})

test("MGA priority registration is usable only after the personalized VIP check", () => {
  assert.match(signupPage, /const vipEntry = pathname\.endsWith\("\/vip"\)/u)
  assert.match(signupPage, /if \(vipEntry\) \{/u)
  assert.match(signupPage, /const showSignupControls = !mgaOpen \|\| event\.signup_open \|\| schedule\.length > 0/u)
  assert.match(signupPage, /const canSubmitSignup = !mgaOpen \|\| signupState === "open" \|\| signupState === "priority"/u)
  assert.match(signupPage, /\{\(mgaOpen \|\| event\.signup_open \|\| schedule\.length > 0\) && <section className=\{styles\.signupCard\}>/u)
  assert.match(signupPage, /Sign in with Discord to check VIP registration eligibility/u)
  assert.match(signupPage, /\{showSignupControls && <>/u)
  assert.match(signupPage, /The RPC remains the source of truth for final eligibility and signup/u)
  assert.match(vipPage, /robots: "noindex, nofollow"/u)
  assert.match(vipPage, /MajorDetailPage/u)
})

test("general and VIP entry points share one Major 2 workflow", () => {
  assert.match(vipPage, /MajorDetailPage/u)
  assert.match(signupPage, /supabase\.rpc\("signup_for_major_with_slots"/u)
  assert.match(signupPage, /p_major_event_id: event\.id/u)
  assert.doesNotMatch(vipPage, /create.*major|insert.*major_events|major_event_id.*new/u)
})

test("MGA Open uses the supplied Gardens of Babylon screenshot as the page background", () => {
  assert.doesNotMatch(signupPage, /mgaFeature/u)
  assert.match(signupCss, /url\("\/approved-pages\/gardens-of-babylon-background\.png"\)/u)
  assert.match(signupCss, /background-attachment: fixed/u)
  assert.match(signupCss, /\.mga \.contentCard,\s*\.mga \.signupCard[\s\S]*background: rgba\(3, 17, 24, 0\.14\)/u)
})

test("MGA Open background asset preserves the supplied source bytes", () => {
  const artwork = readFileSync(resolve(root, "public/approved-pages/gardens-of-babylon-background.png"))
  assert.equal(
    createHash("sha256").update(artwork).digest("hex").toUpperCase(),
    "FB96B707EF834DDE5672CBF9ED3A67DE5A3DA354263FEC7F78501DA12F12AEE8",
  )
})

test("MGA Open keeps the approved course section and removes only the duplicate signup introduction", () => {
  assert.match(signupPage, /You are signing up to play four rounds/u)
  assert.match(signupPage, /Gardens of Babylon Easy/u)
  assert.match(signupPage, /Gardens of Babylon Hard/u)
  assert.doesNotMatch(signupPage, /Player-local time:/u)
  assert.match(signupPage, /General registration opens/u)
  assert.match(signupPage, /YOU ARE SIGNING UP FOR THE MGA OPEN/u)
  assert.match(signupPage, /The MGA Open is our second Major Championship/u)
  assert.match(signupPage, /Choose your preferred playing time for each round\./u)
  assert.match(signupPage, /!mgaOpen && <p className=\{styles\.lockDeadline\}/u)
  assert.match(signupPage, /const dateShift = mgaOpen \? ""/u)
  assert.doesNotMatch(signupPage, /Your job right now/u)
  assert.doesNotMatch(signupPage, /Choose one preferred playing time for each of the four rounds/u)
  assert.doesNotMatch(signupPage, /Your Thursday, Friday, Saturday, and Sunday choices are independent\./u)
  assert.doesNotMatch(signupPage, /event\.signup_instructions/u)
  assert.doesNotMatch(signupPage, /Choose one independent time for Thursday, Friday, Saturday, and Sunday\./u)
})

test("MGA Open keeps its introduction inside the single signup panel", () => {
  assert.match(signupPage, /\{mgaOpen && <>\s*<p className=\{styles\.eyebrow\}>YOU ARE SIGNING UP FOR THE MGA OPEN/u)
  assert.match(signupPage, /<section className=\{styles\.signupCard\}>[\s\S]*?mgaExplanation[\s\S]*?MajorTimeZoneControl/u)
  assert.match(signupPage, /Official round date: \{formatPlayDate\(day\.play_date\)\}\{mgaOpen \? ` · \$\{dayName\.course\}`/u)
  assert.match(signupPage, /\{!mgaOpen && <section className=\{styles\.commitmentCard\}>/u)
})

test("MGA Open presents the approved friendly time-zone selector", () => {
  assert.match(timezoneControl, /Your Local Time Zone/u)
  assert.match(timezoneControl, /All playing times will be shown in your selected time zone\./u)
  assert.match(timezoneControl, /supportedValuesOf/u)
  assert.match(timezoneControl, /New York, United States \(Eastern Time\)/u)
  assert.match(timezoneControl, /London, United Kingdom/u)
  assert.match(timezoneControl, /Madrid, Spain \(Central European Time\)/u)
  assert.match(timezoneControl, /Sydney, Australia/u)
  assert.match(timezoneControl, /Melbourne, Australia/u)
  assert.match(timezoneControl, /Perth, Australia/u)
  assert.match(timezoneControl, /Brisbane, Australia/u)
  assert.match(timezoneControl, /Adelaide, Australia/u)
  assert.match(timezoneControl, /Auckland, New Zealand/u)
  assert.match(timezoneControl, /role="combobox"/u)
  assert.match(timezoneControl, /role="listbox"/u)
  assert.match(timezoneControl, /Confirm/u)
  assert.doesNotMatch(timezoneControl, /IANA timezone identifier|browser detected|event fallback/u)
  assert.doesNotMatch(timezoneControl, /<small[^>]*>\{option\.value\}<\/small>/u)
  assert.doesNotMatch(signupPage, /Player-local time:/u)
})

test("MGA Open outer and inner panels remain translucent for background visibility", () => {
  assert.match(signupCss, /\.mga \{[\s\S]*background: rgba\(3, 19, 27, 0\.08\)/u)
  assert.match(signupCss, /\.mga \.hero[\s\S]*rgba\(3, 18, 26, 0\.12\)/u)
  assert.match(signupCss, /\.mga \.contentCard,\s*\.mga \.signupCard[\s\S]*rgba\(3, 17, 24, 0\.14\)/u)
  assert.match(signupCss, /\.mga \.dayCard[\s\S]*rgba\(4, 24, 31, 0\.16\)/u)
  assert.match(signupCss, /\.mga \.hero h1,[\s\S]*text-shadow: 0 2px 9px rgba\(0, 0, 0, 0\.9\)/u)
})
