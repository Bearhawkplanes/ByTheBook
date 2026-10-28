# Build Checklist (offline desktop app)

## Download (Windows)
Get the latest version from the Releases page (right side of the repository page on GitHub):
- `BuildChecklist.exe`: portable, nothing to install. Put it in its own folder (for example on the desktop or a USB drive); `Saves/` and `Data/` are created next to it.
- `BuildChecklist-Setup.exe`: installer. Also lets you double-click `.bcl` files to open them.

Windows may warn the first time because the app is not code-signed: click "More info" > "Run anyway".
To update, replace the exe with the new one; keep the `Saves/` and `Data/` folders.

## Updates
- Settings > Updates shows the version you have. "Check for updates automatically" (off by default) asks GitHub about once a day, only when online; "Check now" asks straight away.
- When a newer version is out, a bar appears along the bottom of the menu page: "Version 1.2.0 is available (you have 1.1.0)" with:
  - What's new?: opens the release page on GitHub with the list of changes.
  - Install: saves your work, downloads the new version (the bar shows progress), checks it is complete and undamaged, closes, swaps in the new program in the same folder and opens again. Checklists, profile and settings stay exactly as they are. The version you had is kept next to the app as "BuildChecklist (previous)", so you can go back by opening that.
  - Dismiss: hides the bar until tomorrow. Skip this version: no more reminders about this version (a newer one still shows).
- Install works in place for the portable Windows .exe and the Linux AppImage; the Windows installer version runs the new installer. Elsewhere (Mac) the button says Download and opens the download page.
- Updates come from this repository's Releases, so they must be public for the check to work. Pre-releases are ignored, which is handy for trying a version first.
- Checklists remember which version saved them. If an older copy of the app opens a checklist saved by a newer one, it opens view-only with a message to update, and never saves it, so nothing new in it is lost. An older copy also won't overwrite a profile saved by a newer one.

## Publishing a new version (maintainer)
Raise `"version"` in `package.json` and commit. On GitHub: Releases > Draft a new release > choose a tag > type the matching tag (for example `v0.6.0`) > "Create new tag on publish" > Publish release. GitHub Actions then builds both Windows files and attaches them to that release (takes about 5 minutes).

## Build the app (on the computer type you are building for)
Install Node.js LTS once, then in this folder:

    npm install
    npm run dist            # Windows: single portable BuildChecklist.exe (in dist/)
    npm run dist:installer  # Windows: installer that also registers double-click for .bcl files
    npm run dist:linux      # Linux: AppImage (build on Linux)
    npm run dist:mac        # macOS: dmg (must be built on a Mac)

`npm start` runs it without building. `npm install` also downloads ffmpeg for the computer it runs on.

## Where things live (all next to the app by default)
- `Saves/`  your checklists, one `.bcl` file each (PDF and images are inside the file)
- `Saves/Backups/`  one older copy of each file, refreshed at most every 5 minutes. Menu > Restore from backup… opens it as a new checklist ("name (restored)"); the current file is never overwritten. Backups stay in this folder after a checklist is deleted.
- `Data/`  app settings, the signed `profile.json` (username, PIN hashes, roster, recovery verifier) and `config.json` (custom save folder)
- `Saves/.profile-marker.json`  small signed record of the profile ID, kept with the checklists

Settings > Save file location lets you move the Saves folder, e.g. to an external drive.
If the app sits somewhere it cannot write (Program Files, a Mac /Applications), it falls back to Documents/Build Checklist.

## Starting a new job
Menu (☰) > Start a new job from this checklist…: asks for a name (suggests "<name> - new job"), then makes a fresh copy inside the app with every section, step, image, PDF and video and nothing checked off, and opens it. Its activity log starts with "New job started, from the checklist …". The original keeps its progress. A master file lock carries over to the job.

## Opening files
- Menu > Import, or drag a `.bcl` onto the app / use "Open with": the file is copied into Saves and opened.
- Double-clicking a `.bcl` in Explorer works only with the installer build (portable apps cannot register file types).
- Sharing with someone else: Menu > Export… > Fresh copy saves a clean copy ("name (shared).bcl") with every section, step, image and PDF, but nothing checked off, no sign-offs and no profile stamp. The activity log is left out unless you tick "Include the activity log". It opens on any computer without an error; their app stamps it with their own profile on the first save. A plain copy (Save a copy elsewhere, or copying the file) keeps the stamp and shows E-4420 for that checklist only (on a computer with a different profile or with no profile yet) until it is adopted.

