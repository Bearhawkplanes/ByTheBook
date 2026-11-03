# Making checklists with an AI assistant

This guide is for any AI assistant (Claude, ChatGPT, a local model in Ollama or LM Studio, …) asked to help build a checklist for the **Build Checklist** app from a manual, usually a PDF. A person gives the assistant this guide and the manual. The assistant writes the checklist; the person imports it into the app and checks it.

You do not need to know how the app's code works. Everything you need is on this page.

## 1. What the app is

Build Checklist is an offline desktop app for shop work done step by step from a manual: engines, machines, assemblies, any detailed mechanical job. A checklist is a tree:

- **Sections**: the big stages of the job, e.g. "Prep", "Disassembly", "Inspection", "Assembly", "Final checks".
- **Main items** (inside a section): one task or procedure each, e.g. "Remove the cylinder head".
- **Steps** (inside a main item): the individual actions, in order, one action each, e.g. "Loosen the head bolts in reverse order".

People tick steps off as they work and add their initials. A main item is ticked when all its steps are done. In a section marked **sign-off**, each main item must also be signed off by a supervisor.

Every main item and step can carry:

| Field | Meaning | Example |
|---|---|---|
| text | The item or step itself (short, an action) | `Torque the head bolts` |
| qty | How many | `10` |
| size | Part size, thread, length, grade | `M10 x 1.25` |
| spec | Values and limits, with units (torque, clearance, pressure, temperature…) | `40 Nm + 90°` |
| page | **Ref. page**: the page of the PDF where it is described (see section 4) | `57` |
| desc | Notes: explanation, warnings, tools, tips | `Use new bolts. Oil the threads.` |

Pictures, videos and the PDF itself are added in the app afterwards, by the person. An assistant cannot add pictures.

## 2. How to work through a manual

1. Look at the manual's contents (or bookmarks) first and propose the sections. For a long manual, work **one chapter at a time**: read 20–40 pages, write that part of the checklist, then continue.
2. One **main item** per task or procedure in the manual. Its **steps** are the actions of that procedure, in order.
3. Copy values exactly as the manual gives them, with units. **Never guess a value.** If something is unclear or unreadable, write `(check)` after it.
4. Put the page number on every main item and every step that has its own instructions (section 4).
5. Keep step text short and active ("Fit the gasket", not "The gasket should then be fitted"). Put the why, warnings and tool lists in the notes.
6. Start with a **Prep** section when the job needs parts or tools: main items "Required tools" and "Required parts", each tool or part as a step with its qty and size.
7. Mark a section as **sign-off** only when supervisor sign-off makes sense (for example final inspection, or safety-critical work). If unsure, leave it off; the person can switch it on in the app.

Everything imported arrives unticked and **not Verified**. The app has a "Verified" mark per item, which the person sets after checking each value against the manual. Say so when you hand over the checklist.

## 3. Two ways to deliver the checklist

### A. Outline text (any chatbot, also local models)

Reply with **only** the outline, nothing before or after it. The person pastes it into the app (main menu: **Import > From text**, or in a checklist: **Menu > Import from text…**). The app's **Copy instructions for an AI** button gives the person a prompt with these rules to paste into any chat.

How a chat usually goes:

- The person may send the instructions alone first. Then reply only "Ready. Send the manual or the pages, paste text, or describe the job." and wait.
- The source can be a PDF (all or some pages), text copied from a manual, or the job described in the person's own words. Without a PDF, leave out page numbers.
- For a long manual, work one part at a time. If no pages were named, list the chapters you see and ask where to start. On "continue" or new page numbers, write only the new part; do not repeat sections already written (the person adds each part to the same checklist).
- When asked for a change, reply with the corrected part only. Answer questions normally; every other reply is only the outline.

```
# Prep
## Required parts | p. 3
- Head gasket | qty: 1 | p. 3
- Head bolts, new | qty: 10 | size: M10 x 1.25 | p. 3
# Assembly [sign-off]
## Fit the cylinder head | p. 57
- Clean both mating faces | p. 57
  > No scraping tools on the aluminium face.
- Fit the new gasket, marking up | p. 57
- Torque the head bolts in sequence | spec: 40 Nm + 90° | p. 58
  > Sequence diagram on page 58. Oil the threads first.
```

Rules:

- `# Title` starts a section. Add ` [sign-off]` after the title for a sign-off section.
- `## Text` is a main item. `- Text` (or `1. Text`) is a step of the main item above it.
- Fields go after `|` on the same line: `qty: …`, `size: …`, `spec: …`, `p. …` (page). Leave out fields that do not apply.
- Lines starting with `>` (under an item or step) are its notes. Several `>` lines are joined.
- Steps written before any main item go into a main item called "General"; main items before any section go into a section called "Checklist".
- Do not use `|` inside names. A note that itself starts with `-`, `#` or a number keeps its `> ` in front.

### B. A checklist file (assistants that can write files, such as Claude with tools)

Write a JSON file (for example `Engine overhaul.json`). The person opens it in the app with **Import** on the main menu; the file name becomes the checklist's name. The same JSON can also be pasted into the "Import from text" box.

```json
{
  "name": "Engine overhaul",
  "manual": "Workshop manual, revision C",
  "mech": true,
  "sections": [
    {
      "title": "Assembly",
      "sign": true,
      "cards": [
        {
          "text": "Fit the cylinder head",
          "page": "57",
          "desc": "",
          "steps": [
            { "text": "Clean both mating faces", "page": "57", "desc": "No scraping tools on the aluminium face." },
            { "text": "Torque the head bolts in sequence", "spec": "40 Nm + 90°", "page": "58" }
          ]
        }
      ]
    }
  ]
}
```

- `sections[].title` (text), `sections[].sign` (true / false: main items need a supervisor sign-off).
- `cards` are the main items, `steps` their steps. Both use the fields from section 1: `text`, `qty`, `size`, `spec`, `page`, `desc`. All values are text (strings), also numbers.
- `manual` (optional): the manual's name and revision, shown in the app and on printouts.
- `mech` (optional): `true` uses mechanical wording in the app (technician, inspector, torque, spec); `false` (default) uses general wording.
- Do not add progress fields (done, initials, sign-offs): those are filled in by people in the app.
- A file this way can only hold text; the PDF and pictures are added in the app.

## 4. Page numbers (Ref. page)

Use the **page number in the PDF file**, counting the file's first page as 1, even when the printed page numbers in the manual are different (front pages numbered i, ii…, or chapters numbered 3-1, 3-2…). That is the number a PDF reader shows as "page 57 of 300".

In the app, once the person adds the PDF to the checklist (Menu > Open PDF…), a Ref. page of `57` opens the 57th page of that PDF with one click. If a checklist uses several PDFs, the person picks which PDF each item refers to in the app; by default it is the first one.

## 5. For assistants with file and tool access (Claude Code and similar)

- You can read just the pages you need instead of the whole file: get the page count and bookmarks first (for example `pdfinfo`, or a PDF library), then extract text for a page range (`pdftotext -f 45 -l 80 -layout manual.pdf -`). Look at a page as an image only when its text cannot be extracted (scans) or a table or diagram matters.
- Write the checklist as a JSON file (section 3B) and tell the person its name and where it is; add one chapter at a time to the same file for long manuals.
- If you are working inside the app's own code repository, do not change the app for this; just write the file.

## 6. Handing over

End by telling the person, in a sentence or two: what pages you covered, anything you marked `(check)`, and that every value should be checked against its page in the app before the checklist is used (the "Verified" mark).
