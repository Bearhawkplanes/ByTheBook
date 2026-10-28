# Build Checklist: notes for Claude

Offline Electron desktop app for shop build checklists: sections > cards > steps, each with specs, images and links into a PDF manual, plus check-offs, initials, sign-offs, PIN-protected roles and an activity log. Used in a real shop by a foreman and employees. `README.md` is the user-facing manual; keep it in sync with behaviour changes.

## Working on this repo
- The owner (GitHub: Bearhawkplanes) is not a programmer. Explain changes in plain language, give them something concrete to try, and keep answers short.
- Workflow: commit to `main` and push after each finished change (the owner pulls it on their work and home computers). One logical change per commit, with a clear message. Update `README.md` in the same commit when behaviour changes.
- No build step and no runtime dependencies. Do not add frameworks or npm packages without asking. `lib/` holds vendored pdf.js 3.11.174 (Apache 2.0); leave it alone.
- `index.html` is written in a dense style: compact one-line functions, short global names (`S`, `PR`, `CUR`), few comments that explain *why*. Match it; do not reformat or "prettify" existing code.
- Test: `node tests/page-test.js` loads the real `index.html` in headless Chromium with an in-memory stub for `window.fsapi` (Playwright and Chromium are preinstalled in Claude cloud sessions). Add a case there for new behaviour. It cannot test `main.js`/Electron itself; say so when reporting, and ask the owner to try `npm start`.

## Files
- `main.js`: Electron main process. Picks the `Data/` and `Saves/` folders (next to the exe, fallback Documents/Build Checklist), PBKDF2 PIN hashing, recovery codes, the signed profile and marker, and the `integrity()` check. Every page request goes through one IPC channel `fs` with a whitelist of `handlers`.
- `preload.js`: exposes those handlers to the page as `window.fsapi` (also the close-time `flush` handshake and `open-file`).
- `storage.js`: plain Node `.bcl` file I/O in the save folder: queued atomic writes, one `.bak` per file in `Saves/Backups/` (refreshed at most every 5 min), import, restore as a new file.
- `index.html`: the entire UI and app logic in one inline `<script>`.
- `tests/page-test.js`: see above.

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
  - **E-4420** (`CLT`): the open checklist's stamp is not this profile's ID (another computer, a reset profile, or no profile yet). **That checklist only.** Fix: Profile > "Adopt this checklist" (logged).
  - `errNow()` = `TAMPER || CLT` blocks checking, sign-offs and unlocking edits; viewing always works.
- Owner's rules (decided, do not undo):
  - Lock the whole app **only** when the profile settings themselves were tampered with. A copied checklist locks only itself.
  - The shop must never lose its files to a bad employee: even under E-4417/E-4418, checklists must still open and **Menu > Export for sharing…** must still work.
  - Export for sharing (`exportDlg` > `exportShare` > `blankCopy`) keeps all content, images and PDFs, and clears progress, stamp and `ids`. "Include the activity log" keeps the old log read-only under an "Exported as a fresh copy" segment, so the checks can be re-entered by hand in a new install.
- Security is deliberately "deters casual tampering". The README says what it does not stop; keep that honest when changing things.

## Releases
- Windows downloads are built by `.github/workflows/release.yml` on GitHub Actions when a `v*` tag is pushed, and attached to a GitHub Release. Never commit built `.exe` files or `dist/` to the repo.
- To release: bump `version` in `package.json` (and `package-lock.json`), commit, push, then `git tag vX.Y.Z` and `git push origin vX.Y.Z`. Ask the owner before tagging a release.