## Profile and PINs (Main menu > Profile)
- The main profile (username + main PIN of 5 to 8 digits) is created first. Its PIN always counts as Boss. Everyone else's PIN is exactly 4 digits. PIN boxes accept up to 8 digits and never show how many are needed, so the main PIN's length is not given away. A main PIN from an older version (4 digits) still works, but the Profile page asks for a new 5-8 digit one the next time it is opened.
- PINs are stored only as salted hashes in `Data/` (not in checklist files). A short PIN cannot stop someone who can edit the app files, so this is shop procedure, not high security. Wrong PINs are counted (any correct PIN resets the count, and restarting the app does not):
  - 5 in a row: a red message suggests "Forgot PIN?" on the Profile page.
  - Every 15th in a row: a 20-minute wait before any PIN is accepted (the main PIN too). The recovery code clears it straight away.
  - 100 in a row: error E-4419 locks the whole app the same way as a tampered profile (view and Menu > Export… only) until the recovery code is entered.
- Forgot PIN or locked out: Profile > Forgot PIN? > enter the recovery code. It opens the Profile page and clears any wait or E-4419. Type a new main PIN, or leave it empty to keep the current one. The profile, names and settings stay the same.
- An employee forgot their PIN: the main profile opens the Profile page (with the recovery code if a wait is running), types a new PIN next to the person's name and clicks "Set PIN". They keep the same ID, so the activity log is not marked.
- Assign PINs to names: a roster of people, each with a unique PIN; mark people as Boss. Boss PINs only count while this is on.
- Require a PIN for sign-offs: checking or unchecking a step asks for a PIN and the Init. box fills with the name (typing initials is switched off). Signing off a main item, unchecking a signed item and Uncheck everything accept only the main profile or a Boss. The activity log records the names.
- Require a PIN to turn editing on: editing controls stay locked until a main-profile or Boss PIN is entered (Unlock button in the top bar). Turning the master file lock off needs that PIN too (Settings > This checklist is always open). Leaving to the main menu or opening another checklist locks editing again.
- Require a PIN to view the activity log: Menu > Activity log, Settings > Open the full activity log and the LOG button in the main menu ask for the main profile or a Boss PIN (not again while editing is unlocked with one). While an error is active no PIN can be checked, so the log stays viewable.
- Boss vs main profile: a Boss can do everything the main profile can in the checklists (unlock editing, sign off items, remove sign-offs, Uncheck everything, turn off the master file lock, adopt from the list, view the log). Only the main profile can open the Profile page (names, PINs, switches) and use the recovery code. Boss PINs only count while "Assign PINs to names" is on.
- Not covered by the PIN switches: deleting a checklist from the main menu, and renaming the checklist file outside the app.

## Tamper detection and recovery
- The profile has a random ID. It is stored in `Data/profile.json` and in a marker in `Saves/`, both signed with a key built into the app, and it is stamped into every checklist when saved.
- Recovery code: shown once when the profile is created (and once after upgrading from an older version), printable. Keep it off this computer. It is the only way back after a forgotten main PIN or damaged profile files, and the only way out of E-4417, E-4418 and E-4419. Entering it on the Profile page restores the same profile ID with a new username and PIN.
- Error codes: the profile is missing, edited or replaced (E-4417); the profile and marker disagree or the marker is gone (E-4418); 100 wrong PINs in a row (E-4419); a checklist was saved under a different profile, or opened on a computer with no profile yet (E-4420). E-4417, E-4418 and E-4419 lock the whole app; E-4420 affects that one checklist. The app opens normally and shows a pop-up with only the code. After closing it, viewing works, but checking boxes, sign-offs, Uncheck everything and unlocking edits show the error and do nothing.
- The Profile page lists the codes at the bottom (visible without a PIN), explains them, and offers recovery. A new profile cannot be created while an error is active.
- E-4420 (adopting): checklists saved under a different profile are highlighted in red in the Saved checklists list, with "adopt?" under the name. Clicking it explains the situation and asks for the main profile or a Boss PIN; the checklist is then re-stamped and the log records who adopted it. The open checklist can also be adopted from the Profile page ("Adopt this checklist").
- In the built app the developer tools (Ctrl+Shift+I) are switched off, so the PIN limits cannot be skipped from inside the app.
- Getting the checklists out without the recovery code (for example after a bad edit to the profile files): checklists still open for viewing, and Menu > Export… > Fresh copy still works. Tick "Include the activity log" to keep the old log, read-only, under an "Exported as a fresh copy" marker, then re-enter the checks from it in a new install.
- To move to a new computer, copy `Data/` and `Saves/` (including the hidden-style `.profile-marker.json`) together. Copying only the checklists triggers E-4417 until the recovery code is entered.
- This deters casual tampering. Someone who can edit the app's code, or who deletes the profile, marker and every stamped checklist, is not stopped. Windows folder permissions are the only real lock.

