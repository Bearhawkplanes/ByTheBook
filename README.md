# ByTheBook

Offline desktop app for shop work done step by step, by the manual. Build a checklist once, with the manual's pages, pictures and videos attached to the exact steps they belong to, then work through it job after job, with every check-off, sign-off and photo on record.

Runs on Windows with no internet and no account. Everything stays on your computer or drive.

## Made for long, complicated jobs

Building an engine, overhauling a gearbox, assembling a machine: jobs with hundreds of steps, a thick manual, several people and weeks of work. ByTheBook is built for that:

- **Nothing gets skipped.** The job is split into sections, main items and steps, in order. Progress shows per item, per section and for the whole job, and a main item can't be signed off until every step under it is done.
- **The manual comes to you.** Every step points to its page, picture or video clip, so nobody has to dig through a 600-page PDF to find the torque value or the right diagram.
- **Pick up where anyone left off.** Days or weeks later, or with a different person on the job, the checklist shows exactly what is done, who did it, and what is next.
- **Big jobs stay fast.** Checklists with thousands of steps and gigabytes of photos, PDFs and video open and save quickly, even on an older shop laptop.
- **A record you can stand behind.** When the job is done, the checklist holds who did each step and when, the sign-offs, the photos and the full log.

## Main features

- **Everything on the step it belongs to.** Each step can carry its manual page, pictures (with drawings and text marked on them), video clips, quantities, sizes and values. Click a step and its page opens in the PDF, or its clip plays, right beside the list.
- **Signed-off work, logged for good.** Everyone gets their own PIN. Checking off a step fills in who did it and when; main items get a supervisor (Boss) sign-off. Every check, sign-off, change and photo goes into the checklist's activity log.
- **Tamper detection.** The profile and every checklist are sealed. Copied, edited or swapped files are flagged with an error code (E-4417 to E-4421) and locked to view-only, with a recovery code to set things right. Master files and worker mode stop a checklist from being changed or deleted, and too many wrong PINs lock the app.
- **PDF Viewer.** Search every PDF in the checklist (words, page numbers, bookmarks), add your own chapters, page names and coloured highlights, and jump straight to the page a step points to.
- **Video Player.** Add whole videos or link to files on the drive, mark a start and end, and attach just that part to a step, either copied into the checklist in the size you choose or played straight from the video.
- **Work Photos.** Proof photos on each step, with who added them and when, and a gallery of the whole job.
- **Quick to build.** Paste a checklist written by any AI chatbot (or typed by hand) and see it take shape as you go; select many steps at once to set their PDF or delete them.
- **Ready for the next job.** Start a fresh copy for the next job, export a blank printable PDF checklist, and keep automatic backups.
- **Safe updates.** Updates install themselves from Settings, make a safety copy of every checklist first, and put the previous version back if anything goes wrong.

## Download

Get the latest version from [Releases](../../releases/latest):

- **ByTheBook-Folder.zip** (recommended): unzip it and open `ByTheBook.exe` inside the `ByTheBook` folder. Your checklists (`Saves`) and settings (`Data`) live in that same folder, so it can sit on an external drive and move between computers.
- **ByTheBook.exe**: a single portable file. Takes a few seconds to start because it unpacks itself each time.
- **ByTheBook-Setup.exe**: installer. Lets you double-click `.bcl` checklist files to open them.

Windows may warn the first time because the app is not code-signed: click "More info" > "Run anyway".

## Learn more

- [The full manual](docs/MANUAL.md): every feature, setting and keyboard shortcut.
- [Making checklists with an AI](docs/AI-CHECKLIST-GUIDE.md): for ChatGPT, Claude or a local model.

## Building from source

Install Node.js LTS, then `npm install` and `npm start` to run it, or `npm run dist` to build the Windows app. More in the [manual](docs/MANUAL.md#build-the-app-on-the-computer-type-you-are-building-for).

---
Built with the help of [Claude Code](https://claude.com/claude-code).
