# Android phone browser play-test (owner-run)

This checks the prototype in **Chrome on your Android phone**, served from your own computer over your home Wi-Fi.
It is **not** an APK, WebView, offline-install or Play-Store test. Nothing is installed on the phone.

Result status: **NOT YET RUN** — only the owner can fill in results below.

## You need

- A computer with Node.js 22.12+ and this repo checked out on branch `feature/game-threejs-vertical-slice`.
- The phone and computer on the **same private Wi-Fi** (not guest Wi-Fi, not a public hotspot).

## Steps

1. On the computer:
   ```bash
   cd game
   npm ci
   npm run phone:preview
   ```
   This builds the game and serves the production build on port 4173 to your local network only.
   (`npm run phone` serves the live-reload dev version on port 5173 instead.)
2. Vite prints lines like `➜  Network: http://192.168.1.23:4173/`. That is your computer's LAN address.
   If none is printed, find it: Windows `ipconfig` (IPv4 Address), macOS `ipconfig getifaddr en0`, Linux `hostname -I`.
3. On the phone, open Chrome and go to `http://<that-address>:4173/?debug=1`
   (`?debug=1` shows FPS and screen size in the bottom-left corner so you can report them).
4. If it doesn't load: allow Node.js through the computer's firewall for **private** networks, and check both devices are on the same Wi-Fi.
5. When finished, press **Ctrl+C** on the computer. Never port-forward or tunnel this server to the internet.

## What to check (pass = you saw it happen)

| # | Check | Pass? |
|---|-------|-------|
| 1 | Start screen appears; "Sprites:" line shows a status (placeholders are fine) | |
| 2 | Tap **Start**: the arena, orange hero and HUD (HP bar, XP bar, timer) appear | |
| 3 | Drag a finger anywhere: a joystick circle appears and the hero moves that way; lifting the finger stops it | |
| 4 | Enemies walk in, flash red before they hit, and the HP bar drops when hit | |
| 5 | The hero shoots automatically; enemies flash and disappear; blue crystals drop | |
| 6 | Walking over crystals fills the XP bar; a **Level up** card appears; tapping a card resumes the game | |
| 7 | The page does not scroll, zoom or pull-to-refresh while you play | |
| 8 | **⛶** button enters full screen (back gesture/button exits) | |
| 9 | Rotating the phone (portrait ↔ landscape) keeps the game usable | |
| 10 | Let HP reach 0: **Defeated** screen → **Restart** starts a fresh run | |
| 11 | **Credits** (start or defeat screen) opens and **Back** closes it | |
| 12 | 🔊 button turns sound effects on/off | |
| 13 | FPS (debug corner) stays roughly 30+ with many enemies on screen | |

## Report template (copy, fill in, send back)

```text
PHONE BROWSER PLAY-TEST — Arena Slice
Commit tested (git rev-parse --short HEAD):
Phone model + Android version:
Chrome version (chrome://version):
Served with: npm run phone:preview / npm run phone
Checks 1-13 (pass/fail + note for each fail):
Typical FPS / FPS with many enemies:
Screen size shown in debug corner:
Private sprites used? (none / which roles):
Anything confusing, laggy or broken:
```

## Optional: your own private sprites

Copy `private-sprites.example.js` to `public/private-sprites/sprites.js`, put the sheet images in `public/private-sprites/`, and fill in **every** credit field from the asset's own records. Both are git-ignored and never committed. Restart `npm run phone:preview`. The start screen shows how many loaded; **Credits** lists exactly the loaded sprites and any problems. Missing, invalid or uncredited sprites fall back to the placeholder shapes.

For PMDCollab **SpriteCollab** sheets: the collection states a CC BY-NC 4.0 licence (credit required, non-commercial). Use each sprite's own credit records for `authors`; individual assets may have additional notes, so check before use. Pokémon characters themselves remain Nintendo / Creatures / GAME FREAK property — keep this personal and non-commercial, and never commit or share the files.
