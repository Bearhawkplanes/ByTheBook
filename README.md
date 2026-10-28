# Build Checklist (offline desktop app)

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

## Profile and PINs (Main menu > Profile)
- The main profile (username + 4-digit PIN) is created first. Its PIN always counts as Boss.
- PINs are stored only as salted hashes in `Data/` (not in checklist files). A 4-digit PIN cannot stop someone who can edit the app files, so this is shop procedure, not high security. Five wrong PINs in a row lock the PIN pop-up for 30 seconds.
- Assign PINs to names: a roster of people, each with a unique PIN; mark people as Boss. Boss PINs only count while this is on.
- Require a PIN for sign-offs: checking or unchecking a step asks for a PIN and the Init. box fills with the name (typing initials is switched off). Signing off a main item, unchecking a signed item and Uncheck everything accept only the main profile or a Boss. The activity log records the names.
- Require a PIN to turn editing on: editing controls stay locked until a main-profile or Boss PIN is entered (Unlock button in the top bar). Turning the master file lock off needs that PIN too (Settings > This checklist is always open). Leaving to the main menu or opening another checklist locks editing again.
- Not covered by the PIN switches: deleting a checklist from the main menu, and renaming the checklist file outside the app.

## Tamper detection and recovery
- Creating the profile shows a recovery code once (also printable). Keep it off this computer. It is the only way back after a forgotten main PIN or damaged profile files.
- The profile ID is stored in `Data/profile.json` and in the marker in `Saves/`, both signed with a key built into the app, and is stamped into every checklist when it is saved.
- If the profile is missing or edited (E-4417), the profile and marker disagree or the marker is gone (E-4418), or a checklist was saved under a different profile (E-4420): a pop-up shows only the code. After closing it, viewing works, but checking boxes, sign-offs, Uncheck everything and unlocking edits show the error and do nothing. The Profile page lists the codes and offers recovery (recovery code + a new PIN). A new profile cannot be created while an error is active.
- E-4420 can also be cleared with the main profile: Profile > Adopt this checklist (logged).
- This deters casual tampering. Someone who can edit the app's code, or who deletes the profile, marker and every stamped checklist, is not stopped. Windows folder permissions are the only real lock.

## Activity log
- Menu > Activity log, Settings > Open the full activity log, or LOG on the main menu (works for any save file without opening it). Filter by name, event or item; Download CSV.
- PIN-based entries record the user ID. If a name appears with a different ID than before (for example the profile was reset and the person re-added), a red "possible tampered" segment starts and everything after it is shown separately. Use "Set PIN" in the profile to change a PIN without changing the ID.
- The log keeps the newest 5,000 entries (old step entries go first; sign-offs and markers are kept).

## Tamper detection and recovery
- The profile has a random ID. It is stored in `Data/profile.json` and in a marker in the save folder, both signed with a key built into the program, and it is stamped into every checklist when saved.
- If the profile is missing, edited, replaced, or does not match the marker or a checklist's stamp, the app opens normally and shows a pop-up with only an error code (E-4417, E-4418 or E-4420). After closing it the app is view-only: checking boxes and sign-offs show the error again, and editing stays locked. The Profile page lists the codes at the bottom (visible without a PIN) and explains they mean tampering or moved files.
- Recovery code: shown once when the profile is created (and once after upgrading from an older version), printable. Entering it on the Profile page restores the same profile ID with a new username and PIN. It is the only way out of an error, and a new profile cannot be created while an error is active.
- E-4420 (one checklist saved under a different profile): after unlocking the Profile page with the current PIN, "Adopt this checklist" re-stamps it and records the event in the log.
- To move to a new computer, copy `Data/` and `Saves/` (including the hidden-style `.profile-marker.json`) together. Copying only the checklists triggers E-4417 until the recovery code is entered.
- This deters casual tampering. Someone who can modify the program itself can still bypass it; Windows folder permissions are the only real lock.

## Activity log
- Every checklist keeps its own log: Menu > Activity log… (or Settings), and the LOG button on a selected file in the main menu (no need to open it). It can be filtered and downloaded as CSV.
- Entries made with a PIN record the user's ID. If the same name appears with a different ID (for example someone was removed and re-added, or the profile was reset), the log starts a red "POSSIBLE TAMPERED" segment, and everything after it stays visually separated. Use "Set PIN" on the Profile page to change a PIN without changing the ID. Errors and recoveries also start marked segments.

## Notes
- Autosave: about 3 seconds after you stop editing, at least every minute, when you leave a checklist, and when the window closes. If the final save fails, closing asks whether to keep the app open.
- Deleting sends the file to the Recycle Bin / Trash.
- Unsigned build: Windows SmartScreen may warn on first run ("More info" > "Run anyway").
- pdf.js (Apache 2.0) is bundled in lib/ (license: lib/PDFJS-LICENSE.txt).
