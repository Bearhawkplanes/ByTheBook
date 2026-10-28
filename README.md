# Build Checklist (offline desktop app)

## Download (Windows)
Get the latest version from the Releases page (right side of the repository page on GitHub):
- `BuildChecklist.exe`: portable, nothing to install. Put it in its own folder (for example on the desktop or a USB drive); `Saves/` and `Data/` are created next to it.
- `BuildChecklist-Setup.exe`: installer. Also lets you double-click `.bcl` files to open them.

Windows may warn the first time because the app is not code-signed: click "More info" > "Run anyway".
To update, replace the exe with the new one; keep the `Saves/` and `Data/` folders.

## Publishing a new version (maintainer)
Raise `"version"` in `package.json` and commit. On GitHub: Releases > Draft a new release > choose a tag > type the matching tag (for example `v0.6.0`) > "Create new tag on publish" > Publish release. GitHub Actions then builds both Windows files and attaches them to that release (takes about 5 minutes).

## Build the app (on the computer type you are building for)
Install Node.js LTS once, then in this folder:

    npm install
    npm run dist            # Windows: single portable BuildChecklist.exe (in dist/)
    npm run dist:installer  # Windows: installer that also registers double-click for .bcl files
    npm run dist:linux      # Linux: AppImage (build on Linux)
    npm run dist:mac        # macOS: dmg (must be built on a Mac)

`npm start` runs it without building.

## Where things live (all next to the app by default)
- `Saves/`  your checklists, one `.bcl` file each (PDF and images are inside the file)
- `Saves/Backups/`  one older copy of each file, refreshed at most every 5 minutes. Menu > Restore from backup… opens it as a new checklist ("name (restored)"); the current file is never overwritten. Backups stay in this folder after a checklist is deleted.
- `Data/`  app settings, the signed `profile.json` (username, PIN hashes, roster, recovery verifier) and `config.json` (custom save folder)
- `Saves/.profile-marker.json`  small signed record of the profile ID, kept with the checklists

Settings > Save file location lets you move the Saves folder, e.g. to an external drive.
If the app sits somewhere it cannot write (Program Files, a Mac /Applications), it falls back to Documents/Build Checklist.

## Opening files
- Menu > Import, or drag a `.bcl` onto the app / use "Open with": the file is copied into Saves and opened.
- Double-clicking a `.bcl` in Explorer works only with the installer build (portable apps cannot register file types).
- Sharing with someone else: Menu > Export for sharing… saves a clean copy ("name (shared).bcl") with every section, step, image and PDF, but nothing checked off, no sign-offs and no profile stamp. The activity log is left out unless you tick "Include the activity log". It opens on any computer without an error; their app stamps it with their own profile on the first save. A plain copy (Save a copy elsewhere, or copying the file) keeps the stamp and shows E-4420 for that checklist only (on a computer with a different profile or with no profile yet) until it is adopted.

## Profile and PINs (Main menu > Profile)
- The main profile (username + main PIN of 5 to 8 digits) is created first. Its PIN always counts as Boss. Everyone else's PIN is exactly 4 digits. PIN boxes accept up to 8 digits and never show how many are needed, so the main PIN's length is not given away. A main PIN from an older version (4 digits) still works, but the Profile page asks for a new 5-8 digit one the next time it is opened.
- PINs are stored only as salted hashes in `Data/` (not in checklist files). A short PIN cannot stop someone who can edit the app files, so this is shop procedure, not high security. Wrong PINs are counted (any correct PIN resets the count, and restarting the app does not):
  - 5 in a row: a red message suggests "Forgot PIN?" on the Profile page.
  - Every 15th in a row: a 20-minute wait before any PIN is accepted (the main PIN too). The recovery code clears it straight away.
  - 100 in a row: error E-4419 locks the whole app the same way as a tampered profile (view and Export for sharing only) until the recovery code is entered.
