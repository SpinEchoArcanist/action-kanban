# Action Kanban

**Manage Action notes on a lightweight, frontmatter-driven Kanban board for Obsidian — no Dataview required.**

![License](https://img.shields.io/github/license/SpinEchoArcanist/action-kanban)
![Obsidian minimum version](https://img.shields.io/badge/Obsidian-%E2%89%A51.4.0-7C3AED)


Action Kanban turns a folder of notes, called Actions, into a Kanban board. You can open it as its own view or embed it directly inside another note, like a daily note. Each Action note becomes a card. Its status field decides which column it lands in, and priority groups it within that column. Drag and drop a card to change its status or reorder it within its priority group, and a self-healing order field remembers exactly how you arranged things. Everything driving the board lives in the notes' own YAML frontmatter, so there's no separate database, no manifest file, and no need for the Dataview plugin.

![Action Kanban — full board overview](screenshots/board-overview.png)

![Board embedded inside a daily note](screenshots/embedded-in-daily-note.png)

> 🤖 **This plugin is 100% vibe-coded.** Every line of `main.js` and `styles.css` was written by AI (Claude), not by a professional developer, and I have not personally reviewed the source code. See [About this project](#about-this-project) at the bottom of this README for what that does and doesn't mean in practice before you install it.

---

## Table of contents

- [Why Action Kanban exists](#why-action-kanban-exists)
- [A note on frontmatter keys](#a-note-on-frontmatter-keys)
- [Features](#features)
- [Anatomy of a card](#anatomy-of-a-card)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Frontmatter reference](#frontmatter-reference)
- [Using the example template](#using-the-example-template)
- [Usage guide](#usage-guide)
- [Settings reference](#settings-reference)
- [Known limitations](#known-limitations)
- [About this project](#about-this-project)
- [License](#license)

---

## Why Action Kanban exists

There are plenty of other great Kanban plugins for Obsidian by now, and it's worth knowing they exist. One of them might genuinely be the better fit for you; they are often more rich and powerfull than Action Kanban. Of everything out there, Bases Kanban comes closest to what I actually need from a board, even though its underlying approach is quite different from this plugin's. But across all these alternatives, I've always felt that some function I needed where missing: either the ability to embed the board directly inside a daily note, or the markers I actually rely on to stay on top of my actions (priority, due date, and time spent in a status for example; all borrowed straight from Jira). That's why I ended up developpoing Action Kanban.

The name "Action" is a deliberate workaround, not a stylistic choice. My actual inspiration is Jira and the Task ticket. But Obsidian already has a native notion of a task — the `- [ ]` checkbox, and the popular Tasks plugin built around it (which I also use heavily). Calling these cards "Tasks" would have thus created constant naming collisions in my own vault. Since that word was already spoken for in Obsidian, "Action" became the stand-in.

The result is a small, opinionated plugin: your notes' frontmatter is the board. No sync, no separate database, no manifest file tracking card order, just fields on the notes you already have. Priority, due date, and time-in-status are built in as first-class markers from day one, and the board drops straight into a daily note instead of living in its own separate tab.

## A note on frontmatter keys

Action Kanban reads and writes plain YAML frontmatter directly on your notes — there's no separate database, so this is worth understanding before you point it at real notes. **Inside your configured Actions folder, the plugin automatically manages these frontmatter keys:** `Type` (or whatever you rename the type field to), `status`, `priority`, `order`, `status_changed`, and whatever field you set as the due date (default `Due Date`).

**Check whether any of these keys are already used for something unrelated on notes that would fall inside your Actions folder** — if they are, Action Kanban may read or overwrite values you didn't intend it to touch. In particular,  `status_changed` and `order` aren't just read — the plugin will **automatically write them into a note's frontmatter** the first time the board loads a note that's missing them, whether or not you ever open the plugin's own note-creation flow. See the [Frontmatter reference](#frontmatter-reference) below for exactly which fields get auto-written versus left alone.

## Features

- **Frontmatter-driven, no Dataview dependency** — reads/writes plain YAML frontmatter via Obsidian's own API. A note only becomes a card if it's both inside your configured Actions folder *and* has matching frontmatter — the folder is a deliberate scope boundary, not just an organizational nicety: notes outside it are never scanned at all, even if their frontmatter would otherwise match.
- **Three ways to view a board:** a standalone sidebar view, embedded inline in any note via a code block, or embedded inside a callout.
- **Drag-and-drop status changes** between columns, with a picker prompt if a column maps to more than one status.
- **Drag-and-drop reordering** within a priority group — your manual order is remembered even if a card moves away to another column and back.
- **Dedicated priority picker** (click a card's chevron) — kept separate from drag-and-drop so the two gestures never conflict.
- **Fully custom statuses and columns** — define as many statuses as you like, with your own labels and colors, and group them into columns however you want (including several statuses per column).
- **Due-date urgency bar** — fills up and changes color as a due date approaches.
- **Days-in-status aging dots** — a small row of dots shows how long a card has sat in its current status, colored in four aging tiers, with a configurable size.
- **Self-healing card order** — new or manually-edited notes get their `order` and `status_changed` fields auto-populated on load; you never have to set them by hand.
- **Collapsible columns**, in either a compact header-only mode or an optional Trello-style tilted strip to save horizontal space.
- **Priority filter toolbar** (All / High / Medium / Low).
- **Custom board colors**, independently for light and dark themes.
- **Optional "card meta fields"** *(experimental)* — show extra frontmatter values as a small pill line under a card's title.

## Anatomy of a card

![Anatomy of an Action Kanban card](screenshots/card-anatomy.png)

- **Chevron** (top-left) — shows priority (double red = High, single orange = Medium, single blue = Low) and is clickable to change it.
- **Title** — click anywhere else on the card to open the underlying note in a new tab.
- **Meta / pill row** *(optional, experimental)* — extra frontmatter fields you've configured to show, e.g. `Effort: 3`.
- **Dot row** — one dot per day since the card's status last changed, capped at 28, colored in four aging tiers so long-stuck cards stand out at a glance.
- **Due-date bar** — fills and shifts from green → amber → orange → red as the due date approaches or passes.

## Requirements

- Obsidian **1.4.0** or later.
- Desktop: actively used and tested. Mobile: the plugin doesn't declare itself desktop-only (`isDesktopOnly: false`), so it should load, but it hasn't been tested on mobile by the maintainer yet — drag-and-drop in particular is untested on touch. Feedback via an issue is welcome.
- No required plugin dependencies. **Templater** is entirely optional — Action Kanban has zero runtime dependency on it — but it pairs nicely if you want note-creation prompts (see [Using the example template](#using-the-example-template)).
- Folder-path autocomplete in Settings needs Obsidian **1.4.10+**; on older 1.4.x installs the Actions-folder field just falls back to a plain text input with no loss of core functionality — that fallback is based on the guard's feature-detection logic, though, not something actually tested against a real pre-1.4.10 Obsidian install.

## Installation

Action Kanban is not (yet) on Obsidian's official Community Plugins directory, so install it one of these two ways:

### Option 1 — BRAT (recommended, gets automatic updates)

1. Install **BRAT** ("Obsidian42 - BRAT") from Obsidian's Community Plugins browser, if you don't have it already.
2. Open BRAT's settings and choose **Add a beta plugin for testing** (or run the equivalent command from the Command Palette).
3. Enter the repository: `SpinEchoArcanist/action-kanban`
4. Go to Settings → Community Plugins and enable **Action Kanban**.

BRAT will check the repository's `manifest.json` for new versions and offer updates automatically.

### Option 2 — Manual install

1. Go to the [repository](https://github.com/SpinEchoArcanist/action-kanban) and download `main.js`, `manifest.json`, and `styles.css`.
2. In your vault, create the folder `<your-vault>/.obsidian/plugins/action-kanban/`.
3. Place the three downloaded files inside that folder.
4. Reload Obsidian (or toggle Community Plugins off/on), then enable **Action Kanban** in Settings → Community Plugins.

With manual installs you'll need to repeat this process yourself for future updates.

## Quick start

### 1. Set up your Actions folder — the important step

A note only ever becomes a card if **both** of these are true:

- It lives inside the folder configured under **Settings → Action Kanban → Folders → Actions folder**. Default: a top-level folder named `Actions`.
- Its frontmatter has a field, by default named `Type`, containing the value `Action` — configured under **Settings → Action Kanban → Note identification**.

Open the settings tab and check both before creating anything:

- **Actions folder** — default `Actions`. You can point this at any folder, including a nested path (e.g. `5 Tasks/Actions`). If it doesn't exist yet, don't worry — it's created automatically the first time you add a note via **New Action** (step 2 below).
- **Frontmatter type field** — default `Type`. This is the *name* of the YAML key, and it's just as configurable as its value — worth knowing if `Type` is already used for something else in your vault (e.g. `Type: Book`, `Type: Person`).
- **Frontmatter type value** — default `Action`. The value that field must contain.

So out of the box, with no settings changed, a card needs to be inside the `Actions` folder with `Type: Action` in its frontmatter. Change either the folder or the field/value pair here first if the defaults don't fit your vault.

### 2. Create your first Action

#### New action button
With the folder set, click **New Action** in the board's toolbar (or run **New Action Note** from the Command Palette). This creates a note directly inside your Actions folder with the type field, `status`, and `priority` already filled in — no manual YAML editing required.

#### Manually
Prefer to tag an existing note instead? Move it into the Actions folder and add the frontmatter yourself, matching whatever field/value you configured in step 1 — with the defaults, that's just:

```yaml
---
Type: Action
---
```

### 3. Open the board

Ribbon icon (dashboard icon) or Command Palette → **Open board**.

For notes you tag by hand rather than creating via **New Action**, the plugin auto-writes `status_changed` and `order` the first time the board loads them, if they're missing; `status` and `priority` fall back to sensible display defaults (`1 todo` / `medium`) on any note that omits them.

To embed a board inline instead of opening it in the sidebar, place your cursor in any note (a daily note is a natural fit) and run Command Palette → **Embed board** (or the callout variant, for a collapsible box).

![Board embedded inside a daily note](screenshots/embedded-in-daily-note.png)

## Frontmatter reference

**"Required?" below distinguishes three cases, not two:** **Yes** means the note isn't recognized as an Action at all without it. **No — auto-added** means you never have to set it yourself, but the plugin *will* write it into the note's frontmatter the first time the board loads a note that's missing it — it doesn't stay absent. Plain **No** means the plugin never writes it; it's either purely a display fallback or a feature that's simply not shown if it's absent.

| Field            | Customizable?                                               | Required?           | If missing                                                                                                                       | Notes                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Type`           | Field **name**: yes · Required **value**: yes               | **Yes**             | Note isn't recognized as an Action                                                                                               | Both configured under Settings → Note identification. Defaults: field `Type`, value `Action`. Accepts a plain scalar or a single-item YAML list.                                                                       |
| `status`         | Field name: **no**, always `status` · Valid **values**: yes | No                  | Defaults to your first "To Do"-style status (`1 todo` out of the box) for display only — **never auto-written to the file**      | The key itself can't be renamed, but the whole set of valid values is yours to define under Settings → Statuses.                                                                                                       |
| `priority`       | Field name: **no**, always `priority` · Values: **no**      | No                  | Defaults to `medium` for display only — **never auto-written to the file**                                                       | Always exactly `high`, `medium`, or `low` — neither the key nor the 3 values can be changed. See [Known limitations](#known-limitations).                                                                              |
| `status_changed` | Field name: **no**, always `status_changed`                 | **No — auto-added** | **Written to the note automatically**, with today's date, the first time the board loads it                                      | **Must be a plain scalar date** (`status_changed: 2026-08-19`), not a YAML list — see [Known limitations](#known-limitations).                                                                                         |
| Due date         | Field **name**: yes                                         | No                  | No due-date bar shown — **never auto-written**                                                                                   | Configured under Settings → Note identification, default `Due Date`. Whatever you set, `due_date` / `Due Date` / `dueDate` are also always recognized as fallbacks. Same plain-scalar requirement as `status_changed`. |
| `order`          | **No** — plugin-managed, not user-facing                    | **No — auto-added** | **Written to the note automatically**, the first time the board loads it, with a value placing the card after your existing ones | Leave it out entirely; you shouldn't need to edit it by hand.                                                                                                                                                          |
| *(pill fields)*  | Field **name**: yes, fully your choice                      | No                  | —                                                                                                                                | Only shown if you've added it as a "card meta field" in Settings (experimental). You choose both the frontmatter key and its display label.                                                                            |

## Using the example template

This repository includes [`Action_Template.md`](Action_Template.md) as a starting example — it's a [Templater](https://github.com/SilentVoid13/Templater) template, entirely optional to use as-is. You're free to write your own instead; the plugin only cares about the frontmatter fields listed above, not how they got there.

What the example template does:
- Prompts for a title and adds a decorative prefix.
- Prompts you to pick a priority from a short list.
- Writes `Type`, `status`, `priority`, `tags`, and an empty `Description` field.
- Deliberately leaves `status_changed`, `order`, and the due-date field **blank**, letting Action Kanban fill them in on the next board load.
- Lays out a body with sections for objective, context, sub-tasks, a "stuck?" prompt, a running journal, and links.

To wire it up:
1. Install and enable the **Templater** community plugin (if you don't already have it).
2. Copy `Action_Template.md` into your Templater templates folder.
3. In Templater's own settings, add a **Folder Template**: map your Actions folder to this template, so it triggers automatically whenever you create a new note there.

If you don't want to install Templater at all, just use Action Kanban's own **New action** button/command instead — it creates a bare note with sensible default frontmatter with zero external dependencies.

## Usage guide

### Moving a card between statuses

Drag a card onto another column. If that column maps to exactly one status, the move happens immediately — the card's `status` is updated and `status_changed` is stamped with today's date.

If the target column maps to **more than one** status, a small picker appears so you can choose which one:

![Status picker modal](screenshots/status-picker-modal.png)

### Reordering cards

Drag a card up or down within the same priority group (or anywhere in the column, if priority grouping is off). The new position is saved to the card's `order` field and is preserved even if the card later moves to a different column and back.

Dropping a card onto a *different* priority group is intentionally a no-op — priority changes always go through the priority picker below, so drag-and-drop and priority changes never fight each other.

### Changing priority

Click a card's chevron icon to open the priority picker:

![Priority picker modal](screenshots/priority-picker-modal.png)

The card is appended to the end of its new priority group.

### Creating a new Action

Use the toolbar's **New action** button, or Command Palette → **New action note**. Unless "Skip name prompt" is enabled in Settings, you'll be asked for a title; the note is then created with default frontmatter and opened automatically.

### Collapsing columns

Click anywhere on a column's header to collapse it to a compact strip, and click again to expand it. This state is remembered across restarts — and shared by every board you have open (the standalone view and any embeds), since it's tracked per column, not per board.

Turning on **Tilt collapsed columns** in Settings changes the collapsed appearance to a narrow, full-height vertical strip with a rotated title (Trello-style), instead of the default short header-only box.

### Filtering by priority

The toolbar has All / High / Medium / Low buttons. High/Medium/Low can be combined (multi-select); click **All** to clear any active filter.

### Embedding a board in any note

Insert `` ```action-kanban``` `` (or use the "Embed Action Kanban board" / "…in a callout" commands) anywhere in a note. Embedded boards auto-refresh whenever a note in your Actions folder changes.

You can optionally pre-filter an embedded board to a single priority by adding a `filter:` line inside the code block:

````
```action-kanban
filter: high
```
````

### Multi-status columns

A column can map to more than one status — useful if you want, say, two different "waiting" reasons to visually collapse into a single "Waiting" column. See the [Settings reference](#settings-reference) below for how to configure this; see [Moving a card between statuses](#moving-a-card-between-statuses) above for what happens when you drag a card into one.

### Command Palette commands

All of Action Kanban's Command Palette entries are prefixed with "Action Kanban: " by Obsidian automatically.

| Command | What it does |
|---|---|
| **Open board** | Opens the standalone board view, or reveals it if it's already open. |
| **New action note** | Creates a new Action note — prompts for a title unless "Skip name prompt" is enabled in Settings. |
| **Refresh board** | Manually refreshes any open standalone board(s). |
| **Embed board** | Inserts an empty ` ```action-kanban``` ` code block at the cursor. |
| **Embed board in a callout** | Inserts the same embed, wrapped in a collapsible `[!note]+` callout. |


## Settings reference

### Folders
| Setting | Description |
|---|---|
| Actions folder | Vault folder scanned for Action notes (subfolders included). Has autocomplete on Obsidian 1.4.10+. |

### Note identification
| Setting | Description |
|---|---|
| Frontmatter type field | YAML key used to identify Action notes. Default `Type`. |
| Frontmatter type value | Value that field must contain. Default `Action`. |
| Due date field | YAML key for the due date. Default `Due Date` (also recognizes `due_date` / `dueDate` automatically). |

### Board behaviour
| Setting | Description |
|---|---|
| Due date warning window (days) | How many days before the due date the urgency bar starts filling. Default `7`. |
| Done cutoff days | Cards in a "Done" column older than this many days (by `status_changed`) are hidden, replaced with a "N older cards hidden" note. `0` disables hiding. Default `3`. |
| Days-in-status dot size | Diameter in pixels of each aging dot. Default `7`, range `0–10.5`. |
| Group cards by priority | ON: cards are grouped into High/Medium/Low sections within each column. OFF: a single flat list per column, sorted by manual order; priority is still shown on the card but doesn't affect its position. |
| Skip name prompt on New Action | ON: "New Action" creates a note titled "Untitled" immediately, no prompt. Useful if a Templater Folder Template already asks for the name itself. OFF (default): Action Kanban asks for a title. |
| Tilt collapsed columns | ON: collapsed columns become narrow vertical strips instead of header-only boxes. OFF (default). |

![Settings — Statuses and Columns tables](screenshots/settings-statuses-columns.png)

### Statuses
Each status you define maps to one frontmatter value. Configure a label, an ID (must exactly match what you write in `status:`), a color, and whether it counts as a "Done" status (which enables the auto-hide-old-cards behavior for any column it's placed in).

### Columns
Each column groups one or more statuses under a single label. Every status should be assigned to exactly one column — the settings tab will warn you if any status isn't assigned anywhere.

### Card meta fields *(experimental)*
Optional extra frontmatter fields shown as a small line under a card's title (e.g. "Assignee: Alex · Estimate: 3"). Add a row with a display label and the frontmatter key to pull from; a field only appears on a card if that note has a non-empty value for it.

> ⚠️ This feature is newer and less battle-tested than the rest of the plugin. It works, but treat it as experimental for now.

### Appearance
Toggle **Custom colours** to override the board's toolbar, board, column, and card background colors independently for light and dark themes. Off by default, in which case Obsidian's standard theme colors are used everywhere.

### Debugging
**Enable debug logging** writes detailed diagnostic messages to the developer console. Leave this off unless you're troubleshooting — it's verbose.

> Most settings above note that **existing open boards need a manual refresh** to pick up a change — closing and reopening the board (or hitting its refresh button) is enough.

## Known limitations

- **Reserves several frontmatter keys inside your Actions folder** — `Type` (or your renamed field), `status`, `priority`, `order`, `status_changed`, and your configured due-date field are all read by the plugin, and `order`/`status_changed` specifically get written automatically if missing. If any of these are already used for something unrelated on notes that fall inside your Actions folder, check for conflicts before enabling the plugin — see [A note on frontmatter keys](#a-note-on-frontmatter-keys) above.
- **`status_changed` and the due-date field must be written as plain YAML scalars**, not lists. If either is ever written as a list (e.g. by a template or by hand), the plugin currently reads it as though the value were entirely absent, and will silently overwrite `status_changed` with today's date on the next load. `Type`, `status`, and `priority` don't have this restriction.
- **Priority is fixed to exactly three values** — `high`, `medium`, `low`. Unlike Statuses and Columns, there's no way to rename, add, or remove priority levels.
- **Card meta fields (pill fields) are experimental** — functional, but not as thoroughly tested as the rest of the plugin.
- **Collapsed-column state is global**, keyed by column ID rather than per-board — collapsing a column in one embedded board collapses it everywhere that column appears, including the standalone view.

## About this project

Action Kanban was designed, specified, and tested by [SpinEchoArcanist](https://github.com/SpinEchoArcanist) — every feature, naming decision, and bug report is theirs. The implementation itself — `main.js`, `styles.css`, and this README — was written entirely by **Claude**, Anthropic's AI model, across a series of development sessions directed by the maintainer.

**What "vibe-coded" means here, concretely:** I am not a software developer, and I have not personally read through or reviewed the plugin's source code line by line. That said, this isn't a "wrote it once and shipped it" project — I've had Claude run dedicated security, safety, performance, and memory-leak audits against the codebase as part of preparing it for wider use, and I use this plugin daily on my own vault. So it's held to a real standard of scrutiny, just not one that included a professional developer reading the code themselves — decide for yourself whether that's the right trade-off for your vault.

If you run into a bug or have a feature request, feel free to open an issue — fixes and changes will likely go through the same human-directed, AI-implemented process.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