## Mechanical wording (Settings > This checklist)
Off by default, saved in each checklist (the demo has it on). The app is for any kind of checklist, so normally the wording is general; switch this on for mechanical work.

| | Off (general) | On (mechanical) |
|---|---|---|
| Printed contents page fields | Name, Started, Completed | Project, Serial no., Technician, Inspector, Started, Completed |
| Sign-off wording on the printout | "(sign-off)", "the person approving the work" | "(inspector sign-off)", "the inspector" |
| The values field / printed column | Values / limits, "Values" | Torque / stretch / limits, "Spec" |

The page reference is called "Ref. page" either way.

## Export (Menu > Export…)
One window: the kinds of export on the left, their settings on the right, and Export… at the bottom, which opens the usual Save window so you choose where the file goes.
- Fresh copy (.bcl): every section, step, image, PDF and installed clip, with nothing checked off and no profile link, for sharing or a new install. Optionally with the activity log.
- Printable checklist (PDF): a blank checklist to print and fill in by hand. The right side shows the real PDF; scroll through the pages ("Page 3 of 9").
  - Each section starts on a new page. Every page shows the checklist name, the section, "Page x of N" and the page within that section ("Engine: page 2 of 3").
  - Main items are grey rows with their steps numbered under them (1.1, 1.2…). Columns: Done tick box, No., Step, Qty / size, Values (Spec with mechanical wording), Ref. page, Init., Date. A main item and its steps stay on one page; only an item longer than a page continues on the next, marked "(continued)".
  - Options (remembered): paper size Letter or A4; Contents page (fill-in fields and where each section starts); Qty / size column; Values / Spec column; Item sign-off lines (in sections that use sign-off); Section sign-off box and notes lines; and which sections to print.
  - No images, videos, PDFs, descriptions or progress: it is always a blank copy.

## Video Player
Top bar > Video Player (next to PDF Viewer). The player shows the videos of the open checklist.
- + Add video… asks how to add it:
  - Import the entire video: copied into the checklist file, so it works on any computer. Only for videos up to 300 MB (a checklist is one file that is read whole when opened).
  - Call to the existing file: the checklist only remembers where the video is. Nothing is added to the file, but if the video is moved, renamed or changed it will not play properly. A video kept inside the save folder (for example on the same USB drive) keeps working when that folder moves.
- Play, ±5 s, speed, and a time bar you can click or drag to skip around.
- Select Timestamps: two green bars appear at the ends of the time bar, with the part between them green. Drag them, or type a time in the Start / End boxes (h:mm:ss.s, m:ss or seconds); the boxes always show where the bars are. Clicking the time bar still skips around and never moves the bars. ▶ Play selection plays just that part.
- Assign to… first asks how:
  - Install selection: copies just that part into the checklist (the file gets bigger). After you pick the step, a window shows the clip and makes Native, Medium (720p) and Low (480p) versions, with the exact size of each, and an Include sound box. Pick one and Install. Making the versions takes a few seconds per minute of clip.
  - Call to timestamps: the step plays that part straight from the video. Nothing is copied, but if a linked video file is moved or changed it won't function properly.
- Then pick the step: the whole checklist in one list, with a search box and a tab per section to jump there. Hovering highlights a row in the Selection color (Settings); clicking keeps it highlighted and shows a green "Assign here" button right beside it. Clicking anywhere outside the list clears it. Keys: ↑/↓ move, Enter assigns, Esc closes. The list starts on the step you assigned last (or the one selected in the checklist), and steps that already have videos say so. The player stays open, ready for the next clip.
- On an item's Images tab a video shows only a thumbnail until it is clicked. A clip plays just its part, on a loop. A loaded video stays loaded while you are on that item and for one minute after you click away, then it is unloaded.
- A checklist can hold any number of videos, imported and linked mixed; click one in the player's list to switch to it. Clips from any of them can go on any step.
- Choosing a video with "+ Add image / video files" on a step's Images tab opens the Video Player with the same import / link choice, and the step picker then starts on that step.
- Export… > Fresh copy keeps copied videos and installed clips. Linked videos are not copied, and the export window says so.

