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
- `Saves/Backups/`  one older copy of each file, refreshed at most every 5 minutes (30 minutes for checklists over 100 MB, which take a while to copy). Menu > Restore from backup… opens it as a new checklist ("name (restored)"); the current file is never overwritten. Backups stay in this folder after a checklist is deleted.
- `Data/`  app settings, the signed `profile.json` (username, PIN hashes, roster, recovery verifier) and `config.json` (custom save folder)
- `Saves/.profile-marker.json`  small signed record of the profile ID, kept with the checklists

Settings > Save file location lets you move the Saves folder, e.g. to an external drive.
If the app sits somewhere it cannot write (Program Files, a Mac /Applications), it falls back to Documents/Build Checklist.

## Loading screen
While the app starts, a small loading window shows a spinning wrench, a loading bar and what it is doing ("Reading saved checklists…"). The main window appears when the menu is ready. Before that, the portable `.exe` unpacks itself every time it starts, which can take a while on a slow computer with nothing on screen; the installer version (`BuildChecklist-Setup.exe`) skips that step and starts faster.

To use your own animation instead of the wrench, put a file named `loading.gif`, `loading.webm`, `loading.mp4`, `loading.png`, `loading.webp`, `loading.apng` or `loading.svg` (under 30 MB; a few MB opens fastest) in the `Data` folder. It loops, without sound, at up to 220 × 220 pixels. Delete it to get the wrench back.

## Master file (Settings > This checklist)
"Master file: lock editing" keeps the checklist's content from being changed (checking, initials and sign-offs still work) and stops it from being deleted: Delete checklist in the menu and DELETE in the Saved checklists list are greyed out. To delete it, turn the lock off first (needs the main profile or a Boss PIN when PINs are required for editing).

## Worker mode (Settings > This checklist)
For a checklist handed to a worker: it locks editing like a master file (and cannot be deleted). In the menu (☰) only Save and Export… work; everything else is greyed out until "Unlock menu (Boss PIN)…" at the top gets the main profile or a Boss PIN (for that one opening of the menu). Settings (⚙) asks for that PIN before it opens. So whoever has it open stays in that checklist: they can check off steps, add initials, add work photos and look at images, PDFs and videos, but cannot switch to another checklist, start a new one (Ctrl+N), Save as, copy or delete it without a Boss. Export only makes a fresh copy (nothing checked off) or a blank printable checklist, so no finished work leaves with it. Closing the app still works; when the app opens again it starts on the main menu as usual, and opening this checklist locks it again. Turning worker mode on or off is recorded in the activity log.
Needs a profile with a main PIN. It does not apply when the app itself is locked (E-4417/E-4418/E-4419), so a Fresh copy export always stays possible.

## Making a checklist with an AI (ChatGPT, Claude, a local model…)
- **Import > From text / AI** on the main menu (or Menu > Import from text / AI… inside a checklist) takes a checklist written as a simple outline and builds it: `# Section` (add `[sign-off]` for a sign-off section), `## Main item`, `- Step`, with `| qty: 2 | size: M8 | spec: 25 Nm | p. 14` after a line and `> notes` lines under it. It shows what it found before you import, and makes a new checklist or adds the sections to the open one (undo with Ctrl+Z).
- **Copy instructions for an AI** (in that window) copies a ready-made prompt: paste it into any chatbot together with your manual (or the pages you want), then paste the chatbot's answer back into the window.
- AI assistants that can work with files (like Claude) can also write a complete checklist file in the JSON format from the guide; open it with **Import**.
- The full instructions for AI assistants are in `docs/AI-CHECKLIST-GUIDE.md` (also linked from `AGENTS.md`), for any AI you point at this project.
- Everything comes in unticked and not "Verified": check each value against its page before relying on it. Pictures are added afterwards. Ref. pages are PDF page numbers and link to the PDF once you add it (Menu > Open PDF…).

## Starting a new job
Menu (☰) > Start a new job from this checklist…: asks for a name (suggests "<name> - new job"), then makes a fresh copy inside the app with every section, step, image, PDF and video and nothing checked off, and opens it. Its activity log starts with "New job started, from the checklist …". The original keeps its progress. A master file lock carries over to the job.

