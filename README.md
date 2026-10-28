# Build Checklist (offline desktop app)

## Download (Windows)
Get the latest version from the Releases page (right side of the repository page on GitHub):
- `BuildChecklist.exe`: portable, nothing to install. Put it in its own folder (for example on the desktop or a USB drive); `Saves/` and `Data/` are created next to it.
- `BuildChecklist-Setup.exe`: installer. Also lets you double-click `.bcl` files to open them.

Windows may warn the first time because the app is not code-signed: click "More info" > "Run anyway".
To update, replace the exe with the new one; keep the `Saves/` and `Data/` folders.

## Publishing a new version (maintainer)
Raise `"version"` in `package.json`, commit, then push a matching tag (for example `git tag v0.6.0 && git push origin v0.6.0`). GitHub Actions builds both Windows files and attaches them to a new release.

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
- The main profile (username + 4-digit PIN) is created first. Its PIN always counts as Boss.
- PINs are stored only as salted hashes in `Data/` (not in checklist files). A 4-digit PIN cannot stop someone who can edit the app files, so this is shop procedure, not high security. Five wrong PINs in a row lock the PIN pop-up for 30 seconds.
- Assign PINs to names: a roster of people, each with a unique PIN; mark people as Boss. Boss PINs only count while this is on.
- Require a PIN for sign-offs: checking or unchecking a step asks for a PIN and the Init. box fills with the name (typing initials is switched off). Signing off a main item, unchecking a signed item and Uncheck everything accept only the main profile or a Boss. The activity log records the names.
- Require a PIN to turn editing on: editing controls stay locked until a main-profile or Boss PIN is entered (Unlock button in the top bar). Turning the master file lock off needs that PIN too (Settings > This checklist is always open). Leaving to the main menu or opening another checklist locks editing again.
- Not covered by the PIN switches: deleting a checklist from the main menu, and renaming the checklist file outside the app.

## Tamper detection and recovery
- The profile has a random ID. It is stored in `Data/profile.json` and in a marker in `Saves/`, both signed with a key built into the app, and it is stamped into every checklist when saved.
- Recovery code: shown once when the profile is created (and once after upgrading from an older version), printable. Keep it off this computer. It is the only way back after a forgotten main PIN or damaged profile files, and the only way out of an error. Entering it on the Profile page restores the same profile ID with a new username and PIN.
- Error codes: the profile is missing, edited or replaced (E-4417); the profile and marker disagree or the marker is gone (E-4418); a checklist was saved under a different profile, or opened on a computer with no profile yet (E-4420). Only E-4417 and E-4418 lock the whole app; E-4420 affects that one checklist. The app opens normally and shows a pop-up with only the code. After closing it, viewing works, but checking boxes, sign-offs, Uncheck everything and unlocking edits show the error and do nothing.
- The Profile page lists the codes at the bottom (visible without a PIN), explains they mean tampering or moved files, and offers recovery. A new profile cannot be created while an error is active.
- E-4420 can also be cleared with the main profile: after unlocking the Profile page with the main PIN, "Adopt this checklist" re-stamps it and records the event in the log.
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