## Drawing and text on images
For torque patterns, bolt numbering and the like.
- Every image on the Images tab has a pencil in its top-left corner (hidden while editing is locked). Click it to draw.
- Top left: Apply (green) and Cancel (red). Then pen Size (with a preview dot), Color (presets, or the rainbow slider for any colour), Undo / Redo (Ctrl+Z / Ctrl+Y), and the trash can, which deletes all drawing on that image (Undo brings it back). Esc cancels.
- Applied drawings are saved in the checklist as pen strokes, a few KB, not as a second copy of the image. They are included in a Fresh copy export.
- Open the pencil again any time to add to the drawing, or trash + Apply to remove it.
- Text: the T button next to the pencil turns on text mode for that image, right on the Images tab. Drawings and text are separate: the pencil only changes drawings, the T only changes text.
  - A bar above the image: font (Inter, Roboto, Open Sans, Lato, Source Sans 3, Barlow: built into the app, so text looks the same on every computer), size, Bold, colour, and Done. They apply to the selected text and become the default for new text.
  - Three buttons on the left side of the image: Select text (click a text, then select and type in it as usual), Move text (cross-arrows cursor: drag any text), New text (text cursor: click anywhere on the image to start typing there).
  - Delete text (top right of the image) removes the selected text box.
  - Only the image changes while text mode is on: off the image the app works as normal. Text is saved as you type; Done, the T button, or clicking another step ends text mode, and empty text boxes are removed then.
  - Text is stored as words and positions (bytes, not a picture) and is included in a Fresh copy export.
- Images with a drawing or text get an eye button ("Toggle visibility") to hide or show them; the closed eye means hidden. Hiding lasts until the checklist is closed and does not change the file.

## Activity log
- Every checklist keeps its own log: Menu > Activity log…, Settings > Open the full activity log, or the LOG button on a selected file in the main menu (no need to open it). Filter by name, event or item; Download CSV.
- Entries made with a PIN record the user's ID. If the same name appears with a different ID (for example someone was removed and re-added, or the profile was reset), the log starts a red "POSSIBLE TAMPERED" segment, and everything after it stays visually separated. Errors and recoveries also start marked segments. Use "Set PIN" on the Profile page to change a PIN without changing the ID.
- The log keeps the newest 5,000 entries (old step entries go first; sign-offs and markers are kept).

## Size limits and speed
- A checklist is saved as one file. It can hold roughly 350 MB of photos, PDFs and clips (for example about 450 shrunk photos plus a few manuals); beyond that the app can no longer save it. Photos are shrunk when added (Settings > Shrink big photos, on by default: phone photos go to 2560 px, about 0.4–0.7 MB each), and linking big videos instead of copying them keeps files small.
- Measured on a deliberately huge checklist (3,900 rows, 300 photos, 60 clips, three PDFs incl. 400 pages, 341 MB file): menu 1.4 s, opening 6 s, the printable PDF (301 pages) 4–5 s. Every save rewrites the whole file, which takes several seconds at that size (in the background; the app stays usable).

## Notes
- Autosave: about 3 seconds after you stop editing, at least every minute, when you leave a checklist, and when the window closes. If the final save fails, closing asks whether to keep the app open.
- Deleting sends the file to the Recycle Bin / Trash.
- Unsigned build: Windows SmartScreen may warn on first run ("More info" > "Run anyway").
- pdf.js (Apache 2.0) is bundled in lib/ (license: lib/PDFJS-LICENSE.txt).
- The six text fonts (Inter, Roboto, Open Sans, Lato, Source Sans 3, Barlow; SIL Open Font License 1.1) are bundled in lib/fonts, cut down to Latin letters, digits and shop symbols (about 570 KB together). Licenses: lib/fonts/LICENSES.txt.
- ffmpeg (GPL v3, via the ffmpeg-static package) is bundled to cut and convert video clips. It runs only while installing a clip or making a thumbnail. Its license and build notes are in resources/app.asar.unpacked/node_modules/ffmpeg-static/; source code is at https://ffmpeg.org.
