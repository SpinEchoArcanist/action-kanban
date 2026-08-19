# Action Kanban

**A lightweight, frontmatter-driven Jira-style Kanban board for Obsidian — no Dataview required.**

![License](https://img.shields.io/github/license/SpinEchoArcanist/action-kanban)
![Obsidian minimum version](https://img.shields.io/badge/Obsidian-%E2%89%A51.4.0-7C3AED)
![Platform](https://img.shields.io/badge/platform-desktop%20%26%20mobile-blue)

![Action Kanban — full board overview](screenshots/board-overview.png)

Action Kanban turns any folder of notes into a drag-and-drop Kanban board, driven entirely by YAML frontmatter. Notes become cards, `status` decides which column they land in, `priority` groups them within a column, and a self-healing `order` field remembers exactly how you arranged them — all without needing the Dataview plugin.

---

## Table of contents

- [Why Action Kanban exists](#why-action-kanban-exists)
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

There are already excellent Kanban plugins for Obsidian — including the well-known **Kanban** plugin and **Bases Kanban**. Action Kanban isn't trying to replace them; it exists because I wanted something lighter, and specifically something I could **embed directly inside my daily notes**, not just open as a separate full-screen view.

The name "Action" is a deliberate workaround, not a stylistic choice. Obsidian already has a native notion of a task — the `- [ ]` checkbox, and the popular Tasks plugin built around it — so calling these cards "Tasks" would have created constant naming collisions in my own vault. The actual inspiration is Jira, where the base unit of work is literally called a **Task**. Since that word was already spoken for in Obsidian, "Action" became the stand-in.

The result is a small, opinionated plugin: your notes' frontmatter *is* the board. Nothing to sync, no separate database, no manifest file tracking card order — just fields on the notes you already have.

## Features

- **Frontmatter-driven, no Dataview dependency** — reads/writes plain YAML frontmatter via Obsidian's own API.
- **Three ways to view a board:** a standalone sidebar view, embedded inline in any note via a code block, or embedded inside a callout.
- **Drag-and-drop status changes** between columns, with a picker prompt if a column maps to more than one status.
- **Drag-and-drop reordering** within a priority group — your manual order is remembered even if a card moves away to another column and back.
- **Dedicated priority picker** (click a card's chevron) — kept separate from drag-and-drop so the two gestures never conflict.
- **Fully custom statuses and columns** — define as many statuses as you like, with your own labels and colors, and group them into columns however you want (including several statuses per column).
- **Due-date urgency bar** — fills up and changes color as a due date approaches, pulses when overdue.
- **Days-in-status aging dots** — a small row of dots shows how long a card has sat in its current status, colored in four aging tiers, with a configurable size.
- **Self-healing card order** — new or manually-edited notes get their `order` and `status_changed` fields auto-populated on load; you never have to set them by hand.
- **Collapsible columns**, in either a compact header-only mode or an optional Trello-style tilted strip.
- **Priority filter toolbar** (All / High / Medium / Low).
- **Custom board colors**, independently for light and dark themes.
- **Optional "card meta fields"** *(experimental)* — show extra frontmatter values as a small pill line under a card's title.
- **Works on desktop and mobile.**

## Anatomy of a card

![Anatomy of an Action Kanban card](screenshots/card-anatomy.png)

- **Chevron** (top-left) — shows priority (double red = High, single orange = Medium, single blue = Low) and is clickable to change it.
- **Title** — click anywhere else on the card to open the underlying note in a new tab.
- **Meta / pill row** *(optional, experimental)* — extra frontmatter fields you've configured to show, e.g. `Effort: 3`.
- **Dot row** — one dot per day since the card's status last changed, capped at 28, colored in four aging tiers so long-stuck cards stand out at a glance.
- **Due-date bar** — fills and shifts from green → amber → orange → red as the due date approaches or passes.

## Requirements

- Obsidian **1.4.0** or later.
- Works on **desktop and mobile**.
- No required plugin dependencies. **Templater** is entirely optional — Action Kanban has zero runtime dependency on it — but it pairs nicely if you want note-creation prompts (see [Using the example template](#using-the-example-template)).
- Folder-path autocomplete in Settings needs Obsidian **1.4.10+**; on older 1.4.x installs the Actions-folder field just falls back to a plain text input with no loss of core functionality.

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

1. Decide which vault folder will hold your Action notes — by default the plugin looks for a folder named **Actions**, but this is configurable in Settings → Folders.
2. Create a note in that folder with, at minimum:

   ```yaml
   ---
   Type: Action
   ---
   ```

3. Open the board — either the ribbon icon (dashboard icon) or Command Palette → **Open Action Kanban**.

That's it. The plugin fills in `status`, `priority`, `status_changed`, and `order` for you automatically the first time it loads — you don't need to write them by hand.

To embed a board inline instead of opening it in the sidebar, place your cursor in any note (a daily note is a natural fit) and run Command Palette → **Embed Action Kanban board** (or the callout variant, for a collapsible box).

![Board embedded inside a daily note](screenshots/embedded-in-daily-note.png)

## Frontmatter reference

| Field | Required | If missing | Notes |
|---|---|---|---|
| `Type` *(field name configurable)* | Yes | Note isn't recognized as an Action | Value must exactly match the configured type value (default `Action`). Accepts a plain scalar or a single-item YAML list. |
| `status` | No | Defaults to your first "To Do"-style status (`1 todo` out of the box) | Must exactly match a Status ID you've defined in Settings. |
| `priority` | No | Defaults to `medium` | Must be exactly `high`, `medium`, or `low` — this is a fixed 3-value set, not customizable (see [Known limitations](#known-limitations)). |
| `status_changed` | No | Auto-filled with today's date on load | **Must be a plain scalar date** (`status_changed: 2026-08-19`), not a YAML list — see [Known limitations](#known-limitations). |
| Due date *(field name configurable, default `Due Date`; also recognizes `due_date` / `dueDate`)* | No | No due-date bar shown | Same plain-scalar requirement as `status_changed`. |
| `order` | No | Auto-assigned on load | Internal manual-ranking value. Leave it out — the plugin manages it; you generally shouldn't need to edit it by hand. |
| *(any other key)* | No | — | Only shown on a card if you've configured it as a "card meta field" in Settings (experimental). |

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

If you don't want to install Templater at all, just use Action Kanban's own **New Action** button/command instead — it creates a bare note with sensible default frontmatter with zero external dependencies.

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

Use the toolbar's **New Action** button, or Command Palette → **New Action Note**. Unless "Skip name prompt" is enabled in Settings, you'll be asked for a title; the note is then created with default frontmatter and opened automatically.

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

## Settings reference

![Settings — Statuses and Columns tables](screenshots/settings-statuses-columns.png)

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

- **`status_changed` and the due-date field must be written as plain YAML scalars**, not lists. If either is ever written as a list (e.g. by a template or by hand), the plugin currently reads it as though the value were entirely absent, and will silently overwrite `status_changed` with today's date on the next load. `Type`, `status`, and `priority` don't have this restriction.
- **Priority is fixed to exactly three values** — `high`, `medium`, `low`. Unlike Statuses and Columns, there's no way to rename, add, or remove priority levels.
- **Card meta fields (pill fields) are experimental** — functional, but not as thoroughly tested as the rest of the plugin.
- **Collapsed-column state is global**, keyed by column ID rather than per-board — collapsing a column in one embedded board collapses it everywhere that column appears, including the standalone view.

## About this project

Action Kanban was designed, specified, and tested by [SpinEchoArcanist](https://github.com/SpinEchoArcanist) — every feature, naming decision, and bug report is theirs. The implementation itself — `main.js`, `styles.css`, and this README — was written entirely by **Claude**, Anthropic's AI model, across a series of development sessions directed by the maintainer.

If you run into a bug or have a feature request, feel free to open an issue — fixes and changes will likely go through the same human-directed, AI-implemented process.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
