# Recording the automation demo

A shot-by-shot script for a ~5 minute screen recording of the Help Scout →
Mintlify sync. Rehearse it once before recording; the rehearsal is where you
find out the run takes six minutes, not two.

Companion to [`DEMO.md`](./DEMO.md), which is the written version for people who
would rather read than watch.

---

## Before you record

**1. Stage the demo article in Help Scout.** The automation only has something
to show if something is new. Create an article in the **Installation guide**
category so it files itself under *Documentation → Installation Guide →
Platform Installation*. Keep it short but realistic — a numbered procedure with
two or three screenshots, because the formatting pass is half the story:

> **Title:** How To Install PitchPrint On Demo Cart
>
> 1. Log in to your Demo Cart admin and open the **Apps** area.
>    *(screenshot)*
> 2. Search the app store for PitchPrint and click install.
> 3. Paste your `apiKey` into the field and save.
>    *(screenshot)*
> 4. Assign a design to a product, then open it on your storefront.
>
> Note: the design tool only appears once your subscription is active.

Write the ordinals as a real numbered list and let Help Scout insert the images
inline — that reproduces the exact mess the tidy pass exists to clean up.

**2. Rehearse the whole thing.** Run the workflow once with the article in
place. Note how long each step takes. Then run the cleanup at the bottom of this
file, so the real recording starts from a clean state.

**3. Check `ANTHROPIC_API_KEY` is set** in repo secrets. Without it the page
arrives in the plainer mechanical style and the before/after in Scene 5 is much
less convincing.

**4. Open these tabs in order**, so you are never hunting during the take:

1. `pitchprint.com/docs/documentation/how-to-install-pitchprint-on-wordpress`
2. Help Scout, on the new article
3. GitHub → Actions → Help Scout sync
4. GitHub → Pull requests
5. `scripts/unpublished.json` on GitHub

**5. Hide what shouldn't be on camera** — other browser tabs, Slack, your email,
anything with a token in it. The `.env` file must not appear on screen.

---

## Scene 1 — The problem (0:00–0:30)

**Show:** the live WordPress install page on `pitchprint.com/docs`.

**Say:**

> Our documentation lives in Mintlify, but support writes in Help Scout. Those
> are two different systems, and keeping them in step used to be someone's
> manual job — copy the article across, reformat it by hand, work out where it
> belongs in the sidebar.
>
> This is what that page looks like now: proper steps, framed screenshots, a
> callout. That's the standard a new article has to meet.

Scroll slowly through one procedure. Let the `<Steps>` and `<Frame>` styling
register before moving on.

---

## Scene 2 — Support writes an article (0:30–1:15)

**Show:** Help Scout, the new article, in the editor.

**Say:**

> Here's a new install guide, written in Help Scout exactly the way support
> normally works. Numbered steps, a couple of screenshots. Nobody has told the
> documentation site this exists.

Click **Publish**. Pause on the confirmation.

> That's the entire manual step. Everything after this is automatic.

---

## Scene 3 — Trigger the sync (1:15–1:45)

**Show:** GitHub → Actions → Help Scout sync → **Run workflow**.

**Say:**

> The sync runs every Monday at 3am. I'm triggering it by hand so we don't have
> to wait until Monday.

Click Run. As the run appears:

> It fetches from Help Scout, works out what's new, formats it, and opens a pull
> request. Let's skip the waiting.

**✂ CUT HERE.** The run takes several minutes. Do not film a progress spinner.

---

## Scene 4 — The run (1:45–2:45)

**Show:** the finished run, all steps green, step list expanded.

Walk down the list, pausing on three:

**"Test the conformance guards"** — expand it.

> Before it touches anything, it runs its own safety checks — 52 of them. These
> decide whether an automatically rewritten page is allowed to ship. If they
> fail, the run stops here and nothing else happens.

**"Add new articles"** — expand it, show the ingest report.

> One new article. It worked out the file path, which sidebar group it belongs
> in, and what it had to fix: the escaped list numbers Help Scout produces, the
> images glued to the following step, wrapping the procedure in Steps.
>
> And `style AI pass applied` — it rewrote the article into our house style.