- Forgot PIN or locked out: Profile > Forgot PIN? > enter the recovery code. It opens the Profile page and clears any wait or E-4419. Type a new main PIN, or leave it empty to keep the current one. The profile, names and settings stay the same.
- An employee forgot their PIN: the main profile opens the Profile page (with the recovery code if a wait is running), types a new PIN next to the person's name and clicks "Set PIN". They keep the same ID, so the activity log is not marked.
- Assign PINs to names: a roster of people, each with a unique PIN; mark people as Boss. Boss PINs only count while this is on.
- Require a PIN for sign-offs: checking or unchecking a step asks for a PIN and the Init. box fills with the name (typing initials is switched off). Signing off a main item, unchecking a signed item and Uncheck everything accept only the main profile or a Boss. The activity log records the names.
- Require a PIN to turn editing on: editing controls stay locked until a main-profile or Boss PIN is entered (Unlock button in the top bar). Turning the master file lock off needs that PIN too (Settings > This checklist is always open). Leaving to the main menu or opening another checklist locks editing again.
- Not covered by the PIN switches: deleting a checklist from the main menu, and renaming the checklist file outside the app.

## Tamper detection and recovery
- The profile has a random ID. It is stored in `Data/profile.json` and in a marker in `Saves/`, both signed with a key built into the app, and it is stamped into every checklist when saved.
- Recovery code: shown once when the profile is created (and once after upgrading from an older version), printable. Keep it off this computer. It is the only way back after a forgotten main PIN or damaged profile files, and the only way out of E-4417, E-4418 and E-4419. Entering it on the Profile page restores the same profile ID with a new username and PIN.
- Error codes: the profile is missing, edited or replaced (E-4417); the profile and marker disagree or the marker is gone (E-4418); 100 wrong PINs in a row (E-4419); a checklist was saved under a different profile, or opened on a computer with no profile yet (E-4420). E-4417, E-4418 and E-4419 lock the whole app; E-4420 affects that one checklist. The app opens normally and shows a pop-up with only the code. After closing it, viewing works, but checking boxes, sign-offs, Uncheck everything and unlocking edits show the error and do nothing.
- The Profile page lists the codes at the bottom (visible without a PIN), explains them, and offers recovery. A new profile cannot be created while an error is active.
- E-4420 (adopting): checklists saved under a different profile are highlighted in red in the Saved checklists list, with "adopt?" under the name. Clicking it explains the situation and asks for the main profile or a Boss PIN; the checklist is then re-stamped and the log records who adopted it. The open checklist can also be adopted from the Profile page ("Adopt this checklist").
- In the built app the developer tools (Ctrl+Shift+I) are switched off, so the PIN limits cannot be skipped from inside the app.
- Getting the checklists out without the recovery code (for example after a bad edit to the profile files): checklists still open for viewing, and Menu > Export for sharing… still works. Tick "Include the activity log" to keep the old log, read-only, under an "Exported as a fresh copy" marker, then re-enter the checks from it in a new install.
- To move to a new computer, copy `Data/` and `Saves/` (including the hidden-style `.profile-marker.json`) together. Copying only the checklists triggers E-4417 until the recovery code is entered.
- This deters casual tampering. Someone who can edit the app's code, or who deletes the profile, marker and every stamped checklist, is not stopped. Windows folder permissions are the only real lock.

## Activity log
- Every checklist keeps its own log: Menu > Activity log…, Settings > Open the full activity log, or the LOG button on a selected file in the main menu (no need to open it). Filter by name, event or item; Download CSV.
- Entries made with a PIN record the user's ID. If the same name appears with a different ID (for example someone was removed and re-added, or the profile was reset), the log starts a red "POSSIBLE TAMPERED" segment, and everything after it stays visually separated. Errors and recoveries also start marked segments. Use "Set PIN" on the Profile page to change a PIN without changing the ID.
- The log keeps the newest 5,000 entries (old step entries go first; sign-offs and markers are kept).

## Notes
- Autosave: about 3 seconds after you stop editing, at least every minute, when you leave a checklist, and when the window closes. If the final save fails, closing asks whether to keep the app open.
- Deleting sends the file to the Recycle Bin / Trash.
- Unsigned build: Windows SmartScreen may warn on first run ("More info" > "Run anyway").
- pdf.js (Apache 2.0) is bundled in lib/ (license: lib/PDFJS-LICENSE.txt).