Exporting a fresh copy is noted in the original's activity log. When the copy includes the log, its last entry says it is a copy, of which checklist and when, and that the entries above record work done in the original.

## Opening files
- **Import** on the main menu offers **From file** (a `.bcl` checklist, or a `.json` checklist from an older version or written by an AI) and **From text / AI** (see below). Dragging a `.bcl` onto the app or "Open with" also works: the file is copied into Saves and opened.
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
Off by default, saved in each checklist (the demo has it on). The app is for any kind of checklist, so normally the wording is general; switch this on for mechanical work. It can be changed any time except in a master file or in worker mode.

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

## Picture descriptions (Images tab)
Every picture or video on an item can have a description. **Fit** view: a box under the picture (above "+ Add image / video files"). **Stack** view: a box attached under each picture. **Grid** view: the first 10 words on a dark strip at the bottom of the picture (hover for all of it). Descriptions are part of the checklist's content: saved in it, kept in fresh copies and new jobs, and read-only in a master file, in worker mode or while editing needs a PIN.

## Work Photos
Photos that prove the work was done (for example for a customer), kept apart from the instruction images on the Images tab.
- Every main item and step has a **Work Photos** tab (after Images, Description and PDF): + Add work photos picks photos from the computer (photos only, no videos, to keep checklists small). Each one records who added it (the name tied to the PIN when PINs are in use, otherwise a name typed once and remembered) and when, and the activity log notes it. A main item's tab also shows its steps' photos.
- Adding work photos counts as progress, like ticking a box: it works in a master file and in worker mode, but not while the checklist or the app shows an error.
- Photos can still be added after a step is checked or a main item is signed off (someone may remember the photo later); the log notes "added after sign-off". Once a main item is signed off, its photos and its steps' photos can no longer be removed. Removing a photo before that asks for confirmation (a main or Boss PIN in worker mode or when signing needs a PIN) and is logged.
- The **Work Photos** button at the top right opens a page with every work photo in the checklist, in a grid grouped by section, each captioned with its main item. Click one to see it full screen with when it was logged, its section, main item and step, and who added it; **Jump to** (bottom right) goes back to the checklist with that step selected. ← / → go through them, Esc closes.
- Photos are shrunk like other photos (Settings) and stored in the checklist file with a small preview for the grids, so they count toward its storage limit. A Fresh copy or a new job starts without them.