**"Guard — additions only"** — expand it.

> This is the important one. The published pages are hand-written and much
> better than the Help Scout originals. So the automation is only ever allowed
> to *add*. If it modified or deleted a single existing page, this fails and
> nothing is pushed.

---

## Scene 5 — The pull request (2:45–4:00)

**Show:** the open PR.

**Say:**

> Here's what it produced. Note what it did *not* do — it hasn't published
> anything. Nothing reaches the live site until a person merges this.

Read the PR body's review checklist aloud, briefly.

> It tells the reviewer what to look at: do the step titles read like something
> a person would write, does every screenshot have alt text, is it filed in the
> right place.

Open **Files changed**. Scroll the new `.mdx`.

**This is the payoff — do not rush it.**

> This is the generated page. Steps with short imperative titles. Screenshots
> wrapped in Frames with real alt text describing what's in them. The note at
> the end became a callout.
>
> Compare that to what came out of Help Scout — escaped numbering, images
> jammed against the text, no components at all.

If you have the before/after to hand, show it side by side here. If not, say it
and move on; don't fumble for a file on camera.

> And it can't invent things. Every image and link in the source is checked
> against the output. If the rewrite lost a step, changed a URL, or used a
> component we don't use, it's thrown away and the plainer version ships
> instead. A rejected rewrite costs us a duller page, never a wrong one.

---

## Scene 6 — What it refuses to do (4:00–4:45)

**Show:** `scripts/unpublished.json` on GitHub.

**Say:**

> Two things it deliberately won't touch.
>
> First — not every Help Scout article belongs on the site. These five install
> guides are recorded as deliberately unpublished. The sync will never propose
> them, and that decision is written down rather than being an accident of
> configuration.

**Show:** the open issue from the drift report (or say this if there isn't one).

> Second — when support edits an article that's *already* published, we don't
> overwrite it. Every one of our published pages has been rewritten by hand and
> is further ahead than the Help Scout original. So the edit gets reported in an
> issue for someone to port across by hand, and the live page is left alone.

---

## Scene 7 — Merge and go live (4:45–5:15)

**Show:** merge the PR. Then the Mintlify deployment. Then the live page.

**Say:**

> Merge, and Mintlify deploys it. Here's the article on the live site, in the
> sidebar under Platform Installation, formatted like everything around it.
>
> Support wrote an article. Everything from there was automatic, and a person
> still decided whether it went live.

**End.**

---

## If something goes wrong on camera

The guards are designed to fail loudly, so a red run is safe — but it's
awkward mid-recording. The likely ones:

| Message | What happened | On-camera recovery |
| --- | --- | --- |
| `Nothing new from Help Scout` | The article isn't in the converted output — wrong category, or excluded | Stop. Check `npm run registry` off-camera |
| `was last committed to by …` | A previous demo left the sync branch with a non-bot commit | Close the old PR, delete the branch, re-run |
| `Could not place: no group` | The article's category isn't in `category-map.json` | Cut. Add the mapping, re-run |
| `mechanical only` in the report | `ANTHROPIC_API_KEY` missing or rate-limited | Keep going — say the fallback is deliberate and show the marker comment. It's a decent story either way |

Have a finished run from the rehearsal in a spare tab. If the live one misbehaves,
switch to it rather than debugging on camera.

---

## Cleanup after recording

The demo article is real and will otherwise sit in your docs forever.

1. **Delete the article in Help Scout.**
2. **Revert the merge** (the sync only ever adds files, so a plain revert is clean):
   ```bash
   git revert -m 1 <merge-commit>
   ```
3. **Remove its baseline entry** so it isn't remembered as ingested:
   ```bash
   node -e "const f='scripts/helpscout-baseline.json',fs=require('fs');const j=JSON.parse(fs.readFileSync(f));delete j.articles['documentation/how-to-install-pitchprint-on-demo-cart'];fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
   ```
4. **Delete the `helpscout-sync` branch** on GitHub.
5. **Confirm you're back to clean:**
   ```bash
   npm run registry
   ```
   `Untracked` should be `0` and the demo article should be gone entirely.

Do the cleanup the same day. A half-removed demo article is worse than none.
