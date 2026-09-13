# പഠിക്കാൻ ബംപർ — Padikkan Bumper

A Chrome extension that will not let you study until you have watched enough Reels.

Every productivity blocker makes you earn your distractions. This one inverts the
deal: open arXiv, Scholar, ChatGPT, NPTEL or your college portal and a full-screen
Kerala lottery ticket drops in front of the page. You can only buy a ticket with
coins, coins only come from scrolling Instagram Reels or YouTube Shorts, and the
draw is rigged so that four times out of five the answer is *ഡാ മോനേ… ഒന്നും
കിട്ടിയില്ല*.

It is a joke. It is also a completely functional extension — real persistence,
real odds, real countdown, no placeholders.

---

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → pick this folder (the one with `manifest.json`)
4. A welcome page opens explaining the loop

To block PDFs stored on your own disk, click **Details** on the extension card
and enable **Allow access to file URLs**.

Requires Chrome 102+.

---

## The loop

**1. You try to study.** The page freezes, media pauses, and the ticket appears.
Blocked by default: AI chatbots, research and paper sites, MOOC platforms, coding
references, note apps, college portals, anything on `.ac.in` / `.edu` / `.ac.uk`
and similar, plus any `.pdf`. Every category is toggleable and you can allowlist
any site from the popup.

**2. You go and get distracted.** Instagram Reels and YouTube Shorts are never
blocked — they are the mine. A small HUD counts your coins. One coin per **10
seconds**, and only while a video is genuinely playing in a focused, visible tab
with a reasonably large player. Parking a muted tab in the background earns
nothing.

**3. You buy a ticket.** 20 coins. Your serial is printed on the ticket.

**4. You draw.** Six reels spin. Most of the time you lose, and 55% of losses
land exactly one digit away from the winning number, purely to hurt.

| Result | Chance | You get |
|---|---|---|
| ബമ്പർ | 0.5% | 60 min + 200 coins |
| ഒന്നാം സമ്മാനം | 2% | 25 min + 40 coins |
| രണ്ടാം സമ്മാനം | 5% | 10 min |
| ആശ്വാസ സമ്മാനം | 10% | 3 min |
| 🚨 റെയ്ഡ് | 3% | police seize 35% of your coins |
| ഒന്നുമില്ല | 79.5% | nothing |

Winning stacks: draw again while a pass is live and the minutes add on. The
badge shows the time left, and a floating green chip counts down on the page.

**5. Blade.** Out of coins? A local moneylender will front you **100 coins** for
**150 debt** — 50% up front, 5% interest per hour, and he takes **half of every
coin you earn** until it is cleared. Past 400 he starts turning up on your Reels
tab in person. Past five loans he stops lending.

**6. ജാമ്യം (bail).** Genuinely need the page right now? One 90-second emergency
pass, once an hour, charged to Blade as 150 debt. A joke blocker still needs a
real exit.

---

## Settings

Click the toolbar icon. You get your balance, a draw panel, the coin mine,
Blade, stats and history. The gear opens: per-category toggles, PDF blocking,
academic-domain matching, sound, custom blocked sites, an allowlist, and a
two-press reset.

---

## How it is built

Manifest V3, no build step, no dependencies, no network calls, no bundled media.

```
manifest.json
src/background/service-worker.js   single source of truth for all state
src/shared/config.js               economy, odds, site lists, all Malayalam copy
src/shared/fx.js                   confetti on canvas, sounds synthesised in WebAudio
src/shared/overlay-ui.js           the ticket, shared by the overlay and the popup
src/content/blocker.js             freezes the page, mounts the overlay
src/content/earner.js              the coin mine HUD
src/content/overlay.css            the whole design system
src/popup/                         dashboard
src/pages/                         PDF block screen, welcome page
icons/                             nilavilakku, drawn to PNG
test/                              194 assertions, `node test/all.js`
```

The service worker owns state; every surface messages it and reads
`chrome.storage.local` directly, so ordinary browsing never has to wake it. The
overlay lives in an open shadow root so no site's CSS can touch it, and the host
is painted opaque the instant it is created so nothing is readable during the
few milliseconds the stylesheet takes to load. All overlay CSS is in `px`,
because `rem` depends on whatever root font size the host page happens to set.

Sounds are oscillators and noise buffers, confetti is a canvas, the lamp icons
were drawn programmatically — the extension ships zero binary media beyond the
five PNGs.

### Tests

```
node test/all.js
```

194 assertions over five suites: the economy and site matching, the block
overlay, the popup, the blocker content script and the coin mine. The UI suites
run the real code against a small hand-written DOM (`test/dom.js`) and a stubbed
`chrome` (`test/harness.js`), since there is no browser in the build
environment. The odds suite runs 60,000 draws and checks every prize converges.

---

## Known limitations

- **A pass expiring while a PDF is open will not re-block it.** Chrome refuses
  to run content scripts inside its built-in PDF viewer, so PDFs are handled by
  redirecting the navigation to a block page instead. Once released, that tab is
  free until you navigate again.
- **`file://` PDFs need the file-URL permission** enabled manually (above).
- Malayalam text uses the system font stack (`Nirmala UI`, `Malayalam Sangam
  MN`, `Noto Sans Malayalam`, `Manjari`). No webfont is bundled, so a machine
  with no Malayalam font installed will show boxes. Every OS ships one by
  default.
- The extension has never been run in a real browser — it was built and tested
  headlessly. Logic is well covered; exact visual rendering is not.
- State is local to the profile. Nothing syncs, nothing is sent anywhere.

---

## Turning it off

It is a joke, and jokes should be easy to leave. Allowlist the site, switch off
the category, or disable the extension in `chrome://extensions`. Nothing is
locked, nothing phones home, and there is no password.

നല്ല ഭാഗ്യം, മോനേ. 🪔
