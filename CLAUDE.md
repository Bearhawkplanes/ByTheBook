# Build Checklist: notes for Claude

Offline Electron desktop app for shop build checklists: sections > cards > steps, each with specs, images and links into a PDF manual, plus check-offs, initials, sign-offs, PIN-protected roles and an activity log. Used in a real shop by a foreman and employees. `README.md` is the user-facing manual; keep it in sync with behaviour changes.

## Working on this repo
- The owner (GitHub: Bearhawkplanes) is not a programmer. Explain changes in plain language, give them something concrete to try, and keep answers short.
- Workflow: commit to `main` and push after each finished change (the owner pulls it on their work and home computers). One logical change per commit, with a clear message. Update `README.md` in the same commit when behaviour changes.
- No build step and no runtime dependencies. Do not add frameworks or npm packages without asking. `lib/` holds vendored pdf.js 3.11.174 (Apache 2.0); leave it alone.
- `index.html` is written in a dense style: compact one-line functions, short global names (`S`, `PR`, `CUR`), few comments that explain *why*. Match it; do not reformat or "prettify" existing code.
- Test: `node tests/main-test.js` runs the real `main.js` and `storage.js` against a fake Electron in a temp folder (PIN limits, E-4419, stamps). `node tests/page-test.js` loads the real `index.html` in headless Chromium with an in-memory stub for `window.fsapi` (Playwright and Chromium are preinstalled in Claude cloud sessions). Add a case there for new behaviour. It cannot test `main.js`/Electron itself; say so when reporting, and ask the owner to try `npm start`.

## Files
- `main.js`: Electron main process. Picks the `Data/` and `Saves/` folders (next to the exe, fallback Documents/Build Checklist), PBKDF2 PIN hashing, recovery codes, the signed profile and marker, and the `integrity()` check. Every page request goes through one IPC channel `fs` with a whitelist of `handlers`.
- `preload.js`: exposes those handlers to the page as `window.fsapi` (also the close-time `flush` handshake and `open-file`).
- `storage.js`: plain Node `.bcl` file I/O in the save folder: queued atomic writes, one `.bak` per file in `Saves/Backups/` (refreshed at most every 5 min), import, restore as a new file.
- `index.html`: the entire UI and app logic in one inline `<script>`.
- `tests/main-test.js`, `tests/page-test.js`: see above.

## Data model (`.bcl` = JSON)
- Open checklist in memory: `S` = `{name, manual, pdfs[], sections[{title, sign, cards[{...item, steps[item]}]}], locked, log[], seg, segs{}, ids{}, stamp}`.
- Item fields (`mk()`): `text qty size spec desc page pdf media[] ver src` (content) and `done init doneAt sig sigDraft hist[]` (progress).
- `pack()` serialises `S` and inlines image (`files{}`) and PDF (`pdfs[].data`) data URLs; `unpack()`/`norm()` read and migrate older formats. Images live in `MEDIA`, PDFs in `PDFS` while open.
- Autosave: `save()` debounces 3 s, `flush()` writes; also every minute and when the window closes.

## Profile, PINs and tamper detection (the sensitive part)
- `PR` = main profile `{pid, user, salt, hash, rv, req{names, sign, edit}, people[]}`, stored signed (HMAC with `BUILD_KEY` in main.js) in `Data/profile.json`; a signed marker `{pid, rv}` sits in `Saves/.profile-marker.json`. PINs exist only as hashes.
- Every saved checklist is stamped with `S.stamp = {pid, rv}` (in `pack()`).
- Error codes:
  - **E-4417 / E-4418** (`TAMPER`): the profile or marker is missing, edited or mismatched. Comes from `integrity()` in main.js. **Whole app view-only.** Fix: recovery code on the Profile page.
  - **E-4419** (`TAMPER`): 100 wrong PINs in a row. **Whole app view-only** until the recovery code is entered.
  - **E-4420** (`CLT`): the open checklist's stamp is not this profile's ID (another computer, a reset profile, or no profile yet). **That checklist only.** Fix: "adopt?" on the flagged row in Saved checklists (main or Boss PIN), or Profile > "Adopt this checklist". Logged either way. `storage.list()` reports each file's stamp (`pid`), cached by modification time.
  - `errNow()` = `TAMPER || CLT` blocks checking, sign-offs and unlocking edits; viewing always works.
- Wrong-PIN limits live in main.js (`pinTry`), stored in the signed profile (`fails`, `until`) so a restart or the page cannot reset them; any correct PIN resets them, and so does the right recovery code (`recCheck`). 5 in a row: "Forgot PIN?" hint; every 15th: 20-minute wait; 100: E-4419. Every PIN a person types must go through `pinTry` (`whoIs`, Profile unlock); `matchPin` is only for checking whether a new PIN is taken. "Forgot PIN?" on the Profile page takes the recovery code without an error: it unlocks the page and clears waits; a new main PIN is optional when the profile file is intact (`canKeepPin`). Employee PINs are reset with "Set PIN". Developer tools are off in packaged builds (`devTools: !app.isPackaged`).
- Owner's rules (decided, do not undo):
  - Lock the whole app **only** when the profile settings themselves were tampered with. A copied checklist locks only itself.
  - The shop must never lose its files to a bad employee: even under E-4417/E-4418, checklists must still open and **Menu > Export for sharing…** must still work.
  - Export for sharing (`exportDlg` > `exportShare` > `blankCopy`) keeps all content, images and PDFs, and clears progress, stamp and `ids`. "Include the activity log" keeps the old log read-only under an "Exported as a fresh copy" segment, so the checks can be re-entered by hand in a new install.
- Security is deliberately "deters casual tampering". The README says what it does not stop; keep that honest when changing things.

## Releases
- Windows downloads are built by `.github/workflows/release.yml` on GitHub Actions when a release is published, and attached to it. Never commit built `.exe` files or `dist/` to the repo.
- To release: bump `version` in `package.json` (and `package-lock.json`), commit and push; then the owner publishes a release on GitHub with tag `vX.Y.Z` (cloud sessions cannot push tags: HTTP 403). Ask the owner before preparing a release.