## PDF Viewer
- **Top bar (always there):** the search box, page number and ◀ ▶, zoom − +, and naming the page shown. The → and ← arrow keys go to the next and previous page (except while typing in a box).
- **Search box:** finds the PDF's own page numbers (type "2", "p.2" or "page ii" to find the page printed with that number, in PDFs that come with their own numbering), page names, chapters, bookmarks and words on the pages, in every PDF of the checklist. The search covers every PDF of the checklist and stays when you switch PDFs; the marks and the page list always follow the PDF that is open. The results are listed on the left ("Search results (all PDFs)"), one row per page (with "(3 on this page)" when a word appears more than once). Like Ctrl+F in a web browser, every place the word appears on the page shown is marked in yellow, and "7 of 23" beside the search box steps through **each word** one by one, also within one page: ◀ ▶, Enter / Shift+Enter in the search box, or type a number and press Enter. The current word is marked in orange and scrolled into view; its row is marked in the list. While searching, the page list on the right fades the pages without a match and opens only the chapters that have one; tick **Only matches** to hide the rest (remembered). "Indexed" means the words on every page have been read and can be searched (hover for details); scanned pages without text (no OCR) are only found by page numbers, names, chapters and bookmarks. The page box (◀ [ ] Go ▶) counts the pages of the file (1 = the first page).
- **Page list (right):** every page reads "p.N", followed by the PDF's own page label (like "(iv)") and any names given here, for example "p.60 crankshaft torque specs". Click a row to go there; the page shown is highlighted. Long names end in "…"; hover to read all of it. If the PDF numbers its own pages differently (front pages i, ii…), its number shows in brackets: "p.4 (2)" is the file's 4th page, printed as page 2. Options > Page numbers chooses how rows and chapters are numbered (remembered): **Both** ("p.4 (2)", the default), **Book** (the PDF's own numbers only, "p.2", front pages "p.ii"; pages without one keep the file number) or **File** ("p.4", counted from the first page of the file). The page box at the top always uses the file's page number. Drag the bar on its left edge to make the list wider or narrower (remembered).
- **Chapters:** Options (right end of the page-number bar) > "Add chapter at this page…" asks for a title; the chapter starts at the page shown and runs until the next chapter, and is listed as "Chapter 1: Assembling Engine Casing" (numbered by page order, words capitalised). Chapters are header rows with an arrow (▾ / ▸) that folds their pages away; Options also folds or unfolds all. Right-click a chapter to rename it, move it to the page shown, or delete it. Without chapters of your own, a PDF's built-in bookmarks (as Adobe Acrobat shows them) are used: top-level bookmarks become the chapters, and bookmarks under them show as names on their pages ("p.4 (2) Crankshaft torque specs"). With chapters of your own, all of the PDF's bookmarks show as page names instead. The PDF search box also finds chapters and bookmarks.
- **Highlights:** Options > "Highlight this page": yellow, red, blue, green or pinkish purple (✕ removes it). Only the row in the page list is coloured; the page itself is not changed.
- **PDFs list (left):** ◀ next to its title folds it to a slim strip; ▶ opens it again (remembered).
- Chapters, highlights and page names are saved in the checklist, per PDF. Like other edits they are locked in a master file, in worker mode, or while editing needs a PIN.

## Video Player
Top bar > Video Player (next to PDF Viewer). The player shows the videos of the open checklist.
Plays MP4 and WebM videos, and most MOV files from phones and cameras (listed under "+ Add video…"). Other kinds (AVI, WMV, MPG, many MKV files, VHS or camcorder captures, iPhone "High Efficiency" videos) usually need converting to MP4 first, for example with the free program HandBrake.
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
- Each checklist is still one `.bcl` file, to copy or share as it is. Inside, photos, PDFs and videos are stored once as they are; a save only adds what changed (the checklist itself, a few KB to a few MB), so ticking a box stays quick however many photos a checklist has. Photos, PDFs and videos are read from the file only when they are shown.
- Old copies of the checklist part pile up inside the file as unused space; the app clears it now and then, and when you switch to another checklist. A save cut short (power cut) falls back to the last complete save.
- Settings > This checklist > Storage shows how full the checklist is ("120 MB of 2 GB used"). Each checklist has a hard limit of 2 GB, photos, PDFs and videos included; adding more is refused with a message. Performance may drop as it fills up: big checklists take longer to back up, export and copy.
- Photos are shrunk when added (Settings > Shrink big photos, on by default: phone photos go to 2560 px, about 0.4–0.7 MB each), and linking big videos instead of copying them keeps checklists small.
- Checklists from before this file format are converted the first time they are opened; the original is kept in `Saves/Backups/`. Copies of the app from before this change cannot open the new files, so update every computer together.
- Very long checklists stay quick on slow laptops: the list draws the sections near what you are looking at and fills in the rest as you scroll; ticking a box redraws only that item; search and the section tabs jump straight to items further down. The backup copy is made alongside saving instead of holding it up, and photos not looked at for a while are let go from memory (they load again when shown).
- Measured on a simulated weak laptop (2 cores, 4× slower) with a 555 MB checklist of 3,900 steps and 700 photos: opening 1.7 s, ticking a box under 0.4 s including the save, search 0.2 s.

## Around the screen
- Under the checklist name: **Items** = main items checked off / all main items, **Sections** = sections complete (all their main items done, shown green) / all sections. The small pie right of the name fills by main items done (hover for the numbers).
- When there are more section tabs than fit, the mouse wheel over them scrolls them sideways (down = right, up = left); the same in the step picker.
- Right panel tabs: Images, Description, PDF, Work Photos (the selected one is highlighted).
- **Keyboard** (Menu > Shortcuts… lists every key):
  - **Tab** switches between the checklist side and the right-hand side (an orange line marks the active one). Typing in a box, Tab goes to the next box and Shift+Tab to the previous one (buttons are skipped); **Esc** leaves the box.
  - Checklist side: **↓ / ↑** next / previous row (main items and the steps of open items), **Shift+↓ / ↑** next / previous section, **Ctrl+↓ / ↑** next / previous main item.
  - Right side: **↓ / ↑** next / previous tab (Images, Description, PDF, Work Photos), stopping at the first and last.
  - Both sides: **→ / ←** next / previous picture (Images tab, Fit view) or page (PDF tab). Leaving the PDF tab or the row and coming back shows the row's own page again.
  - **Delete / Backspace** deletes the selected row (or a section you just added). It asks first, Enter confirms; a row or section that is still empty (just added, nothing typed or attached) goes without asking.
  - **Building quickly** (default keys, all changeable): **R** rename the selected row, **Ctrl+B** new section after the current one (type its name, Enter), **Ctrl+N** new main item after the current one, **Ctrl+M** new step after the selected one. A new row or section starts in rename mode: type the name and press Enter.
  - **Ctrl+Z** undo, **Ctrl+Shift+Z** redo, for building the checklist: adding, deleting, moving and renaming sections, main items and steps, their fields, pictures added or removed and picture descriptions. Check-offs, initials, sign-offs and work photos are never undone (they are recorded evidence); doing one of them starts a fresh undo history. While typing in a box, Ctrl+Z undoes the typing in that box.
  - **Your shortcuts:** Menu > Shortcuts… lists actions (check / uncheck the selected row, open / close a main item, add pictures or work photos, go to a tab, open the viewers, Export, Activity log, go to section 1–10, delete the current section, …). Click a box and press the keys you want, any key or combination of up to three keys (like Shift+N or Ctrl+Alt+K), number keys included; Esc cancels, Delete clears. Keys set to start with: Save Ctrl+S, Save as Ctrl+Shift+S, Undo Ctrl+Z, Redo Ctrl+Shift+Z, Rename R, New section Ctrl+B, New main item Ctrl+N, New step Ctrl+M (New checklist has none; give it one if you like). Shortcuts are saved on this computer. Keys without Ctrl or Alt do nothing while you type in a box, and no shortcut works inside a pop-up.
- On small screens a long checklist name is shortened with … (hover to see all of it), and an item's tags (quantity, page, pictures) move under its name when they don't fit beside it.
- **Saving a picture elsewhere:** right-click any picture (Images tab, Work Photos tab and page, full-screen work photo) for **Download…** (a Save window: pick the folder and name; the next one opens in the same folder) and **Copy picture**. A picture with drawings or text offers "Download with drawings…" and "Download original…". The full-screen work photo also has a **Download…** button next to Jump to; work photo tiles always save the full photo, not the small preview.
- Greyed-out menu items (Delete in a master file or worker mode, most items in worker mode) say why when you hover over them.
- Main menu: **View Demo** next to Import adds the demo checklist again as a new checklist (a fresh install also starts with it). **Tutorial** next to Profile is a placeholder for now. Esc on the Profile page goes back to the menu.
- With "Require a PIN for sign-offs" on, the sign-off box on main items reads "Boss Sign-Off".

## Notes
- Autosave: about 3 seconds after you stop editing, at least every minute, when you leave a checklist, and when the window closes. A small green "Saved!" appears left of the checklist name after each save and fades away (just under the name when the window is narrow). If the final save fails, closing asks whether to keep the app open.
- Deleting sends the file to the Recycle Bin / Trash.
- Unsigned build: Windows SmartScreen may warn on first run ("More info" > "Run anyway").
- pdf.js (Apache 2.0) is bundled in lib/ (license: lib/PDFJS-LICENSE.txt).
- The six text fonts (Inter, Roboto, Open Sans, Lato, Source Sans 3, Barlow; SIL Open Font License 1.1) are bundled in lib/fonts, cut down to Latin letters, digits and shop symbols (about 570 KB together). Licenses: lib/fonts/LICENSES.txt.
- ffmpeg (GPL v3, via the ffmpeg-static package) is bundled to cut and convert video clips. It runs only while installing a clip or making a thumbnail. Its license and build notes are in resources/app.asar.unpacked/node_modules/ffmpeg-static/; source code is at https://ffmpeg.org.
