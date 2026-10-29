import assert from "node:assert/strict"
import test from "node:test"
import { isDuplicateWaitlistError, waitlistDuplicateMessage, waitlistSuccessMessage } from "./waitlistMessages.ts"

test("waitlist messages distinguish confirmed success from duplicate and failure cases", () => {
  assert.deepEqual(waitlistSuccessMessage("Stroke"), [
    "✅ You've been added to the Stroke wait list!",
    "Krys Leagues admins can now see your signup.",
  ])
  assert.equal(waitlistDuplicateMessage("Stroke"), "You're already on the Stroke wait list.")
  assert.equal(isDuplicateWaitlistError({ code: "23505", message: "duplicate key" }), true)
  assert.equal(isDuplicateWaitlistError({ message: "duplicate key value violates unique constraint" }), true)
  assert.equal(isDuplicateWaitlistError({ code: "PGRST500", message: "network failure" }), false)
})
