/*
Action Kanban — hand-maintained; edits are made directly to this file, no separate build step.

Action Kanban — Version 12.8.0

── What this file is ──────────────────────────────────────────────────────
A single flat bundle (no build step, no modules at runtime) containing the
whole plugin: domain logic, Obsidian-specific adapters, UI rendering, and
the plugin entry point, in that rough order top-to-bottom. Sections are
marked with `// ─── Name ───` banners; read those to navigate rather than
scrolling blind.

── How a card's position is decided ───────────────────────────────────────
Cards are notes with YAML frontmatter (`status`, `priority`, `order`, etc.)
living in a configured "Actions" folder — there's no separate database or
manifest file. `order` is a floating-point "global rank" independent of
status/column, computed via fractional-midpoint insertion between
neighbors when a card is dragged (see "Order helpers" below). Moving a
card between columns changes its `status`, not its `order`.

── Why some code looks unusual ─────────────────────────────────────────────
- No `onunload()`: Obsidian already detaches a plugin's registered view
  leaves automatically when the plugin unloads; adding it back is a known
  anti-pattern (see ActionKanbanPlugin at the bottom of this file).
- `AbstractInputSuggest`/`Setting` version guards: this plugin supports
  Obsidian 1.4.0+, but some APIs it uses arrived later. Guards check
  `typeof X === "function"` before relying on them, with a graceful
  fallback rather than crashing on older installs.
- Errors from user-initiated writes (create note, move/reorder a card,
  change priority) are caught and surfaced via `Notice`, not just logged —
  so a failure is visible in the UI, not just the developer console.
*/

"use strict";
var AK_BUILD_VERSION = "12.8.0";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ActionKanbanPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// ─── Settings ─────────────────────────────────────────────────────────────────
// Shape of ActionKanbanPlugin.settings, persisted via Plugin.saveData()/loadData().
// Merged onto whatever's loaded from disk in ActionKanbanPlugin.onload() (see
// bottom of file) so new fields introduced in later versions get sane defaults
// on existing installs rather than being undefined.

var DEFAULT_SETTINGS = {
  actionsFolder: "Actions",
  actionTypeField: "Type",
  actionTypeValue: "Action",
  dueDateField: "Due Date",
  dueDateWarningDays: 7,
  doneCutoffDays: 3,
  dotSizePx: 7,
  priorityGrouping: true,
  debugLogging: false,
  skipNewActionNamePrompt: false,
  pillFields: [],
  statuses: [
    { id: "1 todo",        label: "To Do",       color: "#6B7280", isDone: false },
    { id: "2 in progress", label: "In Progress", color: "#3B82F6", isDone: false },
    { id: "3 waiting",     label: "Waiting",     color: "#F59E0B", isDone: false },
    { id: "4 done",        label: "Done",        color: "#10B981", isDone: true  }
  ],
  columns: [
    { id: "col-1-to-do",       label: "To Do",       statusIds: ["1 todo"]        },
    { id: "col-2-in-progress", label: "In Progress", statusIds: ["2 in progress"] },
    { id: "col-3-waiting",     label: "Waiting",     statusIds: ["3 waiting"]     },
    { id: "col-4-done",        label: "Done",        statusIds: ["4 done"]        }
  ],
  // Column ids currently collapsed (header-only view, card list hidden).
  // Persisted across restarts; shared globally across the standalone view
  // and all embeds since it's keyed by column id, not per-board.
  collapsedColumns: [],
  // When true, a collapsed column renders as a narrow vertical strip
  // (rotated title, runs the full column height) instead of the default
  // header-only view. Off by default to preserve existing behavior.
  tiltCollapsedColumns: false,
  // Custom background colors. When customColorsEnabled is false, none of
  // the 8 hex values below are applied — the board uses Obsidian's
  // standard theme colors exactly as before. The hex values here are just
  // a starting palette for when the toggle is first turned on; they are
  // not derived from any specific theme.
  customColorsEnabled: false,
  toolbarBgLight: "#ffffff",
  toolbarBgDark:  "#1e1e1e",
  boardBgLight:  "#ffffff",
  boardBgDark:   "#1e1e1e",
  columnBgLight: "#f0f0f0",
  columnBgDark:  "#262626",
  cardBgLight:   "#e8e8e8",
  cardBgDark:    "#2f2f2f",
  // Custom accent palette. When accentPaletteEnabled is false, the board
  // uses Obsidian's own semantic colors (--interactive-accent, --color-*)
  // everywhere a themed accent is needed, exactly as before. The hex
  // values here are the default starting palette (copper-led, light/dark
  // pair per token) for when the toggle is first turned on.
  accentPaletteEnabled: false,
  accentCopperLight: "#b8663a",
  accentCopperDark:  "#d39467",
  accentBlueLight:   "#2f7f9e",
  accentBlueDark:    "#76bfd7",
  accentVioletLight: "#6f4fa8",
  accentVioletDark:  "#ae94d9",
  accentGreenLight:  "#4a7a3a",
  accentGreenDark:   "#8fbf7a",
  accentRedLight:    "#b8462f",
  accentRedDark:     "#d97a6c",
  accentAmberLight:  "#9a6f1f",
  accentAmberDark:   "#d9b26c",
  accentCyanLight:   "#1f7a72",
  accentCyanDark:    "#6fc9c2",
  // Background image (Trello-style backdrop behind the whole board root).
  // backgroundImageEnabled gates whether backgroundImagePath is applied.
  // Path is vault-relative (e.g. "Attachments/board-bg.png"), resolved via
  // app.vault.adapter.getResourcePath() — a raw OS filesystem path would
  // not work reliably from inside the plugin sandbox, and would break on
  // mobile entirely.
  backgroundImageEnabled: false,
  backgroundImagePath: "",
  // When true, refreshBingBackground() fetches Bing's "image of the day"
  // once per calendar day and writes it to bingBackgroundPath (below) —
  // a separate, Bing-owned path, NOT backgroundImagePath. An earlier
  // version of this feature reused backgroundImagePath directly, which
  // silently overwrote a manually-selected background image the moment
  // Bing mode was turned on — fixed by always writing to a distinct
  // filename in the same folder instead. Off by default: this makes an
  // outbound network request to bing.com, which is a real behavior
  // change worth an explicit opt-in rather than a silent default-on.
  bingBackgroundEnabled: false,
  // Vault-relative path Bing's image was actually written to (same
  // folder as backgroundImagePath, but always the fixed filename
  // "ak-bing-daily.jpg" — see refreshBingBackground()). Internal/derived,
  // never directly user-edited; applyBackgroundImage() resolves this path
  // instead of backgroundImagePath while Bing mode is on, so the user's
  // own manually-chosen image (still sitting at backgroundImagePath) is
  // preserved and reappears automatically if Bing mode is turned off.
  bingBackgroundPath: "",
  // Attribution text from Bing's API response (photographer/location
  // credit), shown as a small overlay in the board's bottom-right corner
  // via applyBackgroundImage()'s --ak-bing-attribution-text body-level
  // custom property — see the body[style*="--ak-bing-attribution-text"]
  // .ak-board-root::after rule in styles.css. Empty when Bing mode is off
  // or no fetch has succeeded yet.
  bingBackgroundAttribution: "",
  // YYYY-MM-DD of the last successful Bing fetch, so refreshBingBackground()
  // only hits the network once per day rather than on every plugin load.
  bingLastFetchedDate: "",
  // Opacity (0-100) of the semi-transparent overlay used on toolbar
  // buttons, the New Action button, and column bodies when a background
  // image is active — controls how much of the image shows through
  // versus how readable text/controls stay on top of it. Only has any
  // visible effect while backgroundImageEnabled is true; irrelevant
  // otherwise since those elements use their normal opaque colors when
  // there's no image to show through.
  backgroundOverlayOpacity: 55
};

// ─── Debug logging ──────────────────────────────────────────────────────────
// Gated by ActionKanbanSettings.debugLogging (Settings tab → Debugging).
// Default OFF. dbg() replaces the plugin's informational/trace console.log
// and console.debug calls. Genuine operation-failure console.warn/console.error
// calls are intentionally NOT gated — those always surface regardless of
// this flag, since silencing real errors by default would hide real bugs.
let AK_DEBUG = false;
function dbg(...args) {
  if (AK_DEBUG) console.debug(...args);
}

// ─── Obsidian imports ──────────────────────────────────────────────────────────

var import_obsidian = require("obsidian");

// ─── IsoDate value object ──────────────────────────────────────────────────────
// Stores dates as plain "YYYY-MM-DD" strings rather than Date objects, so
// values round-trip through YAML frontmatter without timezone surprises.
// from() only accepts a JS Date, an ISO string, or an ISO-with-time string
// (time is discarded) — it does NOT unwrap YAML lists. Callers that read
// from frontmatter must pass a plain scalar already; see the "Known Open
// Issues" note in PROJECT_HANDOFF.md re: status_changed / due-date fields.

var IsoDate = class _IsoDate {
  constructor(value) { this.value = value; }

  static from(raw) {
    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) return null;
      const y  = raw.getFullYear();
      const mo = String(raw.getMonth() + 1).padStart(2, "0");
      const d  = String(raw.getDate()).padStart(2, "0");
      return new _IsoDate(`${y}-${mo}-${d}`);
    }
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const trimmed = raw.trim();
    const dt = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (dt) return new _IsoDate(dt[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    return new _IsoDate(trimmed);
  }

  static today() {
    const d   = new Date();
    const y   = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return new _IsoDate(`${y}-${mo}-${day}`);
  }

  toDate() {
    const [y, m, d] = this.value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  daysUntil(other) {
    return Math.round((other.toDate().getTime() - this.toDate().getTime()) / 864e5);
  }

  equals(other) { return this.value === other.value; }
};

// ─── Priority value object ─────────────────────────────────────────────────────
// Deliberately a fixed three-value enum (high/medium/low) with no settings
// UI to add, remove, or rename values — unlike Statuses/Columns, which are
// fully user-configurable. from() defaults anything unrecognized to MEDIUM
// rather than throwing, since a note with a missing/invalid priority should
// still render on the board.

var _Priority = class _Priority {
  constructor(value) { this.value = value; }

  static from(raw) {
    if (raw === "high")   return _Priority.HIGH;
    if (raw === "medium") return _Priority.MEDIUM;
    if (raw === "low")    return _Priority.LOW;
    return _Priority.MEDIUM;
  }

  equals(other) { return this.value === other.value; }

  sortWeight() {
    switch (this.value) {
      case "high":   return 0;
      case "medium": return 1;
      case "low":    return 2;
    }
  }
};
_Priority.HIGH   = new _Priority("high");
_Priority.MEDIUM = new _Priority("medium");
_Priority.LOW    = new _Priority("low");
var Priority = _Priority;

// ─── Action entity ─────────────────────────────────────────────────────────────
//
// `order` is a global floating-point rank. null = absent/invalid.
// Notes with null order are displayed last (alphabetical tiebreak) and
// are repaired by the bootstrap pass.

var Action = class {
  constructor(name, path, status, priority, statusChanged, dueDate, order, frontmatter) {
    this.name          = name;
    this.path          = path;
    this.status        = status;
    this.priority      = priority;
    this.statusChanged = statusChanged;
    this.dueDate       = dueDate;
    this.order         = order;
    this.frontmatter   = frontmatter;
  }
};

// ─── Order helpers ─────────────────────────────────────────────────────────────

// Parses the raw frontmatter `order` value into a finite number, or null if
// absent/unparseable (a null order sorts last and gets healed on next load —
// see ObsidianActionRepository.repairOrders() below).
function parseOrder(raw) {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (!isFinite(n)) return null;
  return n;
}

/**
 * Compute midpoint order between two neighbors.
 * prev=null => nothing above => use next/2  (always positive when next>0)
 * next=null => nothing below => use prev + 10000
 * both null => 10000
 */
function midpointOrder(prev, next) {
  if (prev === null && next === null) return 10000;
  if (prev === null) return next / 2;
  if (next === null) return prev + 10000;
  return (prev + next) / 2;
}

// Below this gap between two neighbors' order values, repeated midpoint
// insertion would start losing floating-point precision. When a computed
// gap falls under this threshold, the whole affected priority group is
// renumbered to even multiples of 10000 (10000, 20000, 30000, …) to open
// up headroom again — see ReorderCardUseCase below for where this triggers.
const GAP_THRESHOLD = 1;

// ─── Note title sanitization ───────────────────────────────────────────────────
// Guards against a user-typed note title becoming an unintended file path.
// Rejects (rather than silently stripping) anything that could change which
// folder a note lands in or crash vault.create() on a given OS, since a
// silent transformation could itself surprise the user. Callers are expected
// to surface the thrown Error via a Notice.
const INVALID_TITLE_CHARS = /[\\/:*?"<>|]/;

function sanitizeNoteTitle(name) {
  const trimmed = (name || "").trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error("Note title cannot be empty, \".\", or \"..\".");
  }
  if (INVALID_TITLE_CHARS.test(trimmed)) {
    throw new Error("Note title cannot contain \\ / : * ? \" < > |");
  }
  return trimmed;
}

// ─── ObsidianActionRepository ─────────────────────────────────────────────────
// The only class that reads/writes Action notes' frontmatter directly.
// Everything else in the plugin goes through this repository rather than
// touching app.vault/app.fileManager itself. Roughly four responsibilities:
// reading notes into Action objects (below), single-field writes, the
// cold-start "bootstrap" passes that backfill missing status_changed/order
// on existing notes, and note creation.

var ObsidianActionRepository = class _Repo {
  constructor(app, getActionsFolder, getActionTypeField, getActionTypeValue, getDueDateField) {
    this.app               = app;
    this.getActionsFolder  = getActionsFolder;
    this.getActionTypeField = getActionTypeField;
    this.getActionTypeValue = getActionTypeValue;
    this.getDueDateField   = getDueDateField;
    /**
     * Paths currently being written by an in-flight drag-drop operation.
     * The self-healer skips these paths to avoid overwriting a concurrent
     * drag-initiated write with a stale bootstrap value.
     */
    this.writesInFlight = new Set();
    /**
     * True once Obsidian's metadataCache has fired its one-time "resolved"
     * event (initial full vault indexing complete). Self-healing writes
     * (repairOrders) are gated on this to prevent misreading a still-cold
     * cache as "field missing" and overwriting/rewriting files that already
     * have valid frontmatter. Root cause of the startup mass-rewrite bug.
     */
    this.metadataResolved = false;
  }

  markMetadataResolved() {
    this.metadataResolved = true;
  }

  // Scans every markdown file under the Actions folder and returns the
  // ones whose type field matches (e.g. Type: Action). Reads from Obsidian's
  // metadataCache, not raw disk content — fast, but see repairOrders() below
  // for why a couple of write paths deliberately re-read from disk instead.
  async getAllActions() {
    const folder    = this.getActionsFolder();
    const prefix    = folder.endsWith("/") ? folder : folder + "/";
    const typeField = this.getActionTypeField();
    const typeValue = this.getActionTypeValue();
    const files     = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(prefix));
    const actions   = [];
    for (const file of files) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      if (!_Repo.scalarOrListIncludes(fm[typeField], typeValue)) continue;
      actions.push(this._fileToAction(file, fm));
    }
    dbg("[AK-REPO] getAllActions: scanned", files.length, "files, returned", actions.length, "actions");
    return actions;
  }

  // True if rawValue (a plain scalar OR a single-item YAML list) equals
  // target. Used for the type-field match above, since YAML lets a user
  // accidentally write `Type:\n  - Action` and it should still count.
  static scalarOrListIncludes(rawValue, target) {
    if (typeof rawValue === "string") return rawValue === target;
    if (Array.isArray(rawValue)) return rawValue.some(v => String(v) === target);
    return false;
  }

  // Normalizes a scalar-or-single-item-list frontmatter value to a plain
  // string. Applied to `status`/`priority` below. NOT applied to
  // status_changed or the due-date field — those are passed straight to
  // IsoDate.from(), which only accepts a scalar. If either is ever written
  // as a YAML list, IsoDate.from() returns null (treated as "absent"),
  // silently triggering a bootstrap rewrite. Known, not yet fixed —
  // see PROJECT_HANDOFF.md §5.1.
  static scalarString(raw) {
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
    return null;
  }

  // Maps one note's frontmatter + TFile into an Action domain object.
  _fileToAction(file, fm) {
    const status        = _Repo.scalarString(fm["status"]) ?? "1 todo";
    const priority      = Priority.from(_Repo.scalarString(fm["priority"]));
    const statusChanged = IsoDate.from(fm["status_changed"]);
    const dueDateKey    = this.getDueDateField();
    const dueDateRaw    = fm[dueDateKey] ?? fm["due_date"] ?? fm["Due Date"] ?? fm["dueDate"] ?? null;
    const dueDate       = IsoDate.from(dueDateRaw);
    const order         = parseOrder(fm["order"]);
    return new Action(file.basename, file.path, status, priority, statusChanged, dueDate, order, fm);
  }

  // ── Single-field writes ─────────────────────────────────────────────────────

  // Drag-drop status change: stamps status_changed with today's date in the
  // same write, so "days in status" resets immediately rather than waiting
  // for a bootstrap pass to notice.
  async updateStatus(notePath, newStatus, today) {
    dbg("[AK-WRITE] updateStatus called for:", notePath, "stack:", new Error().stack?.split("\n").slice(1, 6).join(" | "));
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof import_obsidian.TFile)) throw new Error(`File not found: ${notePath}`);
    await this.app.fileManager.processFrontMatter(file, fm => {
      fm["status"]         = newStatus;
      fm["status_changed"] = today.value;
    });
  }

  // Priority-picker write. Order is untouched here — priority changes append
  // the card to the end of its new priority group via reorderCard() instead.
  async updatePriority(notePath, newPriority) {
    dbg("[AK-WRITE] updatePriority called for:", notePath, "stack:", new Error().stack?.split("\n").slice(1, 6).join(" | "));
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof import_obsidian.TFile)) throw new Error(`File not found: ${notePath}`);
    await this.app.fileManager.processFrontMatter(file, fm => {
      fm["priority"] = newPriority.value;
    });
  }

  /**
   * Write order + optionally priority in ONE processFrontMatter call
   * to avoid firing two metadataCache "changed" events for one drag.
   * Registers the path in writesInFlight for the duration of the write
   * so the self-healer skips it.
   */
  async updateOrder(notePath, order, newPriorityValue) {
    dbg("[AK-WRITE] updateOrder called for:", notePath, "order:", order, "stack:", new Error().stack?.split("\n").slice(1, 6).join(" | "));
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof import_obsidian.TFile)) throw new Error(`File not found: ${notePath}`);
    this.writesInFlight.add(notePath);
    try {
      await this.app.fileManager.processFrontMatter(file, fm => {
        fm["order"] = order;
        if (newPriorityValue !== null && newPriorityValue !== undefined) {
          fm["priority"] = newPriorityValue;
        }
      });
    } finally {
      this.writesInFlight.delete(notePath);
    }
  }

  // ── Bootstrap passes ────────────────────────────────────────────────────────

  /**
   * Assign today's date to `status_changed` on every Action note missing it.
   * Guarded by a raw-disk-content re-read (below) before writing, and by
   * metadataResolved being set before this is ever called from BootstrapUseCase —
   * both exist specifically to prevent the cold-start mass-rewrite bug
   * described in PROJECT_HANDOFF.md §3.4.
   */
  async bootstrapStatusChanged(actions, today) {
    for (const action of actions) {
      if (action.statusChanged !== null) {
        dbg("[AK-BOOTSTRAP-SC] SKIP (cache has value):", action.path, "statusChanged=", action.statusChanged.value);
        continue;
      }
      dbg("[AK-BOOTSTRAP-SC] CACHE SAYS MISSING:", action.path);
      const file = this.app.vault.getAbstractFileByPath(action.path);
      if (!(file instanceof import_obsidian.TFile)) {
        dbg("[AK-BOOTSTRAP-SC]   SKIP (file not found):", action.path);
        continue;
      }
      // RAW FILE CHECK: verify the field is genuinely missing on disk
      try {
        const rawContent = await this.app.vault.read(file);
        const hasStatusChanged = /^status_changed\s*:/m.test(rawContent);
        if (hasStatusChanged) {
          dbg("[AK-BOOTSTRAP-SC]   RAW FILE GUARD: field EXISTS on disk, SKIPPING write");
          continue;
        }
        dbg("[AK-BOOTSTRAP-SC]   RAW FILE GUARD: field truly MISSING on disk, proceeding to write");
      } catch (readErr) {
        console.warn("[AK-BOOTSTRAP-SC]   Failed to read raw file for guard check:", action.path, readErr);
      }
      try {
        dbg("[AK-BOOTSTRAP-SC]   ABOUT TO WRITE status_changed to:", action.path);
        await this.app.fileManager.processFrontMatter(file, fm => {
          fm["status_changed"] = today.value;
        });
        dbg("[AK-BOOTSTRAP-SC]   WRITTEN to:", action.path);
      } catch (err) {
        console.warn(`[ActionKanban] Failed to bootstrap status_changed for ${action.path}:`, err);
      }
    }
  }

  /**
   * Assign `order` to every Action note that is missing it.
   * Sort missing-order notes by file ctime (older file = lower order value).
   * Uses globalMax + 10000, 20000, … so new notes land after existing ones.
   */
  async bootstrapOrder(actions) {
    let globalMax = 0;
    for (const a of actions) {
      if (a.order !== null && a.order > globalMax) globalMax = a.order;
    }
    dbg("[AK-BOOTSTRAP-ORD] globalMax=", globalMax, "total actions=", actions.length);

    const needsOrder = actions
      .filter(a => {
        if (a.order !== null) {
          dbg("[AK-BOOTSTRAP-ORD] SKIP (has order):", a.path, "order=", a.order);
          return false;
        }
        dbg("[AK-BOOTSTRAP-ORD] CACHE SAYS MISSING order:", a.path);
        return true;
      })
      .map(a => {
        const file  = this.app.vault.getAbstractFileByPath(a.path);
        const ctime = (file instanceof import_obsidian.TFile) ? file.stat.ctime : 0;
        return { path: a.path, ctime };
      })
      .sort((x, y) => x.ctime - y.ctime);

    for (const { path } of needsOrder) {
      globalMax += 10000;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof import_obsidian.TFile)) {
        dbg("[AK-BOOTSTRAP-ORD]   SKIP (file not found):", path);
        continue;
      }
      // RAW FILE CHECK: verify the field is genuinely missing on disk
      try {
        const rawContent = await this.app.vault.read(file);
        const hasOrder = /^order\s*:/m.test(rawContent);
        if (hasOrder) {
          dbg("[AK-BOOTSTRAP-ORD]   RAW FILE GUARD: field EXISTS on disk, SKIPPING write");
          continue;
        }
        dbg("[AK-BOOTSTRAP-ORD]   RAW FILE GUARD: field truly MISSING on disk, proceeding to write");
      } catch (readErr) {
        console.warn("[AK-BOOTSTRAP-ORD]   Failed to read raw file for guard check:", path, readErr);
      }
      try {
        dbg("[AK-BOOTSTRAP-ORD]   ABOUT TO WRITE order =", globalMax, "to:", path);
        await this.app.fileManager.processFrontMatter(file, fm => { fm["order"] = globalMax; });
        dbg("[AK-BOOTSTRAP-ORD]   WRITTEN to:", path);
      } catch (err) {
        console.warn(`[ActionKanban] Failed to bootstrap order for ${path}:`, err);
      }
    }
  }

  // ── Self-healing order repair ────────────────────────────────────────────────

  /**
   * Write order values to notes that BoardProjection found with null order.
   * Skips any path currently in writesInFlight to avoid overwriting a
   * concurrent drag-drop write with a stale bootstrap value.
   * Called fire-and-forget from LoadBoardUseCase after every board load that
   * contains null-order cards.
   */
  async repairOrders(repairList) {
    dbg("[AK-REPAIR] repairList.length =", repairList.length);
    if (!this.metadataResolved) {
      dbg("[AK-REPAIR] SKIP ALL: metadataCache not yet resolved (cold-start race guard)");
      return;
    }
    for (const { path, order } of repairList) {
      if (this.writesInFlight.has(path)) {
        dbg("[AK-REPAIR] SKIP (inFlight):", path);
        continue;
      }
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof import_obsidian.TFile)) {
        dbg("[AK-REPAIR] SKIP (file not found):", path);
        continue;
      }
      // RAW FILE GUARD: verify the order field is genuinely missing on disk
      // before overwriting. Protects against a stale/cold metadataCache
      // reporting order as null for a file that already has a valid value.
      try {
        const rawContent = await this.app.vault.read(file);
        if (/^order\s*:/m.test(rawContent)) {
          dbg("[AK-REPAIR]   RAW FILE GUARD: field EXISTS on disk, SKIPPING write:", path);
          continue;
        }
      } catch (readErr) {
        console.warn("[AK-REPAIR]   Failed to read raw file for guard check:", path, readErr);
        continue;
      }
      dbg("[AK-REPAIR] ABOUT TO WRITE order =", order, "to:", path);
      try {
        await this.app.fileManager.processFrontMatter(file, fm => { fm["order"] = order; });
        dbg("[AK-REPAIR] WRITTEN to:", path);
      } catch (err) {
        console.warn(`[ActionKanban] repairOrders: failed for ${path}:`, err);
      }
    }
  }

  /**
   * Eagerly assign a concrete order to a single null-order note.
   * Used to heal an immediate drag-drop neighbor before computing the midpoint.
   * Skips (returns null) if the path is already in writesInFlight.
   * Returns the assigned order on success, null if skipped or failed.
   */
  async healSingleOrder(path, order) {
    if (this.writesInFlight.has(path)) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile)) return null;
    try {
      await this.app.fileManager.processFrontMatter(file, fm => { fm["order"] = order; });
      return order;
    } catch (err) {
      console.warn(`[ActionKanban] healSingleOrder: failed for ${path}:`, err);
      return null;
    }
  }

  // ── Note creation ───────────────────────────────────────────────────────────

  // User-titled note (the normal "New Action" flow). See sanitizeNoteTitle()
  // above for what titles get rejected and why.
  async createNote(name) {
    const safeName = sanitizeNoteTitle(name);
    const folder   = this.getActionsFolder();
    const path     = import_obsidian.normalizePath(`${folder}/${safeName}.md`);
    await this._ensureFolder(folder);
    await this.app.vault.create(path, "");
    return path;
  }

  // "Skip name prompt" flow: creates "Untitled.md", "Untitled 1.md", etc.
  // with no user input, so there's nothing here for sanitizeNoteTitle() to
  // guard against.
  async createAutoNamedNote() {
    const folder = this.getActionsFolder();
    await this._ensureFolder(folder);
    const path = (typeof this.app.vault.getAvailablePath === "function")
      ? this.app.vault.getAvailablePath(`${folder}/Untitled`, "md")
      : await this._findAvailableUntitledPath(folder);
    await this.app.vault.create(path, "");
    return path;
  }

  // Fallback for Obsidian installs where vault.getAvailablePath() isn't
  // available (feature-detected above, same pattern as the FolderSuggest/
  // AbstractInputSuggest guard). Finds the first unused "Untitled N.md"
  // by checking vault existence directly, rather than hard-crashing.
  async _findAvailableUntitledPath(folder) {
    const base = `${folder}/Untitled`;
    if (!this.app.vault.getAbstractFileByPath(`${base}.md`)) return `${base}.md`;
    let n = 1;
    while (this.app.vault.getAbstractFileByPath(`${base} ${n}.md`)) n++;
    return `${base} ${n}.md`;
  }

  // Fills in the standard Action frontmatter on a freshly-created bare note
  // (both createNote() and createAutoNamedNote() call this right after).
  // No Templater awareness at all — see PROJECT_HANDOFF.md §3.4 for why
  // that integration was removed rather than patched.
  async writeDefaultFrontmatter(notePath, globalMaxOrder) {
    dbg("[AK-WRITE] writeDefaultFrontmatter called for:", notePath, "stack:", new Error().stack?.split("\n").slice(1, 6).join(" | "));
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof import_obsidian.TFile)) return;
    const typeField = this.getActionTypeField();
    const typeValue = this.getActionTypeValue();
    const today     = IsoDate.today();
    const newOrder  = (typeof globalMaxOrder === "number" ? globalMaxOrder : 0) + 10000;
    await this.app.fileManager.processFrontMatter(file, fm => {
      fm[typeField]        = typeValue;
      fm["status"]         = "1 todo";
      fm["priority"]       = "medium";
      fm["status_changed"] = today.value;
      fm["order"]          = newOrder;
    });
  }

  // ── Renumber ────────────────────────────────────────────────────────────────

  /**
   * Renumber all notes in a sorted array of paths.
   * Triggered when fractional midpoint would fall below GAP_THRESHOLD.
   * Assigns 10000, 20000, 30000 … preserving supplied order.
   */
  async renumberGroup(sortedPaths) {
    for (let i = 0; i < sortedPaths.length; i++) {
      const file = this.app.vault.getAbstractFileByPath(sortedPaths[i]);
      if (!(file instanceof import_obsidian.TFile)) continue;
      try {
        const newOrder = (i + 1) * 10000;
        await this.app.fileManager.processFrontMatter(file, fm => { fm["order"] = newOrder; });
      } catch (err) {
        console.warn(`[ActionKanban] Failed to renumber ${sortedPaths[i]}:`, err);
      }
    }
  }

  // ── Folder helper ───────────────────────────────────────────────────────────

  // Creates the Actions folder if it doesn't exist yet. The catch swallows a
  // races-with-another-caller failure (folder created between the check and
  // the create call) rather than a real error — re-checks existence before
  // deciding whether to actually throw.
  async _ensureFolder(folderPath) {
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof import_obsidian.TFolder) return;
    if (existing !== null)
      throw new Error(`[ActionKanban] Actions folder path "${folderPath}" exists but is not a folder.`);
    try {
      await this.app.vault.createFolder(folderPath);
    } catch {
      const check = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(check instanceof import_obsidian.TFolder))
        throw new Error(`[ActionKanban] Could not create actions folder "${folderPath}".`);
    }
  }
};

// ─── Vault adapter ────────────────────────────────────────────────────────────
// Thin wrapper around Obsidian's workspace API for opening notes — kept
// separate from ObsidianActionRepository since it's about navigation, not
// reading/writing Action data.

var ObsidianVaultAdapter = class {
  constructor(app) { this.app = app; }
  async openNoteInNewTab(noteName) {
    await this.app.workspace.openLinkText(noteName, "", true);
  }
  async openNoteAtPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }
  }
};

// ─── KanbanBoard ──────────────────────────────────────────────────────────────
// The rendered board's shape: an ordered list of columns, each already
// containing its priority-grouped cards. Built by BoardProjection below —
// nothing else constructs one directly.

var KanbanBoard = class _KB {
  constructor(columns) { this.columns = columns; }
  static empty() { return new _KB([]); }
};

// ─── BoardProjection ──────────────────────────────────────────────────────────
// Pure transformation: flat list of Actions → a KanbanBoard grouped by
// column/status and sub-grouped by priority. Makes no writes itself — a
// card found with a null order here is only queued into repairList for the
// caller (LoadBoardUseCase) to hand off to the repository afterward.
//
// Sort within each (column, priority) group:
//   1. Notes with valid order, ascending.
//   2. Notes with null order, appended alphabetically (shown last, repaired by bootstrap).

var BoardProjection = class {
  project(input) {
    const { actions, statuses, columns, doneCutoffDays, today, priorityFilter, priorityGrouping } = input;
    const statusMap  = new Map(statuses.map(s => [s.id, s]));
    const todayMs    = today.toDate().getTime();
    const cutoffMs   = doneCutoffDays * 864e5;
    const PRIO_ORDER = ["high", "medium", "low"];

    // Compute globalMax once for repair value assignment
    let globalMax = 0;
    for (const a of actions) {
      if (a.order !== null && a.order > globalMax) globalMax = a.order;
    }

    // repairList: null-order cards encountered during projection.
    // Values are assigned above globalMax so repaired cards land at the end
    // of the board. Populated during the group sort pass below.
    const repairList = [];
    let repairCounter = 0;

    const kanbanColumns = columns.map(colDef => {
      let colActions = actions.filter(a => colDef.statusIds.includes(a.status));

      const isDone = colDef.statusIds.some(sid => statusMap.get(sid)?.isDone);
      let hiddenCount = 0;
      if (isDone) {
        const before = colActions.length;
        colActions = colActions.filter(a => {
          if (!a.statusChanged) return true;
          return todayMs - a.statusChanged.toDate().getTime() <= cutoffMs;
        });
        hiddenCount = before - colActions.length;
      }

      if (priorityFilter.length > 0) {
        colActions = colActions.filter(a => priorityFilter.includes(a.priority.value));
      }

      // Two branches below intentionally duplicate the same order/name sort —
      // one produces real priority groups, the other a single synthetic
      // group with priority: null (flat mode / priorityGrouping off). Keep
      // both in sync if the sort logic ever changes.
      const groups = (priorityGrouping !== false)
        ? PRIO_ORDER.map(p => {
            const cards = colActions
              .filter(a => a.priority.value === p)
              .sort((x, y) => {
                if (x.order !== null && y.order !== null) return x.order - y.order;
                if (x.order !== null) return -1;
                if (y.order !== null) return  1;
                return x.name.localeCompare(y.name);
              });
            for (const card of cards) {
              if (card.order === null) {
                repairCounter++;
                repairList.push({ path: card.path, order: globalMax + repairCounter * 10000 });
              }
            }
            return { priority: p, cards };
          }).filter(g => isDone ? g.cards.length > 0 : true)
        : (() => {
            const cards = colActions.sort((x, y) => {
              if (x.order !== null && y.order !== null) return x.order - y.order;
              if (x.order !== null) return -1;
              if (y.order !== null) return  1;
              return x.name.localeCompare(y.name);
            });
            for (const card of cards) {
              if (card.order === null) {
                repairCounter++;
                repairList.push({ path: card.path, order: globalMax + repairCounter * 10000 });
              }
            }
            return [{ priority: null, cards }].filter(g => isDone ? g.cards.length > 0 : true);
          })();

      const color = statusMap.get(colDef.statusIds[0])?.color ?? "#6B7280";
      return {
        id: colDef.id,
        label: colDef.label,
        statusIds: colDef.statusIds,
        color,
        isDone,
        priorityGroups: groups,
        hiddenCount
      };
    });

    return { board: new KanbanBoard(kanbanColumns), repairList };
  }
};

// ─── LoadBoardUseCase ─────────────────────────────────────────────────────────
// Orchestrates a full board load: fetch all actions, project them into a
// KanbanBoard, then fire off any needed order-repair writes in the
// background (doesn't block the render on them).

var LoadBoardUseCase = class {
  constructor(actionRepo) {
    this.actionRepo = actionRepo;
    this.projection = new BoardProjection();
  }
  async execute(input) {
    dbg("[AK-LOAD-BOARD] execute called");
    const today   = IsoDate.today();
    const actions = await this.actionRepo.getAllActions();
    dbg("[AK-LOAD-BOARD] got", actions.length, "actions");
    const { board, repairList } = this.projection.project({
      actions,
      statuses:        input.statuses,
      columns:         input.columns,
      doneCutoffDays:  input.doneCutoffDays,
      today,
      priorityFilter:  input.priorityFilter,
      priorityGrouping: input.priorityGrouping
    });
    dbg("[AK-LOAD-BOARD] repairList.length =", repairList.length);
    // Fire self-healing writes non-blockingly after projection.
    // repairList is empty when all cards have valid order values (normal steady state).
    if (repairList.length > 0) {
      this.actionRepo.repairOrders(repairList).catch(err =>
        console.warn("[ActionKanban] repairOrders background pass failed:", err)
      );
    }
    return board;
  }
};

// ─── MoveCardUseCase ──────────────────────────────────────────────────────────
// Only writes status + status_changed. order is intentionally preserved.

var MoveCardUseCase = class {
  constructor(actionRepo) { this.actionRepo = actionRepo; }
  async execute(input) {
    await this.actionRepo.updateStatus(input.notePath, input.toStatusId, IsoDate.today());
  }
};

// ─── ReorderCardUseCase ───────────────────────────────────────────────────────

var ReorderCardUseCase = class {
  constructor(actionRepo) { this.actionRepo = actionRepo; }

  async execute(input) {
    let { notePath, prevOrder, nextOrder, newPriority, groupSortedPaths,
          prevPath, nextPath, globalMaxForHeal } = input;
    dbg("[ActionKanban] ReorderCardUseCase: path:", notePath, "prevOrder:", prevOrder, "nextOrder:", nextOrder, "newPriority:", newPriority);

    // ── Eager heal of null-order neighbors ──────────────────────────────────
    // If either immediate neighbor has a null order, assign it a concrete value
    // now (before computing the midpoint) so the dragged card lands precisely
    // between its visual neighbors rather than at an arbitrary position.
    // Each heal is awaited (at most 2 processFrontMatter calls = negligible latency).
    // The writesInFlight guard in healSingleOrder prevents overwriting a
    // concurrent drag write on the same note.
    if (prevOrder === null && prevPath) {
      // Assign the prev neighbor a value just below the next anchor (or a baseline)
      const healVal = nextOrder !== null ? nextOrder - 10000 : (globalMaxForHeal ?? 0) + 10000;
      const assigned = await this.actionRepo.healSingleOrder(prevPath, healVal);
      if (assigned !== null) prevOrder = assigned;
    }
    if (nextOrder === null && nextPath) {
      // Assign the next neighbor a value just above the prev anchor (or a baseline)
      const healVal = prevOrder !== null ? prevOrder + 10000 : (globalMaxForHeal ?? 0) + 20000;
      const assigned = await this.actionRepo.healSingleOrder(nextPath, healVal);
      if (assigned !== null) nextOrder = assigned;
    }

    // ── Compute midpoint and persist ────────────────────────────────────────
    const newOrder = midpointOrder(prevOrder, nextOrder);
    dbg("[ActionKanban] ReorderCardUseCase: computed newOrder:", newOrder);

    const gapToPrev = prevOrder !== null ? newOrder - prevOrder : Infinity;
    const gapToNext = nextOrder !== null ? nextOrder - newOrder : Infinity;

    if (Math.min(gapToPrev, gapToNext) < GAP_THRESHOLD) {
      dbg("[ActionKanban] ReorderCardUseCase: gap too small, renumbering group");
      await this.actionRepo.renumberGroup(groupSortedPaths);
      if (newPriority !== null && newPriority !== undefined) {
        await this.actionRepo.updatePriority(notePath, Priority.from(newPriority));
      }
      return;
    }

    dbg("[ActionKanban] ReorderCardUseCase: writing order", newOrder, "to", notePath);
    await this.actionRepo.updateOrder(notePath, newOrder, newPriority);
    dbg("[ActionKanban] ReorderCardUseCase: write complete for", notePath);
  }
};

// ─── BootstrapUseCase ─────────────────────────────────────────────────────────
// Called once at startup, deferred to workspace.onLayoutReady() (see
// ActionKanbanPlugin below) — backfills status_changed and order on any
// existing note that's missing them. Not the self-healing repair path used
// during normal board loads (see repairOrders); this is the one-time
// cold-start pass.

var BootstrapUseCase = class {
  constructor(actionRepo) { this.actionRepo = actionRepo; }
  async execute(actions) {
    dbg("[AK-BOOTSTRAP-UC] execute called with", actions.length, "actions");
    const today = IsoDate.today();
    await this.actionRepo.bootstrapStatusChanged(actions, today);
    await this.actionRepo.bootstrapOrder(actions);
  }
};

// ─── CreateActionUseCase ──────────────────────────────────────────────────────
// Two paths depending on whether the user was prompted for a title: a named
// note opens in a new tab (openNoteInNewTab, resolves by note name); an
// auto-named "Untitled" note opens at its known path (openNoteAtPath) since
// there's no unique note-name to resolve by until it's created.

var CreateActionUseCase = class {
  constructor(actionRepo, vaultService) {
    this.actionRepo   = actionRepo;
    this.vaultService = vaultService;
  }
  async execute(input) {
    if (input.name) {
      const filePath = await this.actionRepo.createNote(input.name);
      await this.actionRepo.writeDefaultFrontmatter(filePath, input.globalMaxOrder);
      await this.vaultService.openNoteInNewTab(input.name);
      return filePath;
    }
    const filePath = await this.actionRepo.createAutoNamedNote();
    await this.actionRepo.writeDefaultFrontmatter(filePath, input.globalMaxOrder);
    await this.vaultService.openNoteAtPath(filePath);
    return filePath;
  }
};

// ─── BoardController ──────────────────────────────────────────────────────────
// Thin façade the UI layer (KanbanBoardRenderer, KanbanView, embeds) talks
// to instead of calling use-cases directly — keeps settings-reading and
// use-case wiring in one place rather than scattered through rendering code.

var BoardController = class {
  constructor(getSettings, loadBoardUC, moveCardUC, reorderCardUC, createActionExecutor, vaultService) {
    this.getSettings          = getSettings;
    this.loadBoardUC          = loadBoardUC;
    this.moveCardUC           = moveCardUC;
    this.reorderCardUC        = reorderCardUC;
    this.createActionExecutor = createActionExecutor;
    this.vaultService         = vaultService;
  }

  async loadBoard(priorityFilter) {
    dbg("[AK-CTRL] loadBoard called, filter:", priorityFilter);
    const s = this.getSettings();
    return this.loadBoardUC.execute({
      statuses:        s.statuses,
      columns:         s.columns,
      doneCutoffDays:  s.doneCutoffDays,
      priorityGrouping: s.priorityGrouping,
      priorityFilter
    });
  }

  async moveCard(notePath, fromStatusId, toStatusId) {
    await this.moveCardUC.execute({ notePath, fromStatusId, toStatusId });
  }

  async reorderCard(notePath, prevOrder, nextOrder, newPriority, groupSortedPaths, prevPath, nextPath, globalMaxForHeal) {
    await this.reorderCardUC.execute({
      notePath, prevOrder, nextOrder, newPriority, groupSortedPaths,
      prevPath, nextPath, globalMaxForHeal
    });
  }

  async openNote(noteName) {
    await this.vaultService.openNoteInNewTab(noteName);
  }

  async createNewAction(name, globalMaxOrder) {
    await this.createActionExecutor.execute({ name, globalMaxOrder });
  }
};

// ─── ChevronSvg ───────────────────────────────────────────────────────────────
// Priority is shown as chevrons, not text: two upward chevrons = High, one
// upward = Medium, one downward (rotated 180°) = Low. Built with Obsidian's
// createSvg() DOM helper rather than raw document.createElementNS so the
// same .addClass()/.createSvg() chaining used elsewhere in the file works
// on these elements too.

var CHEVRON_COLORS = { high: "#EF4444", medium: "#F97316", low: "#60A5FA" };

function makeSingleChevronSvg(color, rotate) {
  const svg = createSvg("svg", {
    attr: { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none" },
    cls: rotate ? ["ak-chevron-icon", "ak-chevron-icon--rotated"] : "ak-chevron-icon"
  });
  const strokeAttrs = { stroke: color, "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" };
  svg.createSvg("polyline", { attr: { ...strokeAttrs, points: "2,9 7,4 12,9" } });
  svg.createSvg("polyline", { attr: { ...strokeAttrs, points: "2,13 7,8 12,13" } });
  return svg;
}

function appendChevron(container, priority) {
  const color = CHEVRON_COLORS[priority];
  if (priority === "high") {
    container.appendChild(makeSingleChevronSvg(color, false));
    container.appendChild(makeSingleChevronSvg(color, false));
  } else if (priority === "medium") {
    container.appendChild(makeSingleChevronSvg(color, false));
  } else {
    container.appendChild(makeSingleChevronSvg(color, true));
  }
}

// ─── DotAge ───────────────────────────────────────────────────────────────────
// Tracks one "day" per day since status_changed, capped at DOT_MAX so a
// card's ring-fill progress never exceeds 100%. tierForIndex()/tiers are
// retained but no longer drive rendering directly — see DotRow below,
// where the ring's color comes from interpolateRingColor() rather than a
// per-day tier lookup; count (via DOT_MAX) still gates how many of the
// ring's segments are lit.

var DOT_MAX        = 28;
var DOT_WHITE_HOLD = 5;
var DotAge = class _DotAge {
  constructor(count, tiers) { this.count = count; this.tiers = tiers; }
  static fromDays(days) {
    const count = Math.min(Math.floor(days), DOT_MAX);
    const tiers = [];
    for (let i = 0; i < count; i++) tiers.push(_DotAge.tierForIndex(i));
    return new _DotAge(count, tiers);
  }
  static tierForIndex(i) {
    if (i < DOT_WHITE_HOLD) return 0;
    if (i < 14) return 1;
    if (i < 21) return 2;
    return 3;
  }
};

// ─── DotRow ───────────────────────────────────────────────────────────────────
// Rendered as a segmented ring: N_DOT_SEGMENTS (12) fixed, gapped arc
// segments, each with its own individually fixed color — not a live
// gradient. This replaced an earlier CSS-mask-based continuous gradient,
// which had two problems: visible edge aliasing (CSS mask edges render
// coarser than SVG's native anti-aliasing at this size) and a botched
// -90deg rotation carried over from old SVG code without re-deriving it
// for conic-gradient's different default. Back to SVG stroke-dasharray/
// dashoffset arcs (same technique the very first ring version used)
// solves the aliasing; per-segment colors solve the "looks unfinished"
// complaint by design rather than by tuning a live gradient's edges.
//
// Colors are computed by interpolateRingColor() from a small FIXED key-
// color palette (RING_COLOR_STOPS, 4 entries) based on each segment's
// relative position (index / N_DOT_SEGMENTS) — not hardcoded per segment
// index — so the design stays correct even if DOT_MAX or N_DOT_SEGMENTS
// changes later; nothing here assumes a specific segment count.

var N_DOT_SEGMENTS   = 14;
var DOT_RING_R        = 18;
var DOT_RING_C        = 2 * Math.PI * DOT_RING_R;
var DOT_SEGMENT_GAP_DEG = 4; // visual gap between adjacent segments

// Fixed warm-progression key colors (as [r,g,b] 0-255), same hues the
// original 4-tier palette used (#FFD580/#FF8C00/#E24B4A were tiers
// 1/2/3) — interpolateRingColor() blends between these based on a
// segment's relative position (t, 0 to 1), producing as many distinct
// in-between colors as N_DOT_SEGMENTS needs without hardcoding a color
// per segment.
var RING_COLOR_STOPS = [
  [255, 255, 255], // white
  [255, 213, 128], // #FFD580 light orange
  [255, 140, 0],   // #FF8C00 orange
  [226, 75, 74]    // #E24B4A red
];

function interpolateRingColor(t) {
  const stops = RING_COLOR_STOPS;
  const n = stops.length - 1;
  const scaled = Math.min(Math.max(t, 0), 1) * n;
  const idx = Math.min(Math.floor(scaled), n - 1);
  const localT = scaled - idx;
  const a = stops[idx], b = stops[idx + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bch = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgb(${r}, ${g}, ${bch})`;
}

function renderDotRow(container, statusChanged) {
  const wrap = container.createDiv({ cls: "ak-dot-ring-wrap" });
  if (!statusChanged) return;
  const today  = IsoDate.today();
  const days   = Math.max(0, statusChanged.daysUntil(today));
  const dotAge = DotAge.fromDays(days);

  const litSegments = Math.min(
    Math.round((dotAge.count / DOT_MAX) * N_DOT_SEGMENTS),
    N_DOT_SEGMENTS
  );

  const svg = createSvg("svg", {
    cls: "ak-dot-ring",
    attr: { width: "40", height: "40", viewBox: "0 0 46 46" }
  });

  const segmentSweepDeg = 360 / N_DOT_SEGMENTS;
  const drawDeg         = segmentSweepDeg - DOT_SEGMENT_GAP_DEG;
  const drawArcLen       = (drawDeg / 360) * DOT_RING_C;
  const trackColor       = "var(--background-modifier-border)";

  for (let i = 0; i < N_DOT_SEGMENTS; i++) {
    const isLit = i < litSegments;
    // Each segment's color is fixed to its position among ALL
    // N_DOT_SEGMENTS (segment 0 is always white, the last segment is
    // always red) — not relative to however many are currently lit.
    // This matters: if the ramp instead stretched across only the LIT
    // segments, a lightly-aged card with just 2-3 lit segments would
    // show red prematurely (compressed into a short run), which would
    // defeat the point of the ramp signaling worsening urgency over time.
    const t     = N_DOT_SEGMENTS > 1 ? i / (N_DOT_SEGMENTS - 1) : 0;
    const color = isLit ? interpolateRingColor(t) : trackColor;
    const rotateDeg = -90 + i * segmentSweepDeg;
    svg.createSvg("circle", {
      cls: isLit ? "ak-dot-ring-seg" : "ak-dot-ring-track-seg",
      attr: {
        cx: "23", cy: "23", r: String(DOT_RING_R), fill: "none",
        stroke: color, "stroke-width": "5", "stroke-linecap": "butt",
        "stroke-dasharray": `${drawArcLen} ${DOT_RING_C - drawArcLen}`,
        transform: `rotate(${rotateDeg} 23 23)`
      }
    });
  }

  const countText = svg.createSvg("text", {
    cls: "ak-dot-ring-count",
    attr: { x: "23", y: "27", "text-anchor": "middle" }
  });
  // createSvg's SvgElementInfo type has no "text" option (unlike
  // createDiv/createSpan's DomElementInfo, which does) — passing text:
  // there is silently ignored, leaving the element empty. textContent
  // must be set directly on the returned element instead.
  countText.textContent = String(Math.floor(days));

  wrap.appendChild(svg);
  wrap.createSpan({ cls: "ak-dot-ring-label", text: "in status" });
}

// ─── DueDateBar ───────────────────────────────────────────────────────────────
// Countdown rail: a static track with a marker dot that sweeps from left
// (far from due) to right (due date), parking at the far right once overdue
// rather than growing a fill bar. Same fillPct/fillColor/label/isOverdue
// computation as the previous fill-bar version — only how those values are
// consumed (marker position instead of fill width) has changed. The label
// is now a colored chip (dot + text) inline with the rail, not a plain
// mono text node below/beside it.
// Rendered only if a due date exists — no rail at all otherwise.

function renderDueDateBar(container, dueDate, warningDays) {
  if (!dueDate) return;
  const today         = IsoDate.today();
  const todayMs       = today.toDate().getTime();
  const dueDateMs     = dueDate.toDate().getTime();
  const daysRemaining = Math.round((dueDateMs - todayMs) / 864e5);
  const isOverdue     = daysRemaining < 0;

  let fillPct;
  if (isOverdue)                     fillPct = 100;
  else if (daysRemaining >= warningDays) fillPct = 0;
  else fillPct = Math.round((warningDays - daysRemaining) / warningDays * 100);

  let fillColor;
  if (isOverdue)                fillColor = "#EF4444";
  else if (daysRemaining === 0) fillColor = "#F97316";
  else if (daysRemaining <= 3)  fillColor = "#F59E0B";
  else                           fillColor = "var(--color-green, #22C55E)";

  let label;
  if (isOverdue)                label = `Overdue ${Math.abs(daysRemaining)}d`;
  else if (daysRemaining === 0) label = "Due today";
  else                           label = `Due in ${daysRemaining}d`;

  const row      = container.createDiv({ cls: "ak-due-row" });
  const railWrap = row.createDiv({ cls: "ak-due-rail-wrap" });
  const marker   = railWrap.createDiv({ cls: "ak-due-marker" });
  marker.style.left            = `${fillPct}%`;
  marker.style.backgroundColor = fillColor;
  if (isOverdue) marker.addClass("ak-due-marker-overdue");

  const chip = row.createDiv({ cls: "ak-due-chip" });
  chip.style.setProperty("--ak-due-chip-color", fillColor);
  chip.createDiv({ cls: "ak-due-chip-dot" }).style.backgroundColor = fillColor;
  chip.createSpan({ cls: "ak-due-chip-label", text: label });
  if (isOverdue) chip.addClass("ak-due-chip-overdue");
}

// ─── CardRenderer ─────────────────────────────────────────────────────────────
// Builds one card's DOM. The chevron doubles as a button (role="button",
// keyboard-activatable) that opens the priority picker — it's the only
// part of the card that doesn't trigger the "open note" click handler,
// via stopPropagation() in its own listeners below.

function renderCard(container, action, columnId, borderColor, pillFields, callbacks, dueDateWarningDays) {
  const card = container.createDiv({ cls: "ak-card" });
  card.style.borderLeftColor = borderColor;
  card.draggable = true;

  const titleRow = card.createDiv({ cls: "ak-card-title-row" });
  const chevronWrap = titleRow.createDiv({ cls: "ak-chevron-wrap" });
  appendChevron(chevronWrap, action.priority.value);
  chevronWrap.setAttribute("role", "button");
  chevronWrap.setAttribute("tabindex", "0");
  chevronWrap.setAttribute("aria-label", `Change priority (currently ${action.priority.value})`);
  chevronWrap.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onPriorityClick(action);
  });
  chevronWrap.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onPriorityClick(action);
    }
  });
  titleRow.createDiv({ cls: "ak-card-title" }).textContent = action.name;
  renderDotRow(titleRow, action.statusChanged);

  if (pillFields.length > 0) {
    const parts = [];
    for (const field of pillFields) {
      const val = action.frontmatter[field.frontmatterKey];
      if (val !== null && val !== undefined && val !== "")
        parts.push({ label: field.label, value: val });
    }
    if (parts.length > 0) {
      const metaRow = card.createDiv({ cls: "ak-card-meta-row" });
      for (const p of parts) {
        metaRow.createSpan({ cls: "ak-card-meta-chip", text: `${p.label}: ${p.value}` });
      }
    }
  }

  renderDueDateBar(card, action.dueDate, dueDateWarningDays);

  card.addEventListener("click",    e => { e.preventDefault(); callbacks.onClick(action); });
  card.addEventListener("dragstart",e => { card.addClass("ak-card-dragging"); callbacks.onDragStart(e, action, columnId); });
  card.addEventListener("dragend",  e => { card.removeClass("ak-card-dragging"); callbacks.onDragEnd(e); });
  card.addEventListener("dragover", e => { e.preventDefault(); callbacks.onDragOver(e, action); });
  card.addEventListener("drop",     e => { e.preventDefault(); callbacks.onDrop(e, action); });
  return card;
}

// ─── DragDropHandler ──────────────────────────────────────────────────────────
// One instance is shared across all columns/cards in a single board render
// (see KanbanBoardRenderer below). Drag-and-drop covers exactly two things:
// (a) moving a card to a different column (status change) and (b) reordering
// within the same priority group. Changing PRIORITY is deliberately not
// possible via drag — see the targetPriority checks below — that's the
// picker modal's job instead, so the two gestures never conflict.
//
// Lifecycle: startDrag() → zero or more handleCardDragOver() calls (visual
// insertion-line feedback only, no writes) → exactly one of
// handleColumnDrop()/handleCardDrop() (the actual write) → endDrag() fires
// on the browser's own dragend regardless of whether a drop happened.

var DragDropHandler = class {
  constructor() {
    this.dragState         = null;  // set by startDrag(), cleared on drop/end
    this.insertionLine     = null;  // the visual "drop here" line element
    this.hoverCard         = null;  // last card the insertion line was drawn against
    this.hoverInsertBefore = null;  // whether it's drawn above or below hoverCard
    this.dropping          = false; // true only while a drop's write is in flight,
                                     // guards against a second drop firing mid-write
  }

  startDrag(event, action, columnId) {
    dbg("[ActionKanban] startDrag:", action.name, "status:", action.status, "order:", action.order, "dropping was:", this.dropping);
    // Safety: always reset dropping on a new drag, in case a previous drag left
    // it stuck (e.g. due to an unhandled exception in a prior drop handler).
    this.dropping = false;
    this.dragState = {
      noteName:       action.name,
      notePath:       action.path,
      sourceColumnId: columnId,
      sourceStatusId: action.status,
      sourcePriority: action.priority.value,
      sourceOrder:    action.order
    };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", action.name);
    }
  }

  endDrag() {
    dbg("[ActionKanban] endDrag — dropping was:", this.dropping);
    this.dragState = null;
    this.dropping  = false;
    this.clearInsertionLine();
  }

  // Purely visual — draws/moves the insertion-line indicator as the dragged
  // card passes over another card. No writes happen here; the actual move
  // is decided later in handleCardDrop(). Suppresses the line entirely
  // wherever a drop wouldn't be allowed (cross-column, cross-priority-group)
  // so the user isn't shown a false promise.
  handleCardDragOver(event, cardEl, columnStatusIds, targetPriority) {
    if (!this.dragState) return;
    event.preventDefault();
    event.stopPropagation();

    // For cross-column, suppress insertion line
    if (!columnStatusIds.includes(this.dragState.sourceStatusId)) {
      if (this.insertionLine) {
        this.insertionLine.remove();
        this.insertionLine     = null;
        this.hoverCard         = null;
        this.hoverInsertBefore = null;
      }
      return;
    }

    // For cross-priority-group, suppress insertion line — priority changes are
    // handled exclusively via the priority picker, not drag-and-drop.
    // targetPriority is null when priority grouping is off (flat mode) — in
    // that case there is no group boundary to enforce, so never block.
    if (targetPriority !== null && this.dragState.sourcePriority !== targetPriority) {
      if (this.insertionLine) {
        this.insertionLine.remove();
        this.insertionLine     = null;
        this.hoverCard         = null;
        this.hoverInsertBefore = null;
      }
      return;
    }

    const rect        = cardEl.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    if (this.hoverCard === cardEl && this.hoverInsertBefore === insertBefore) return;

    this.hoverCard         = cardEl;
    this.hoverInsertBefore = insertBefore;
    this.insertionLine?.remove();
    this.insertionLine = null;

    const line = document.createElement("div");
    line.className = "ak-insertion-line";
    if (insertBefore) cardEl.parentElement?.insertBefore(line, cardEl);
    else              cardEl.parentElement?.insertBefore(line, cardEl.nextSibling);
    this.insertionLine = line;
  }

  hasDragState() { return this.dragState !== null; }

  clearInsertionLine() {
    this.insertionLine?.remove();
    this.insertionLine     = null;
    this.hoverCard         = null;
    this.hoverInsertBefore = null;
  }

  // Drop onto a column's empty space (not onto a specific card) — always a
  // status change, resolved to whichever status the target column maps to
  // (see the onMoveCard callback in KanbanBoardRenderer for the
  // multi-status-column picker prompt).
  async handleColumnDrop(columnStatusIds, callbacks) {
    if (!this.dragState || this.dropping) {
      dbg("[ActionKanban] handleColumnDrop: skipped — dragState:", !!this.dragState, "dropping:", this.dropping);
      return;
    }
    const { notePath, sourceStatusId } = this.dragState;
    this.clearInsertionLine();
    this.dragState = null;
    if (columnStatusIds.includes(sourceStatusId)) {
      dbg("[ActionKanban] handleColumnDrop: same-column, ignoring");
      return;
    }
    this.dropping = true;
    try {
      dbg("[ActionKanban] handleColumnDrop: moving", notePath, "->", columnStatusIds);
      await callbacks.onMoveCard(notePath, sourceStatusId, columnStatusIds);
    } catch (err) {
      console.error("[ActionKanban] handleColumnDrop: error during drop operation:", err);
      new import_obsidian.Notice("Action Kanban: failed to move card — " + err.message);
    } finally {
      this.dropping = false;
      dbg("[ActionKanban] handleColumnDrop: done, dropping reset");
    }
  }

  /**
   * Handle drop onto a specific card.
   *
   * groupCards: the cards of the TARGET priority group, sorted by order
   * (as rendered — from BoardProjection output).
   *
   * For same-column reorders, computes prevOrder/nextOrder from neighbors
   * at the insertion point and delegates to onReorderCard.
   * For cross-column drops, delegates to onMoveCard (order untouched).
   */
  async handleCardDrop(event, targetAction, targetCardEl, columnStatusIds, groupCards, targetPriority, callbacks) {
    if (!this.dragState || this.dropping) {
      dbg("[ActionKanban] handleCardDrop: skipped — dragState:", !!this.dragState, "dropping:", this.dropping);
      return;
    }
    const drag = this.dragState;
    this.clearInsertionLine();
    this.dragState = null;
    // Reset dropping BEFORE the async work so that a re-render triggered by
    // metadataCache mid-await does not leave the new DOM's cards permanently
    // locked out (dropping=true on the shared handler instance).
    this.dropping = false;
    event.stopPropagation();
    dbg("[ActionKanban] handleCardDrop: drop on", targetAction.name, "sourceStatus:", drag.sourceStatusId);
    try {
      if (!columnStatusIds.includes(drag.sourceStatusId)) {
        // Cross-column: resolve which status to assign then move
        dbg("[ActionKanban] handleCardDrop: cross-column move");
        await callbacks.onMoveCard(drag.notePath, drag.sourceStatusId, columnStatusIds);
        return;
      }

      // Priority changes are handled exclusively via the priority picker
      // (chevron click). Cross-priority-group card-to-card drops are rejected.
      // targetPriority is null when priority grouping is off (flat mode) — in
      // that case there is no group boundary to enforce, so never block.
      if (targetPriority !== null && drag.sourcePriority !== targetPriority) {
        dbg("[ActionKanban] handleCardDrop: cross-priority-group drop rejected — use priority picker");
        return;
      }

      // Remove dragged card from the group list to find its neighbors
      const withoutDragged = groupCards.filter(a => a.name !== drag.noteName);

      const rect         = targetCardEl.getBoundingClientRect();
      const insertBefore = event.clientY < rect.top + rect.height / 2;
      const targetIdx    = withoutDragged.findIndex(a => a.name === targetAction.name);

      // Insertion position in the without-dragged list
      const insertIdx = insertBefore ? targetIdx : targetIdx + 1;

      const prevCard  = withoutDragged[insertIdx - 1] ?? null;
      const nextCard  = withoutDragged[insertIdx]     ?? null;
      const prevOrder = prevCard ? prevCard.order : null;
      const nextOrder = nextCard ? nextCard.order : null;
      // Paths needed by ReorderCardUseCase to eagerly heal null-order neighbors
      const prevPath  = prevCard ? prevCard.path : null;
      const nextPath  = nextCard ? nextCard.path : null;
      // Global max order for heal value baseline (max across all rendered cards)
      let globalMaxForHeal = 0;
      for (const c of groupCards) {
        if (c.order !== null && c.order > globalMaxForHeal) globalMaxForHeal = c.order;
      }

      // Full new order for this group (for renumber pass if needed)
      const newGroupList = [...withoutDragged];
      newGroupList.splice(insertIdx, 0, drag);   // drag has .notePath
      const groupSortedPaths = newGroupList.map(a => a.path ?? a.notePath);

      dbg("[ActionKanban] handleCardDrop: reorder", drag.notePath, "prevOrder:", prevOrder, "nextOrder:", nextOrder);
      await callbacks.onReorderCard(
        drag.notePath,
        prevOrder,
        nextOrder,
        null,
        groupSortedPaths,
        prevPath,
        nextPath,
        globalMaxForHeal
      );
      dbg("[ActionKanban] handleCardDrop: reorder complete");
    } catch (err) {
      console.error("[ActionKanban] handleCardDrop: error during drop operation:", err);
      new import_obsidian.Notice("Action Kanban: failed to move/reorder card — " + err.message);
    }
  }
};

// ─── NewActionModal ───────────────────────────────────────────────────────────
// Simple title-prompt modal for "New Action" when "Skip name prompt" is off.
// Unlike StatusPickerModal/PriorityPickerModal below, onSubmit is only ever
// called on an actual submit (Create button or Enter) — closing without a
// title (Cancel/Escape) just closes with no callback, since an empty title
// isn't a valid choice to resolve with.

var import_obsidian3 = require("obsidian");
var NewActionModal = class extends import_obsidian3.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ak-new-action-modal");
    contentEl.createEl("p", { cls: "ak-modal-eyebrow", text: "New action" });
    contentEl.createEl("h2", { text: "New action note" });
    this.inputEl = contentEl.createEl("input", {
      type: "text",
      placeholder: "Note title",
      cls: "ak-new-action-input"
    });
    this.inputEl.focus();
    const btnRow    = contentEl.createDiv({ cls: "ak-new-action-btn-row" });
    const createBtn = btnRow.createEl("button", { text: "Create", cls: "mod-cta ak-new-action-create" });
    createBtn.addEventListener("click", () => this.submit());
    const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "ak-new-action-cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    this.inputEl.addEventListener("keydown", e => {
      if (e.key === "Enter")  this.submit();
      if (e.key === "Escape") this.close();
    });
  }
  submit() {
    const name = this.inputEl.value.trim();
    if (!name) return;
    this.close();
    this.onSubmit(name);
  }
  onClose() { this.contentEl.empty(); }
};

// ─── StatusPickerModal ────────────────────────────────────────────────────────
// Shown when a card is dropped into a column that maps more than one status.
// Lets the user choose which status to assign.

var StatusPickerModal = class extends import_obsidian3.Modal {
  constructor(app, statusOptions, onSubmit) {
    super(app);
    this.statusOptions = statusOptions; // [{ id, label }]
    this.onSubmit = onSubmit;
    this._resolved = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ak-new-action-modal");
    contentEl.createEl("p", { cls: "ak-modal-eyebrow", text: "Status" });
    contentEl.createEl("h2", { text: "Move to which status?" });
    const btnRow = contentEl.createDiv({ cls: "ak-status-picker-btn-row" });
    for (const opt of this.statusOptions) {
      const btn = btnRow.createEl("button", { text: opt.label, cls: "mod-cta ak-new-action-create" });
      btn.addEventListener("click", () => {
        this._resolved = true;
        this.close();
        this.onSubmit(opt.id);
      });
    }
    const cancelRow = contentEl.createDiv({ cls: "ak-status-picker-cancel-row" });
    const cancelBtn = cancelRow.createEl("button", { text: "Cancel", cls: "ak-new-action-cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
    // If closed without picking (Escape / cancel), resolve with null
    if (!this._resolved) this.onSubmit(null);
  }
};

// ─── PriorityPickerModal ──────────────────────────────────────────────────────
// Shown when the user clicks a card's priority chevron. Lets the user pick a
// new priority directly. This is the sole mechanism for changing priority —
// drag-and-drop is reserved for status changes and same-priority reordering.

var PriorityPickerModal = class extends import_obsidian3.Modal {
  constructor(app, currentPriority, options, onSubmit) {
    super(app);
    this.currentPriority = currentPriority; // PriorityLevel
    this.options = options;                 // [{ id, label }]
    this.onSubmit = onSubmit;
    this._resolved = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ak-new-action-modal");
    contentEl.createEl("p", { cls: "ak-modal-eyebrow", text: "Priority" });
    contentEl.createEl("h2", { text: "Set priority" });
    const btnRow = contentEl.createDiv({ cls: "ak-priority-picker-btn-row" });
    for (const opt of this.options) {
      const btn = btnRow.createEl("button", { cls: "ak-priority-picker-option" });
      if (opt.id === this.currentPriority) btn.addClass("ak-priority-picker-option--current");
      appendChevron(btn.createSpan({ cls: "ak-btn-chevron" }), opt.id);
      btn.createSpan({ text: opt.label });
      btn.addEventListener("click", () => {
        this._resolved = true;
        this.close();
        this.onSubmit(opt.id);
      });
    }
    const cancelRow = contentEl.createDiv({ cls: "ak-priority-picker-cancel-row" });
    const cancelBtn = cancelRow.createEl("button", { text: "Cancel", cls: "ak-new-action-cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
    if (!this._resolved) this.onSubmit(null);
  }
};

// ─── KanbanBoardRenderer ───────────────────────────────────────────────────────
// The shared rendering engine behind both the standalone board view
// (KanbanView below) and every embedded board (the ```action-kanban code
// block). One instance per board on screen — a note embedding two boards
// gets two independent instances, each with its own DragDropHandler and
// filter state.

var KanbanBoardRenderer = class {
  constructor(app, controller, getSettings, onRefresh, persistSettings) {
    this.app             = app;
    this.controller      = controller;
    this.getSettings     = getSettings;
    this.onRefresh       = onRefresh;
    this.persistSettings = persistSettings;
    this.activeFilters   = new Set();
    this.dndHandler      = new DragDropHandler();
    this.rendering       = false;
    this.pendingRender   = false;
    // Embedded-board title bar (see renderTitleBar()) — isCollapsed is
    // session-local only, not persisted to disk, so it always starts
    // expanded again the next time the note is opened. boardTitle is set
    // once from render()'s titleText param and doesn't change afterward.
    this.boardTitle  = "Action Kanban";
    this.isCollapsed = false;
  }

  async render(container, initialFilter, isEmbedded, titleText) {
    if (initialFilter) this.activeFilters = new Set([initialFilter]);
    if (titleText) this.boardTitle = titleText;
    if (!container.hasClass("ak-board-root")) {
      container.addClass("ak-board-root");
      // Catch-all: stop any click inside the board (empty space, columns,
      // etc., not just individual controls) from bubbling up into Obsidian's
      // Live Preview editor, which otherwise treats it as a click "inside"
      // the embedded code-block widget and reverts it to raw/selected
      // source. Attached once per container (guarded by the class check
      // above) since container.empty() on refresh clears children, not
      // listeners on the container itself.
      container.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
      });
    }
    this.isEmbedded = !!isEmbedded;
    await this.renderBoard(container);
  }

  // Re-entrancy guard: if a refresh is triggered again while one is already
  // in flight (e.g. a metadataCache "changed" event fires mid-render), it's
  // queued as pendingRender rather than starting a second concurrent
  // container.empty()/rebuild, then run once the first finishes.
  async renderBoard(container) {
    if (this.rendering) {
      dbg("[ActionKanban] renderBoard: already rendering, queuing pendingRender");
      this.pendingRender = true;
      return;
    }
    this.rendering     = true;
    this.pendingRender = false;
    dbg("[ActionKanban] renderBoard: start");
    try {
      container.empty();
      if (this.isEmbedded) this.renderTitleBar(container);
      if (this.isCollapsed) return;
      let board;
      try {
        board = await this.controller.loadBoard(Array.from(this.activeFilters));
      } catch (err) {
        container.createDiv({ cls: "ak-error", text: `Failed to load board: ${String(err)}` });
        return;
      }
      const settings = this.getSettings();
      const refresh  = () => this.renderBoard(container);
      this.renderToolbar(container, refresh, settings);
      const columnsEl = container.createDiv({ cls: "ak-columns" });
      if (settings.tiltCollapsedColumns) columnsEl.addClass("ak-columns--tilt");
      for (const column of board.columns) {
        this.renderColumn(columnsEl, column, settings.pillFields, settings.dueDateWarningDays, settings.priorityGrouping, refresh);
      }
    } finally {
      this.rendering = false;
      if (this.pendingRender) {
        this.pendingRender = false;
        await this.renderBoard(container);
      }
    }
  }

  // Embedded-only title bar, shown above the toolbar. Clicking it toggles
  // isCollapsed and re-renders — collapsed hides the toolbar and columns
  // entirely (see the early return in renderBoard() above), leaving just
  // this bar visible. Collapse state is session-local only (see the
  // constructor comment); it isn't written to settings/disk.
  renderTitleBar(container) {
    const bar = container.createDiv({ cls: "ak-title-bar" });
    bar.createSpan({ cls: "ak-title-bar-chevron" }).textContent = this.isCollapsed ? "▸" : "▾";
    bar.createSpan({ cls: "ak-title-bar-label", text: this.boardTitle });
    bar.setAttribute("role", "button");
    bar.setAttribute("tabindex", "0");
    bar.setAttribute("aria-label", this.isCollapsed ? "Expand board" : "Collapse board");
    const toggle = () => {
      this.isCollapsed = !this.isCollapsed;
      this.renderBoard(container);
    };
    bar.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    bar.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    });
  }

  renderToolbar(container, refresh, settings) {
    const toolbar     = container.createDiv({ cls: "ak-toolbar" });
    const filterGroup = toolbar.createDiv({ cls: "ak-filter-group" });

    const allBtn = filterGroup.createEl("button", { cls: "ak-filter-btn" });
    allBtn.textContent = "All";
    if (this.activeFilters.size === 0) allBtn.addClass("ak-filter-btn--active");
    allBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      this.activeFilters.clear();
      refresh();
    });

    for (const def of [
      { priority: "high",   label: "High"   },
      { priority: "medium", label: "Medium" },
      { priority: "low",    label: "Low"    }
    ]) {
      const btn = filterGroup.createEl("button", { cls: "ak-filter-btn" });
      appendChevron(btn.createSpan({ cls: "ak-btn-chevron" }), def.priority);
      btn.createSpan({ text: def.label });
      if (this.activeFilters.has(def.priority)) btn.addClass("ak-filter-btn--active");
      btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        if (this.activeFilters.has(def.priority)) this.activeFilters.delete(def.priority);
        else this.activeFilters.add(def.priority);
        refresh();
      });
    }

    const rightGroup = toolbar.createDiv({ cls: "ak-toolbar-right" });
    const newBtn = rightGroup.createEl("button", { cls: "ak-new-action-btn" });
    const newBtnIcon = newBtn.createSvg("svg", {
      cls: "ak-new-action-icon",
      attr: {
        width: "18", height: "18", viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", "stroke-width": "2.5",
        "stroke-linecap": "round", "stroke-linejoin": "round"
      }
    });
    newBtnIcon.createSvg("line", { attr: { x1: "12", y1: "5", x2: "12", y2: "19" } });
    newBtnIcon.createSvg("line", { attr: { x1: "5",  y1: "12", x2: "19", y2: "12" } });
    newBtn.createSpan({ text: "New action" });
    newBtn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      // Load board to find current global max order
      let maxOrder = 0;
      try {
        const b = await this.controller.loadBoard([]);
        for (const col of b.columns)
          for (const grp of col.priorityGroups)
            for (const card of grp.cards)
              if (card.order !== null && card.order > maxOrder) maxOrder = card.order;
      } catch {
        // Intentionally swallowed: a failed lookup just means "start numbering
        // from 0," which is safe — not worth surfacing to the user.
      }
      if (settings.skipNewActionNamePrompt) {
        try {
          await this.controller.createNewAction(null, maxOrder);
          refresh();
        } catch (err) {
          console.error("[ActionKanban] New Action (auto-named): failed to create note:", err);
          new import_obsidian.Notice("Action Kanban: failed to create note — " + err.message);
        }
        return;
      }
      new NewActionModal(this.app, async name => {
        try {
          await this.controller.createNewAction(name, maxOrder);
          refresh();
        } catch (err) {
          console.error("[ActionKanban] New Action: failed to create note:", err);
          new import_obsidian.Notice("Action Kanban: failed to create note — " + err.message);
        }
      }).open();
    });

    // Refresh icon button
    const refreshBtn = rightGroup.createDiv({ cls: "ak-refresh-btn clickable-icon" });
    refreshBtn.setAttribute("aria-label", "Refresh Kanban board");
    const svg = refreshBtn.createSvg("svg", {
      attr: {
        width: "20", height: "20", viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", "stroke-width": "2",
        "stroke-linecap": "round", "stroke-linejoin": "round"
      }
    });
    svg.createSvg("polyline", { attr: { points: "23 4 23 10 17 10" } });
    svg.createSvg("path", { attr: { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" } });
    refreshBtn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (this.onRefresh) this.onRefresh(); else refresh(); });
  }

  renderColumn(container, column, pillFields, dueDateWarningDays, priorityGrouping, refresh) {
    const colEl = container.createDiv({ cls: "ak-column" });
    colEl.dataset.columnId = column.id;
    colEl.dataset.statusId = column.statusIds[0];

    // Header-only collapse: clicking the header hides the card list below
    // it and toggles a flag persisted to settings.collapsedColumns (by
    // column id), shared across the standalone view and all embeds.
    // If settings.tiltCollapsedColumns is on, renderBoard() adds the
    // "ak-columns--tilt" class to the row, and styles.css renders a
    // collapsed column as a narrow vertical strip instead — see the
    // ".ak-columns--tilt" rules in styles.css.
    const collapsedColumns = this.getSettings().collapsedColumns || [];
    if (collapsedColumns.includes(column.id)) colEl.addClass("ak-column--collapsed");

    const header = colEl.createDiv({ cls: "ak-column-header" });
    header.style.setProperty("--col-color", column.color);
    header.createDiv({ cls: "ak-column-collapse-icon" });
    header.createDiv({ cls: "ak-column-label" }).textContent = column.label;
    const total = column.priorityGroups.reduce((n, g) => n + g.cards.length, 0);
    header.createDiv({ cls: "ak-column-badge" }).textContent = String(total);
    header.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const settings = this.getSettings();
      if (!settings.collapsedColumns) settings.collapsedColumns = [];
      const idx = settings.collapsedColumns.indexOf(column.id);
      if (idx === -1) {
        settings.collapsedColumns.push(column.id);
        colEl.addClass("ak-column--collapsed");
      } else {
        settings.collapsedColumns.splice(idx, 1);
        colEl.removeClass("ak-column--collapsed");
      }
      if (this.persistSettings) this.persistSettings();
    });

    const cardList       = colEl.createDiv({ cls: "ak-card-list" });
    const allColumnCards = column.priorityGroups.flatMap(g => g.cards);

    for (const group of column.priorityGroups) {
      this.renderPriorityGroup(
        cardList, group, column, allColumnCards, pillFields, dueDateWarningDays, priorityGrouping, refresh
      );
    }

    if (column.hiddenCount > 0) {
      colEl.createDiv({ cls: "ak-done-footer" }).textContent =
        `${column.hiddenCount} older card${column.hiddenCount === 1 ? "" : "s"} hidden`;
    }

    // Column dragover / drop (cross-column)
    colEl.addEventListener("dragover", e => {
      if (!this.dndHandler.hasDragState()) return;
      e.preventDefault();
      colEl.addClass("ak-column-drop-target");
    });
    colEl.addEventListener("dragleave", e => {
      if (!colEl.contains(e.relatedTarget)) colEl.removeClass("ak-column-drop-target");
    });
    colEl.addEventListener("drop", async e => {
      e.preventDefault();
      colEl.removeClass("ak-column-drop-target");
      this.dndHandler.clearInsertionLine();
      await this.dndHandler.handleColumnDrop(column.statusIds, {
        onMoveCard: async (notePath, fromStatusId, targetStatusIds) => {
          const resolvedId = await this._resolveTargetStatus(targetStatusIds, column);
          if (!resolvedId) return; // user cancelled
          await this.controller.moveCard(notePath, fromStatusId, resolvedId);
          refresh();
        }
      });
    });
  }

  // Renders one priority group's cards (or, in flat mode, the column's
  // whole card list as a single group with group.priority === null — see
  // BoardProjection). Wires up all three per-card interactions: open note,
  // drag-and-drop, and the priority-chevron click.
  renderPriorityGroup(container, group, column, allColumnCards, pillFields, dueDateWarningDays, priorityGrouping, refresh) {
    if (priorityGrouping !== false) {
      const sep = container.createDiv({ cls: "ak-priority-sep" });
      sep.textContent = group.priority.charAt(0).toUpperCase() + group.priority.slice(1);
    } // end if (priorityGrouping !== false)

    // ── Non-empty group: render cards ──────────────────────────────────────
    for (const action of group.cards) {
      renderCard(container, action, column.id, column.color, pillFields, {
        onClick:      async a  => { await this.controller.openNote(a.name); },
        onDragStart:  (e, a)   => { this.dndHandler.startDrag(e, a, column.id); },
        onDragEnd:    ()       => { this.dndHandler.endDrag(); },
        onDragOver:   (e, _a)  => { this.dndHandler.handleCardDragOver(e, e.currentTarget, column.statusIds, group.priority); },
        onPriorityClick: async a => {
          const chosen = await this._resolveTargetPriority(a.priority.value);
          if (!chosen || chosen === a.priority.value) return;

          // allColumnCards may be priority-filtered (toolbar filter active);
          // reload unfiltered so the append position is always computed
          // against the column's full card set, not the filtered view.
          let columnCards = allColumnCards;
          try {
            const fullBoard  = await this.controller.loadBoard([]);
            const fullColumn = fullBoard.columns.find(c => c.id === column.id);
            if (fullColumn) columnCards = fullColumn.priorityGroups.flatMap(g => g.cards);
          } catch {
            // Fall back to the cards already in scope if the reload fails.
          }

          const sameTargetPriority = columnCards.filter(c => c.priority.value === chosen && c.path !== a.path);
          const prevCard  = sameTargetPriority.length > 0 ? sameTargetPriority[sameTargetPriority.length - 1] : null;
          const prevOrder = prevCard ? prevCard.order : null;
          const prevPath  = prevCard ? prevCard.path : null;
          let globalMaxForHeal = 0;
          for (const c of columnCards) {
            if (c.order !== null && c.order > globalMaxForHeal) globalMaxForHeal = c.order;
          }
          try {
            await this.controller.reorderCard(a.path, prevOrder, null, chosen, [a.path], prevPath, null, globalMaxForHeal);
            refresh();
          } catch (err) {
            console.error("[ActionKanban] onPriorityClick: failed to change priority:", err);
            new import_obsidian.Notice("Action Kanban: failed to change priority — " + err.message);
          }
        },
        onDrop: async (e, targetAction) => {
          await this.dndHandler.handleCardDrop(
            e,
            targetAction,
            e.currentTarget,
            column.statusIds,
            group.cards,       // cards of this priority group only
            group.priority,
            {
              onMoveCard: async (notePath, fromStatusId, targetStatusIds) => {
                const resolvedId = await this._resolveTargetStatus(targetStatusIds, column);
                if (!resolvedId) return;
                await this.controller.moveCard(notePath, fromStatusId, resolvedId);
                refresh();
              },
              onReorderCard: async (notePath, prevOrder, nextOrder, newPriority, groupSortedPaths, prevPath, nextPath, globalMaxForHeal) => {
                await this.controller.reorderCard(notePath, prevOrder, nextOrder, newPriority, groupSortedPaths, prevPath, nextPath, globalMaxForHeal);
                refresh();
              }
            }
          );
        }
      }, dueDateWarningDays);
    }
  }

  /**
   * If the target column has exactly one status, return it immediately.
   * If it has more than one, open a StatusPickerModal and return a Promise
   * that resolves to the chosen id, or null if the user cancels.
   * `column` is the KanbanColumn; `settings` is used to look up labels.
   */
  _resolveTargetStatus(statusIds, column) {
    if (statusIds.length === 1) return Promise.resolve(statusIds[0]);
    const settings = this.getSettings();
    const options = statusIds.map(id => {
      const def = settings.statuses.find(s => s.id === id);
      return { id, label: def ? def.label : id };
    });
    return new Promise(resolve => {
      new StatusPickerModal(this.app, options, id => resolve(id)).open();
    });
  }

  /**
   * Opens a PriorityPickerModal and returns a Promise that resolves to the
   * chosen priority id ("high" | "medium" | "low"), or null if the user
   * cancels. This is the sole mechanism for changing priority — drag-and-drop
   * is reserved for status changes and same-priority-group reordering.
   */
  _resolveTargetPriority(currentPriority) {
    const options = [
      { id: "high",   label: "High"   },
      { id: "medium", label: "Medium" },
      { id: "low",    label: "Low"    },
    ];
    return new Promise(resolve => {
      new PriorityPickerModal(this.app, currentPriority, options, id => resolve(id)).open();
    });
  }
};

// ─── KanbanView ───────────────────────────────────────────────────────────────
// The standalone board (a real Obsidian tab/pane, opened via the ribbon icon
// or "Open board" command) — thin wrapper: an ItemView that owns one
// KanbanBoardRenderer and refreshes it whenever any file's metadata
// changes. (Embedded boards, by contrast, only refresh on debounced
// changes scoped to the Actions folder — see ActionKanbanPlugin's embed
// registration below.) registerEvent() ties this listener's lifetime to
// the view, so it's cleaned up automatically when the tab closes.

var import_obsidian4 = require("obsidian");
var VIEW_TYPE_KANBAN = "action-kanban";
var KanbanView = class extends import_obsidian4.ItemView {
  constructor(leaf, controller, getSettings, saveSettings) {
    super(leaf);
    this.renderer = new KanbanBoardRenderer(
      this.app, controller, getSettings, () => this.refresh(), saveSettings
    );
  }
  getViewType()    { return VIEW_TYPE_KANBAN; }
  getDisplayText() { return "Action Kanban"; }
  getIcon()        { return "layout-dashboard"; }
  async onOpen() {
    await this.refresh();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refresh()));
  }
  async refresh() { await this.renderer.render(this.contentEl); }
};

// ─── ActionKanbanSettingTab ───────────────────────────────────────────────────

var import_obsidian6 = require("obsidian");

// ─── FolderSuggest ─────────────────────────────────────────────────────────
// Type-ahead folder-path suggestions for the "Actions folder" settings field.
// AbstractInputSuggest was added to the public Obsidian API in 1.4.10 (this
// plugin's declared minAppVersion is 1.4.0), so its presence is checked
// BEFORE the class is ever defined — `class X extends Y` evaluates Y
// immediately at definition time, so defining this class unconditionally
// would throw "Class extends value undefined" and crash the whole plugin on
// older Obsidian installs. FolderSuggest stays null (feature unavailable,
// plain text field only) if the guard fails.
var FolderSuggest = null;
if (typeof import_obsidian6.AbstractInputSuggest === "function") {
  try {
    FolderSuggest = class extends import_obsidian6.AbstractInputSuggest {
      constructor(app, inputEl, onSelectCb) {
        super(app, inputEl);
        this.onSelectCb = onSelectCb;
        // Scan the vault once per instance (a new FolderSuggest is created
        // each time the settings tab opens) instead of on every keystroke —
        // getAllLoadedFiles() over a large vault is measurably slower than
        // filtering an already-built in-memory array per keystroke.
        this._allFolderPaths = [];
        for (const f of this.app.vault.getAllLoadedFiles()) {
          if (f instanceof import_obsidian6.TFolder) this._allFolderPaths.push(f.path);
        }
        this._allFolderPaths.sort((a, b) => a.localeCompare(b));
      }
      getSuggestions(query) {
        const q = (query || "").toLowerCase();
        return this._allFolderPaths.filter(p => p.toLowerCase().includes(q)).slice(0, 200);
      }
      renderSuggestion(value, el) {
        el.setText(value === "/" ? "/ (vault root)" : value);
      }
      selectSuggestion(value) {
        this.setValue(value);
        this.close();
        this.onSelectCb(value);
      }
    };
  } catch (err) {
    console.warn("[ActionKanban] Folder autocomplete unavailable:", err);
    FolderSuggest = null;
  }
}
// ─── ActionKanbanSettingTab ───────────────────────────────────────────────────
// The Settings → Action Kanban tab. display() rebuilds the whole tab from
// scratch each time it's shown (Obsidian's PluginSettingTab convention) —
// helper methods below (_renderStatusRows etc.) each own one dynamic table
// section and are called fresh on every display() and after any add/remove
// row action, rather than trying to patch the DOM incrementally.

// Picks black or white text against an arbitrary user-chosen #rrggbb
// status color, using the standard WCAG-style relative luminance formula.
// Used only for the checked-state status pills in the Columns table, where
// the pill background is filled solid with the status's own color and a
// hardcoded white would be unreadable against light status colors.
function getReadableTextColor(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
}

var ActionKanbanSettingTab = class extends import_obsidian6.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ak-settings");

    // Tab bar — four topic groups (Structure / Behaviour / Appearance /
    // Debugging), replacing the previous single long flat scroll. No
    // native Obsidian API for tabs inside a PluginSettingTab exists (Setting
    // has no collapsible/tab concept) — this is a hand-built pattern, the
    // same approach other community plugins (e.g. Shell Commands) use: a
    // row of buttons toggling which panel <div> is visible, all built on
    // plain containerEl.createDiv()/createEl() the same way the rest of
    // this file already does. this._activeSettingsTab persists across
    // display() re-renders within the same settings-tab session (e.g.
    // after adding a status triggers a re-render) but always resets to
    // the first tab when Settings is freshly reopened — no separate
    // setting needed to remember it long-term.
    if (!this._activeSettingsTab) this._activeSettingsTab = "structure";
    const TABS = [
      { id: "structure",  label: "Structure"  },
      { id: "behaviour",  label: "Behaviour"  },
      { id: "appearance", label: "Appearance" },
      { id: "debugging",  label: "Debugging"  }
    ];
    const tabBar = containerEl.createDiv({ cls: "ak-settings-tabbar" });
    const panels = {};
    for (const tab of TABS) {
      const btn = tabBar.createEl("button", {
        cls: "ak-settings-tab" + (this._activeSettingsTab === tab.id ? " ak-settings-tab--active" : ""),
        text: tab.label
      });
      btn.addEventListener("click", e => {
        e.preventDefault();
        this._activeSettingsTab = tab.id;
        this.display();
      });
    }
    for (const tab of TABS) {
      panels[tab.id] = containerEl.createDiv({ cls: "ak-settings-panel" });
      if (this._activeSettingsTab !== tab.id) panels[tab.id].addClass("ak-settings-panel--hidden");
    }

    // ── Structure tab: Folders, Note identification, Statuses, Columns,
    // Card meta fields — everything about what data the board reads and
    // how it's organized.
    const structureEl = panels.structure;

    new import_obsidian6.Setting(structureEl).setName("Folders").setHeading();
    new import_obsidian6.Setting(structureEl)
      .setName("Actions folder")
      .setDesc("Vault folder that contains your Action notes. Example: '5 Tasks/Actions'. Required. Start typing to see matching folders. Existing open boards need a manual refresh to pick up this change.")
      .addText(t => {
        t.setPlaceholder("Actions").setValue(this.plugin.settings.actionsFolder).onChange(async v => {
          this.plugin.settings.actionsFolder = v.trim();
          await this.plugin.saveSettings();
        });
        // Folder path autocomplete — feature-detected above; FolderSuggest
        // stays null (no-op here) if unavailable on this Obsidian version.
        if (FolderSuggest) {
          try {
            new FolderSuggest(this.app, t.inputEl, async (folderPath) => {
              this.plugin.settings.actionsFolder = folderPath;
              await this.plugin.saveSettings();
            });
          } catch (err) {
            console.warn("[ActionKanban] Folder autocomplete unavailable:", err);
          }
        }
      });

    new import_obsidian6.Setting(structureEl).setName("Note identification").setHeading();
    new import_obsidian6.Setting(structureEl)
      .setName("Frontmatter type field")
      .setDesc("YAML key to identify Action notes. Default: 'Type'. Accepts scalar or list values. Existing open boards need a manual refresh to pick up this change.")
      .addText(t => t.setPlaceholder("Type").setValue(this.plugin.settings.actionTypeField).onChange(async v => {
        this.plugin.settings.actionTypeField = v.trim() || "Type";
        await this.plugin.saveSettings();
      }));
    new import_obsidian6.Setting(structureEl)
      .setName("Frontmatter type value")
      .setDesc("Value the type field must contain. Default: 'Action'. Existing open boards need a manual refresh to pick up this change.")
      .addText(t => t.setPlaceholder("Action").setValue(this.plugin.settings.actionTypeValue).onChange(async v => {
        this.plugin.settings.actionTypeValue = v.trim() || "Action";
        await this.plugin.saveSettings();
      }));
    new import_obsidian6.Setting(structureEl)
      .setName("Due date field")
      .setDesc("Frontmatter key for the due date. Fallbacks: 'due_date', 'Due Date', 'dueDate'. Default: 'Due Date'. Existing open boards need a manual refresh to pick up this change.")
      .addText(t => t.setPlaceholder("Due Date").setValue(this.plugin.settings.dueDateField).onChange(async v => {
        this.plugin.settings.dueDateField = v.trim() || "due_date";
        await this.plugin.saveSettings();
      }));

    new import_obsidian6.Setting(structureEl).setName("Statuses").setHeading();
    structureEl.createEl("p", {
      cls: "ak-settings-hint",
      text: "Each status maps to a frontmatter value (e.g. 'status: 2 in progress'). The ID must exactly match. Existing open boards need a manual refresh to pick up changes made here."
    });
    const validationEl = structureEl.createDiv({ cls: "ak-settings-validation" });
    const statusTable  = structureEl.createDiv({ cls: "ak-settings-table" });
    this._renderStatusRows(statusTable, validationEl);
    structureEl.createEl("p", {
      cls: "ak-settings-hint",
      text: "\"Done\" marks a status as a completion state. Any column containing at least one Done status becomes a Done column: its cards are hidden once older than \"Done cutoff days\" (below) since their last status change, and empty priority groups in it are collapsed rather than shown."
    });
    new import_obsidian6.Setting(structureEl).addButton(btn =>
      btn.setButtonText("Add status").setClass("ak-settings-add-btn").onClick(async () => {
        this.plugin.settings.statuses.push({ id: "new-status", label: "New Status", color: "#6B7280", isDone: false });
        await this.plugin.saveSettings(); this.display();
      })
    );

    new import_obsidian6.Setting(structureEl).setName("Columns").setHeading();
    structureEl.createEl("p", {
      cls: "ak-settings-hint",
      text: "Columns group one or more statuses. Every status should be assigned to exactly one column. Existing open boards need a manual refresh to pick up changes made here."
    });
    const colTable = structureEl.createDiv({ cls: "ak-settings-table" });
    this._renderColumnRows(colTable, validationEl);
    new import_obsidian6.Setting(structureEl).addButton(btn =>
      btn.setButtonText("Add column").setClass("ak-settings-add-btn").onClick(async () => {
        this.plugin.settings.columns.push({ id: `col-${Date.now()}`, label: "New Column", statusIds: [] });
        await this.plugin.saveSettings(); this.display();
      })
    );

    this._validateSettings(validationEl);

    new import_obsidian6.Setting(structureEl).setName("Card meta fields").setHeading();
    structureEl.createEl("p", {
      cls: "ak-settings-hint",
      text: "Optional extra frontmatter fields shown as a small line under each card's title (e.g. 'Assignee: Alex · Estimate: 3'). A field only appears on a card if that note has a non-empty value for it. Existing open boards need a manual refresh to pick up changes made here."
    });
    const pillTable = structureEl.createDiv({ cls: "ak-settings-table" });
    this._renderPillFieldRows(pillTable);
    new import_obsidian6.Setting(structureEl).addButton(btn =>
      btn.setButtonText("Add pill field").setClass("ak-settings-add-btn").onClick(async () => {
        this.plugin.settings.pillFields.push({ label: "New Field", frontmatterKey: "new_field" });
        await this.plugin.saveSettings(); this.display();
      })
    );

    // ── Behaviour tab: due-date window, done cutoff, dot size, priority
    // grouping, name-prompt skip, tilt — runtime behavior tuning, distinct
    // from both data structure and visual appearance.
    const behaviourEl = panels.behaviour;

    new import_obsidian6.Setting(behaviourEl).setName("Board behaviour").setHeading();
    new import_obsidian6.Setting(behaviourEl)
      .setName("Due date warning window (days)")
      .setDesc("Days before due date at which urgency bar starts filling. Default: 7. Existing open boards need a manual refresh to pick up this change.")
      .addText(t => t.setPlaceholder("7").setValue(String(this.plugin.settings.dueDateWarningDays)).onChange(async v => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) { this.plugin.settings.dueDateWarningDays = n; await this.plugin.saveSettings(); }
      }));
    new import_obsidian6.Setting(behaviourEl)
      .setName("Done cutoff days")
      .setDesc("Cards in a Done column older than this many days are hidden. 0 = always show all. Default: 3. Existing open boards need a manual refresh to pick up this change.")
      .addText(t => t.setPlaceholder("3").setValue(String(this.plugin.settings.doneCutoffDays)).onChange(async v => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= 0) { this.plugin.settings.doneCutoffDays = n; await this.plugin.saveSettings(); }
      }));
    new import_obsidian6.Setting(behaviourEl)
      .setName("Days-in-status dot size")
      .setDesc("Diameter (px) of each dot in the days-in-status row. Default: 7. Allowed range: 0–10.5 (-100% to +50% of default). Applies immediately to open boards.")
      .addText(t => t.setPlaceholder("7").setValue(String(this.plugin.settings.dotSizePx)).onChange(async v => {
        const n = parseFloat(v);
        if (!isNaN(n) && n >= 0 && n <= 10.5) {
          this.plugin.settings.dotSizePx = n;
          await this.plugin.saveSettings();
          this.plugin.applyDotSize();
        }
      }));
    new import_obsidian6.Setting(behaviourEl)
      .setName("Group cards by priority")
      .setDesc("ON: cards are grouped by priority within each column with High/Medium/Low separators. OFF: all cards in a column are shown in a single flat list sorted by order; priority is still shown on each card but does not affect position. Existing open boards need a manual refresh to pick up this change.")
      .addToggle(t => t.setValue(this.plugin.settings.priorityGrouping).onChange(async v => {
        this.plugin.settings.priorityGrouping = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian6.Setting(behaviourEl)
      .setName("Skip name prompt on new action")
      .setDesc("ON: the 'New Action' button/command creates the note immediately, titled 'Untitled', with no name prompt from Action Kanban. Use this if a Templater 'Folder Template' is already configured to auto-trigger in your Actions folder and asks for the note name itself — this avoids being asked for the name twice. OFF (default): Action Kanban asks for the note name itself.")
      .addToggle(t => t.setValue(this.plugin.settings.skipNewActionNamePrompt).onChange(async v => {
        this.plugin.settings.skipNewActionNamePrompt = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian6.Setting(behaviourEl)
      .setName("Tilt collapsed columns")
      .setDesc("ON: a collapsed column becomes a narrow vertical strip (rotated title) spanning the full board height, and the freed width is shared equally by the remaining columns — similar to Trello's collapsed lists. OFF (default): a collapsed column stays a short header-only box at full width. Existing open boards need a manual refresh to pick up this change.")
      .addToggle(t => t.setValue(this.plugin.settings.tiltCollapsedColumns).onChange(async v => {
        this.plugin.settings.tiltCollapsedColumns = v;
        await this.plugin.saveSettings();
      }));

    // ── Appearance tab: Custom colours, Accent palette, Background image —
    // the visually-driven, color/photo-picker-heavy sections. The two
    // color-picker groups are wrapped in <details>/<summary> (collapsed by
    // default) rather than a plain heading, since these are the two
    // biggest sources of scroll length (8 and 14 rows respectively) —
    // this is the actual space-saving Simo asked about. No native
    // Setting.collapsible() API exists; <details> is the simplest correct
    // native-HTML tool for this (built-in expand/collapse, accessible by
    // default, no extra JS state needed beyond the element itself).
    const appearanceEl = panels.appearance;

    new import_obsidian6.Setting(appearanceEl).setName("Appearance").setHeading();
    new import_obsidian6.Setting(appearanceEl)
      .setName("Custom colours")
      .setDesc("Override the board's background colours per theme. When off, Obsidian's standard theme colours are used everywhere, exactly as before.")
      .addToggle(t => t.setValue(this.plugin.settings.customColorsEnabled).onChange(async v => {
        this.plugin.settings.customColorsEnabled = v;
        await this.plugin.saveSettings();
        this.plugin.applyCustomColors();
        this.display();
      }));

    if (this.plugin.settings.customColorsEnabled) {
      const colorDetails = appearanceEl.createEl("details", { cls: "ak-settings-details" });
      colorDetails.createEl("summary", { cls: "ak-settings-summary", text: "Colour overrides (8)" });
      const colorFields = [
        { key: "toolbarBgLight", label: "Toolbar background — light theme" },
        { key: "toolbarBgDark",  label: "Toolbar background — dark theme"  },
        { key: "boardBgLight",  label: "Board background — light theme" },
        { key: "boardBgDark",   label: "Board background — dark theme"  },
        { key: "columnBgLight", label: "Column background — light theme" },
        { key: "columnBgDark",  label: "Column background — dark theme"  },
        { key: "cardBgLight",   label: "Card background — light theme"  },
        { key: "cardBgDark",    label: "Card background — dark theme"   }
      ];
      for (const f of colorFields) {
        new import_obsidian6.Setting(colorDetails)
          .setName(f.label)
          .addColorPicker(cp => cp.setValue(this.plugin.settings[f.key]).onChange(async v => {
            this.plugin.settings[f.key] = v;
            await this.plugin.saveSettings();
            this.plugin.applyCustomColors();
          }));
      }
    }

    new import_obsidian6.Setting(appearanceEl).setName("Accent colours").setHeading().setClass("ak-settings-heading--accent");
    new import_obsidian6.Setting(appearanceEl)
      .setName("Use custom accent palette")
      .setDesc("Replace Obsidian's default accent colour with a themed palette (toolbar active state, column header hover, and similar accents). When off, Obsidian's own accent/status colours are used everywhere, exactly as before.")
      .addToggle(t => t.setValue(this.plugin.settings.accentPaletteEnabled).onChange(async v => {
        this.plugin.settings.accentPaletteEnabled = v;
        await this.plugin.saveSettings();
        this.plugin.applyAccentPalette();
        this.display();
      }));

    if (this.plugin.settings.accentPaletteEnabled) {
      const accentDetails = appearanceEl.createEl("details", { cls: "ak-settings-details" });
      accentDetails.createEl("summary", { cls: "ak-settings-summary", text: "Accent colours (2)" });
      // Only the primary (copper) accent is exposed here — it's the only
      // one actually wired to anything visible (tabs, buttons, pills,
      // hovers throughout the plugin). Blue/Violet/Green/Red/Amber/Cyan
      // exist as saved settings and CSS variables for future use, but
      // nothing currently reads them, so showing pickers for them would
      // mislead the user into thinking they change something today.
      const accentFields = [
        { key: "accentCopperLight", label: "Primary accent — light theme" },
        { key: "accentCopperDark",  label: "Primary accent — dark theme"  }
      ];
      for (const f of accentFields) {
        new import_obsidian6.Setting(accentDetails)
          .setName(f.label)
          .addColorPicker(cp => cp.setValue(this.plugin.settings[f.key]).onChange(async v => {
            this.plugin.settings[f.key] = v;
            await this.plugin.saveSettings();
            this.plugin.applyAccentPalette();
          }));
      }
      new import_obsidian6.Setting(accentDetails)
        .setName("Reset to defaults")
        .setDesc("Restore the primary accent colours to their original values.")
        .addButton(btn =>
          btn.setButtonText("Reset").setClass("ak-settings-add-btn").onClick(async () => {
            this.plugin.settings.accentCopperLight = DEFAULT_SETTINGS.accentCopperLight;
            this.plugin.settings.accentCopperDark  = DEFAULT_SETTINGS.accentCopperDark;
            await this.plugin.saveSettings();
            this.plugin.applyAccentPalette();
            this.display();
          })
        );
    }

    new import_obsidian6.Setting(appearanceEl).setName("Background image").setHeading();
    new import_obsidian6.Setting(appearanceEl)
      .setName("Use background image")
      .setDesc("Show an image behind the whole board (toolbar and columns). When off, the board's normal background colour is used, exactly as before.")
      .addToggle(t => t.setValue(this.plugin.settings.backgroundImageEnabled).onChange(async v => {
        this.plugin.settings.backgroundImageEnabled = v;
        await this.plugin.saveSettings();
        this.plugin.applyBackgroundImage();
        this.display();
      }));

    if (this.plugin.settings.backgroundImageEnabled) {
      new import_obsidian6.Setting(appearanceEl)
        .setName("Background image path")
        .setDesc("Path to an image inside this vault, e.g. \"Attachments/board-bg.png\". A path outside the vault (e.g. a Windows folder path) will not work — plugins can't reach the filesystem directly, only vault-relative paths. Ignored while auto-update from Bing (below) is on, since Bing manages its own image file.")
        .addText(t => t.setPlaceholder("Attachments/board-bg.png")
          .setValue(this.plugin.settings.backgroundImagePath)
          .onChange(async v => {
            this.plugin.settings.backgroundImagePath = v.trim();
            await this.plugin.saveSettings();
            this.plugin.applyBackgroundImage();
          }));
      new import_obsidian6.Setting(appearanceEl)
        .setName("Auto-update from Bing")
        .setDesc("Once per day, download Bing's \"image of the day\" and use it as the background — stored in its own file (in the same folder as the path above, if set) so your own manually-chosen image, if any, is never overwritten. Makes a network request to bing.com. The photo credit is shown in small text over the bottom-right corner of the board.")
        .addToggle(t => t.setValue(this.plugin.settings.bingBackgroundEnabled).onChange(async v => {
          this.plugin.settings.bingBackgroundEnabled = v;
          if (!v) {
            this.plugin.settings.bingBackgroundAttribution = "";
          }
          await this.plugin.saveSettings();
          if (v) {
            // Force an immediate fetch on enable, not a wait-until-tomorrow —
            // bingLastFetchedDate is cleared so today's date won't match it.
            this.plugin.settings.bingLastFetchedDate = "";
            await this.plugin.saveSettings();
            await this.plugin.refreshBingBackground();
          } else {
            // Turning Bing off reverts display to the manual path (if any)
            // without needing to touch backgroundImagePath at all — it was
            // never modified by Bing in the first place.
            this.plugin.applyBackgroundImage();
          }
          this.display();
        }));
      new import_obsidian6.Setting(appearanceEl)
        .setName("Overlay contrast")
        .setDesc("How solid toolbar buttons and column backgrounds are over the image — higher keeps them more readable, lower shows more of the image through them.")
        .addSlider(sl => sl.setLimits(0, 100, 5)
          .setValue(this.plugin.settings.backgroundOverlayOpacity)
          .setDynamicTooltip()
          .onChange(async v => {
            this.plugin.settings.backgroundOverlayOpacity = v;
            await this.plugin.saveSettings();
            this.plugin.applyBackgroundImage();
          }));
    }

    // ── Debugging tab: separate, different audience (troubleshooting, not
    // day-to-day configuration).
    const debuggingEl = panels.debugging;

    new import_obsidian6.Setting(debuggingEl).setName("Debugging").setHeading();
    new import_obsidian6.Setting(debuggingEl)
      .setName("Enable debug logging")
      .setDesc("Logs detailed diagnostic info to the developer console (Ctrl+Shift+I). Leave off unless troubleshooting — this can be verbose.")
      .addToggle(t => t.setValue(this.plugin.settings.debugLogging).onChange(async v => {
        this.plugin.settings.debugLogging = v;
        AK_DEBUG = v;
        await this.plugin.saveSettings();
      }));
  }

  // The Statuses table. Renaming a status's ID cascades into every column
  // that references it (below), so a rename never silently orphans a
  // column's statusIds. New rows (via "Add status" below) start with a
  // sentinel id of "new-status" — see the isPlaceholder handling in
  // _renderColumnRows, which greys out and disables that status everywhere
  // until it's given a real, unique ID.
  _renderStatusRows(container, validationEl) {
    container.empty();
    const header = container.createDiv({ cls: "ak-settings-row ak-settings-row--header" });
    ["Label", "ID (matches frontmatter)", "Color", "Done?", ""].forEach(
      h => header.createDiv({ cls: "ak-settings-cell", text: h })
    );
    this.plugin.settings.statuses.forEach((status, idx) => {
      const row = container.createDiv({ cls: "ak-settings-row" });

      const labelInput = row.createDiv({ cls: "ak-settings-cell" }).createEl("input", { type: "text", value: status.label });
      labelInput.addEventListener("change", async () => {
        this.plugin.settings.statuses[idx].label = labelInput.value.trim();
        await this.plugin.saveSettings(); this.display();
      });

      const idInput = row.createDiv({ cls: "ak-settings-cell" }).createEl("input", { type: "text", value: status.id });
      idInput.addEventListener("change", async () => {
        const oldId = this.plugin.settings.statuses[idx].id;
        const newId = idInput.value.trim();
        if (newId === oldId) return;
        this.plugin.settings.statuses[idx].id = newId;
        // Cascade rename into every column that references the old id
        for (const col of this.plugin.settings.columns) {
          const pos = col.statusIds.indexOf(oldId);
          if (pos !== -1) col.statusIds[pos] = newId;
        }
        await this.plugin.saveSettings(); this.display();
      });

      const colorInput = row.createDiv({ cls: "ak-settings-cell" }).createEl("input", { type: "color", value: status.color });
      colorInput.addEventListener("change", async () => {
        this.plugin.settings.statuses[idx].color = colorInput.value;
        await this.plugin.saveSettings(); this.display();
      });

      const doneCell = row.createDiv({ cls: "ak-settings-cell" });
      const doneToggle = doneCell.createEl("label", { cls: "ak-settings-toggle" });
      const doneInput = doneToggle.createEl("input", { type: "checkbox" });
      doneInput.checked = status.isDone;
      doneToggle.createEl("span", { cls: "ak-settings-toggle-track" });
      doneInput.addEventListener("change", async () => {
        this.plugin.settings.statuses[idx].isDone = doneInput.checked;
        await this.plugin.saveSettings(); this.display();
      });

      const removeBtn = row.createDiv({ cls: "ak-settings-cell" }).createEl("button", { text: "Remove" });
      removeBtn.addEventListener("click", async () => {
        this.plugin.settings.statuses.splice(idx, 1);
        await this.plugin.saveSettings(); this.display();
      });
    });
  }

  // The "card meta fields" table (experimental) — user-defined extra
  // frontmatter values shown as a pill line under a card's title. Purely
  // display: label + frontmatterKey pairs, no validation against what
  // actually exists in any note's frontmatter.
  _renderPillFieldRows(container) {
    container.empty();
    const header = container.createDiv({ cls: "ak-settings-row ak-settings-row--pill ak-settings-row--header" });
    ["Label", "Frontmatter key", ""].forEach(
      h => header.createDiv({ cls: "ak-settings-cell", text: h })
    );
    this.plugin.settings.pillFields.forEach((field, idx) => {
      const row = container.createDiv({ cls: "ak-settings-row ak-settings-row--pill" });

      const labelInput = row.createDiv({ cls: "ak-settings-cell" }).createEl("input", { type: "text", value: field.label });
      labelInput.addEventListener("change", async () => {
        this.plugin.settings.pillFields[idx].label = labelInput.value.trim();
        await this.plugin.saveSettings();
      });

      const keyInput = row.createDiv({ cls: "ak-settings-cell" }).createEl("input", { type: "text", value: field.frontmatterKey });
      keyInput.addEventListener("change", async () => {
        this.plugin.settings.pillFields[idx].frontmatterKey = keyInput.value.trim();
        await this.plugin.saveSettings();
      });

      const removeBtn = row.createDiv({ cls: "ak-settings-cell" }).createEl("button", { text: "Remove" });
      removeBtn.addEventListener("click", async () => {
        this.plugin.settings.pillFields.splice(idx, 1);
        await this.plugin.saveSettings(); this.display();
      });
    });
  }

  // The Columns table. Each column is a label plus a checklist of which
  // statuses map into it — a column can include more than one status (see
  // StatusPickerModal, shown when a drop target has more than one).
  _renderColumnRows(container, validationEl) {
    container.empty();
    const header = container.createDiv({ cls: "ak-settings-row ak-settings-row--header ak-settings-row--columns" });
    ["Label", "Statuses included", ""].forEach(h => header.createDiv({ cls: "ak-settings-cell", text: h }));
    this.plugin.settings.columns.forEach((col, idx) => {
      const row = container.createDiv({ cls: "ak-settings-row ak-settings-row--columns" });

      const labelInput = row.createDiv({ cls: "ak-settings-cell" }).createEl("input", { type: "text", value: col.label });
      labelInput.addEventListener("change", async () => {
        this.plugin.settings.columns[idx].label = labelInput.value.trim();
        await this.plugin.saveSettings();
      });

      const statusCell = row.createDiv({ cls: "ak-settings-cell ak-settings-cell--multi" });
      for (const status of this.plugin.settings.statuses) {
        const isPlaceholder = status.id === "new-status";
        const isChecked     = col.statusIds.includes(status.id);
        const pill = statusCell.createEl("button", {
          cls: "ak-settings-status-pill" + (isChecked ? " ak-settings-status-pill--checked" : ""),
          text: isPlaceholder ? `${status.label} (set ID first)` : status.label
        });
        pill.type = "button"; // prevents accidental form-submit behavior
        pill.disabled = isPlaceholder;
        pill.setAttribute("aria-pressed", String(isChecked));
        if (isPlaceholder) pill.addClass("ak-settings-status-pill--placeholder");
        pill.style.setProperty("--ak-status-pill-color", status.color);
        pill.style.setProperty("--ak-status-pill-text", getReadableTextColor(status.color));
        pill.addEventListener("click", async () => {
          const nowChecked = !col.statusIds.includes(status.id);
          if (nowChecked) {
            if (!this.plugin.settings.columns[idx].statusIds.includes(status.id))
              this.plugin.settings.columns[idx].statusIds.push(status.id);
          } else {
            this.plugin.settings.columns[idx].statusIds =
              this.plugin.settings.columns[idx].statusIds.filter(id => id !== status.id);
          }
          await this.plugin.saveSettings();
          pill.toggleClass("ak-settings-status-pill--checked", nowChecked);
          pill.setAttribute("aria-pressed", String(nowChecked));
          this._validateSettings(validationEl);
        });
      }

      const removeBtn = row.createDiv({ cls: "ak-settings-cell" }).createEl("button", { text: "Remove" });
      removeBtn.addEventListener("click", async () => {
        this.plugin.settings.columns.splice(idx, 1);
        await this.plugin.saveSettings(); this.display();
      });
    });
  }

  // Warns (doesn't block) if any status isn't assigned to any column — such
  // a status would still be a valid frontmatter value but the card would
  // have nowhere to render, so it's worth flagging.
  _validateSettings(validationEl) {
    validationEl.empty();
    const assigned   = new Set(this.plugin.settings.columns.flatMap(c => c.statusIds));
    const unassigned = this.plugin.settings.statuses.filter(s => !assigned.has(s.id)).map(s => s.id);
    if (unassigned.length > 0) {
      validationEl.createDiv({ cls: "ak-settings-warning" }).textContent =
        `\u26A0 Status ID(s) not assigned to any column: ${unassigned.join(", ")}`;
    }
  }
};

// ─── ActionKanbanPlugin ───────────────────────────────────────────────────────
// The plugin entry point. onload() wires the whole dependency chain by hand
// (adapters → use cases → BoardController → views/commands) — no DI
// framework, everything constructed and passed down explicitly. Note there
// is deliberately no onunload() method; see the file header comment for why.

var ActionKanbanPlugin = class extends import_obsidian5.Plugin {
  async onload() {
    console.debug(`[Action Kanban] build ${AK_BUILD_VERSION} (manifest v${this.manifest.version}) loaded`);
    dbg("[AK-PLUGIN] onload START");
    await this.loadSettings();
    AK_DEBUG = this.settings.debugLogging;
    this.applyCustomColors();
    this.applyDotSize();
    this.applyAccentPalette();
    this.applyBackgroundImage();

    // Adapters
    this.actionRepo      = new ObsidianActionRepository(
      this.app,
      () => this.settings.actionsFolder,
      () => this.settings.actionTypeField,
      () => this.settings.actionTypeValue,
      () => this.settings.dueDateField
    );
    this.vaultAdapter     = new ObsidianVaultAdapter(this.app);

    // Use cases
    this.loadBoardUC    = new LoadBoardUseCase(this.actionRepo);
    this.moveCardUC     = new MoveCardUseCase(this.actionRepo);
    this.reorderCardUC  = new ReorderCardUseCase(this.actionRepo);
    this.bootstrapUC    = new BootstrapUseCase(this.actionRepo);
    this.createActionUC = new CreateActionUseCase(this.actionRepo, this.vaultAdapter);

    // createAction closure
    const createAction = async () => {
      if (this.settings.skipNewActionNamePrompt) {
        const globalMax = await this._currentGlobalMaxOrder();
        return await this.createActionUC.execute({ name: null, globalMaxOrder: globalMax });
      }
      return new Promise(resolve => {
        new NewActionModal(this.app, async name => {
          const globalMax = await this._currentGlobalMaxOrder();
          const filePath  = await this.createActionUC.execute({ name, globalMaxOrder: globalMax });
          resolve(filePath);
        }).open();
      });
    };

    // Controller
    this.boardController = new BoardController(
      () => this.settings,
      this.loadBoardUC,
      this.moveCardUC,
      this.reorderCardUC,
      { execute: async input => { await this.createActionUC.execute(input); } },
      this.vaultAdapter
    );

    // Metadata cache resolution gate — prevents self-healing writes
    // (repairOrders) from firing against a still-indexing metadataCache at
    // cold start. "resolved" fires once after Obsidian's initial full vault
    // metadata scan completes. Root cause fix for the startup mass-rewrite bug.
    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        dbg("[AK-PLUGIN] metadataCache resolved — enabling self-healing writes");
        this.actionRepo.markMetadataResolved();
      })
    );

    // ── DIAGNOSTIC (temporary): logs every vault "modify" event for any file
    // in the Actions folder, regardless of which code or plugin caused it.
    // vault.on("modify") fires for ANY content write to a file — not just
    // writes made through this plugin's own methods — so this will catch the
    // culprit even if it is a different plugin or an Obsidian-internal write.
    // Purely read-only: does not alter any file. Remove once root-caused.
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        const folder = this.settings.actionsFolder;
        const prefix = folder.endsWith("/") ? folder : folder + "/";
        if (file.path && file.path.startsWith(prefix)) {
          dbg(
            "[AK-DIAG] vault 'modify' fired for:", file.path,
            "at", new Date().toISOString(),
            "stack:", new Error().stack?.split("\n").slice(1, 8).join(" | ")
          );
        }
      })
    );

    // Bootstrap — deferred until workspace layout (and any restored Kanban
    // view / embedded board) has settled, as defense-in-depth on top of the
    // metadataResolved gate above.
    dbg("[AK-PLUGIN] calling _bootstrapOnLoad");
    this.app.workspace.onLayoutReady(() => this._bootstrapOnLoad());

    // Bing background refresh — same onLayoutReady deferral as bootstrap
    // above, so the auto-fetch (if enabled) doesn't race initial vault
    // indexing or slow down startup. Kept as its own registration, not
    // merged into _bootstrapOnLoad's callback, so a failure in one can
    // never affect the other. No-ops internally if the feature is off or
    // already fetched today — see refreshBingBackground().
    this.app.workspace.onLayoutReady(() => this.refreshBingBackground());

    // Views / commands / settings
    this.registerView(VIEW_TYPE_KANBAN,
      leaf => new KanbanView(leaf, this.boardController, () => this.settings, () => this.saveSettings())
    );
    this.addRibbonIcon("layout-dashboard", "Open Action Kanban board", () => this._openKanbanView());
    this.addCommand({ id: "open-kanban",    name: "Open board",       callback: () => this._openKanbanView() });
    this.addCommand({ id: "new-action",     name: "New action note",  callback: async () => { await createAction(); this._refreshAllViews(); } });
    this.addCommand({ id: "refresh-kanban", name: "Refresh board",    callback: () => this._refreshAllViews() });
    this.addCommand({
      id: "embed-kanban",
      name: "Embed board",
      editorCallback: (editor) => {
        editor.replaceSelection("```action-kanban\n\n```\n");
      }
    });
    this.addCommand({
      id: "embed-kanban-callout",
      name: "Embed board in a callout",
      editorCallback: (editor) => {
        editor.replaceSelection("> [!note]+ Action Kanban\n> ```action-kanban\n> \n> ```\n");
      }
    });
    this.addSettingTab(new ActionKanbanSettingTab(this.app, this));

    // Code block
    this.registerMarkdownCodeBlockProcessor("action-kanban", async (source, el, ctx) => {
      let initialFilter;
      let titleText;
      for (const line of source.split("\n")) {
        const m = line.match(/^filter\s*:\s*(\S+)/);
        if (m) {
          const v = m[1].trim();
          if (v === "high" || v === "medium" || v === "low") initialFilter = v;
        }
        const t = line.match(/^title\s*:\s*(.+)/);
        if (t) {
          const v = t[1].trim();
          if (v) titleText = v;
        }
      }
      // Marks this render as an embed (vs. the standalone KanbanView tab),
      // so styles.css can apply embed-only treatment — e.g. rounded outer
      // corners, which would look wrong on the standalone view where the
      // board fills its entire pane edge-to-edge.
      el.addClass("ak-board-root--embedded");
      const renderer = new KanbanBoardRenderer(this.app, this.boardController, () => this.settings, undefined, () => this.saveSettings());
      await renderer.render(el, initialFilter, true, titleText);

      // Auto-refresh on external edits to Action notes (e.g. hand-editing
      // frontmatter). Filtered to the Actions folder so unrelated vault
      // activity doesn't trigger a reload, and debounced so a burst of
      // near-simultaneous changes collapses into a single re-render.
      // Cleaned up via MarkdownRenderChild so the listener and any pending
      // debounce timer are torn down when this embed leaves the DOM.
      const child = new import_obsidian5.MarkdownRenderChild(el);
      let debounceTimer = null;
      const scheduleRefresh = () => {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null;
          dbg("[ActionKanban] embedded board: debounced refresh firing");
          renderer.renderBoard(el);
        }, 1e3);
      };
      child.registerEvent(this.app.metadataCache.on("changed", file => {
        if (!(file instanceof import_obsidian5.TFile)) return;
        const folder = this.settings.actionsFolder;
        const prefix = folder.endsWith("/") ? folder : folder + "/";
        if (!file.path.startsWith(prefix)) return;
        dbg("[ActionKanban] embedded board: relevant change for", file.path, "— scheduling refresh");
        scheduleRefresh();
      }));
      child.register(() => { if (debounceTimer) window.clearTimeout(debounceTimer); });
      ctx.addChild(child);
    });

    dbg("[AK-PLUGIN] onload DONE");
  }

  // Merges saved data onto DEFAULT_SETTINGS field-by-field (rather than a
  // flat Object.assign of the whole object) so a setting introduced in a
  // later version gets its default on existing installs instead of being
  // undefined. The knownIds filter at the end is a one-time data-migration
  // guard, not something that runs conditionally — see its own comment.
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.statuses)           this.settings.statuses           = DEFAULT_SETTINGS.statuses;
    if (!this.settings.columns)            this.settings.columns            = DEFAULT_SETTINGS.columns;
    if (!this.settings.pillFields)         this.settings.pillFields         = DEFAULT_SETTINGS.pillFields;
    if (!this.settings.collapsedColumns)   this.settings.collapsedColumns   = DEFAULT_SETTINGS.collapsedColumns;
    if (this.settings.tiltCollapsedColumns === undefined)
      this.settings.tiltCollapsedColumns = DEFAULT_SETTINGS.tiltCollapsedColumns;
    if (!this.settings.actionTypeField)    this.settings.actionTypeField    = DEFAULT_SETTINGS.actionTypeField;
    if (!this.settings.actionTypeValue)    this.settings.actionTypeValue    = DEFAULT_SETTINGS.actionTypeValue;
    if (!this.settings.dueDateField)       this.settings.dueDateField       = DEFAULT_SETTINGS.dueDateField;
    if (!this.settings.dueDateWarningDays) this.settings.dueDateWarningDays = DEFAULT_SETTINGS.dueDateWarningDays;
    if (this.settings.dotSizePx === undefined || this.settings.dotSizePx === null)
      this.settings.dotSizePx = DEFAULT_SETTINGS.dotSizePx;
    if (this.settings.priorityGrouping === undefined)
      this.settings.priorityGrouping = DEFAULT_SETTINGS.priorityGrouping;
    if (this.settings.debugLogging === undefined)
      this.settings.debugLogging = DEFAULT_SETTINGS.debugLogging;
    if (this.settings.skipNewActionNamePrompt === undefined)
      this.settings.skipNewActionNamePrompt = DEFAULT_SETTINGS.skipNewActionNamePrompt;
    if (this.settings.customColorsEnabled === undefined)
      this.settings.customColorsEnabled = DEFAULT_SETTINGS.customColorsEnabled;
    if (!this.settings.toolbarBgLight) this.settings.toolbarBgLight = DEFAULT_SETTINGS.toolbarBgLight;
    if (!this.settings.toolbarBgDark)  this.settings.toolbarBgDark  = DEFAULT_SETTINGS.toolbarBgDark;
    if (!this.settings.boardBgLight)  this.settings.boardBgLight  = DEFAULT_SETTINGS.boardBgLight;
    if (!this.settings.boardBgDark)   this.settings.boardBgDark   = DEFAULT_SETTINGS.boardBgDark;
    if (!this.settings.columnBgLight) this.settings.columnBgLight = DEFAULT_SETTINGS.columnBgLight;
    if (!this.settings.columnBgDark)  this.settings.columnBgDark  = DEFAULT_SETTINGS.columnBgDark;
    if (!this.settings.cardBgLight)   this.settings.cardBgLight   = DEFAULT_SETTINGS.cardBgLight;
    if (!this.settings.cardBgDark)    this.settings.cardBgDark    = DEFAULT_SETTINGS.cardBgDark;
    if (this.settings.accentPaletteEnabled === undefined)
      this.settings.accentPaletteEnabled = DEFAULT_SETTINGS.accentPaletteEnabled;
    if (!this.settings.accentCopperLight) this.settings.accentCopperLight = DEFAULT_SETTINGS.accentCopperLight;
    if (!this.settings.accentCopperDark)  this.settings.accentCopperDark  = DEFAULT_SETTINGS.accentCopperDark;
    if (!this.settings.accentBlueLight)   this.settings.accentBlueLight   = DEFAULT_SETTINGS.accentBlueLight;
    if (!this.settings.accentBlueDark)    this.settings.accentBlueDark    = DEFAULT_SETTINGS.accentBlueDark;
    if (!this.settings.accentVioletLight) this.settings.accentVioletLight = DEFAULT_SETTINGS.accentVioletLight;
    if (!this.settings.accentVioletDark)  this.settings.accentVioletDark  = DEFAULT_SETTINGS.accentVioletDark;
    if (!this.settings.accentGreenLight)  this.settings.accentGreenLight  = DEFAULT_SETTINGS.accentGreenLight;
    if (!this.settings.accentGreenDark)   this.settings.accentGreenDark   = DEFAULT_SETTINGS.accentGreenDark;
    if (!this.settings.accentRedLight)    this.settings.accentRedLight    = DEFAULT_SETTINGS.accentRedLight;
    if (!this.settings.accentRedDark)     this.settings.accentRedDark     = DEFAULT_SETTINGS.accentRedDark;
    if (!this.settings.accentAmberLight)  this.settings.accentAmberLight  = DEFAULT_SETTINGS.accentAmberLight;
    if (!this.settings.accentAmberDark)   this.settings.accentAmberDark   = DEFAULT_SETTINGS.accentAmberDark;
    if (!this.settings.accentCyanLight)   this.settings.accentCyanLight   = DEFAULT_SETTINGS.accentCyanLight;
    if (!this.settings.accentCyanDark)    this.settings.accentCyanDark    = DEFAULT_SETTINGS.accentCyanDark;
    if (this.settings.backgroundImageEnabled === undefined)
      this.settings.backgroundImageEnabled = DEFAULT_SETTINGS.backgroundImageEnabled;
    if (this.settings.backgroundImagePath === undefined)
      this.settings.backgroundImagePath = DEFAULT_SETTINGS.backgroundImagePath;
    if (this.settings.bingBackgroundEnabled === undefined)
      this.settings.bingBackgroundEnabled = DEFAULT_SETTINGS.bingBackgroundEnabled;
    if (this.settings.bingBackgroundPath === undefined)
      this.settings.bingBackgroundPath = DEFAULT_SETTINGS.bingBackgroundPath;
    if (this.settings.bingBackgroundAttribution === undefined)
      this.settings.bingBackgroundAttribution = DEFAULT_SETTINGS.bingBackgroundAttribution;
    if (this.settings.bingLastFetchedDate === undefined)
      this.settings.bingLastFetchedDate = DEFAULT_SETTINGS.bingLastFetchedDate;
    // One-time repair for vaults that ran the earlier buggy version,
    // where Bing wrote directly to backgroundImagePath instead of its
    // own separate path: if Bing is enabled but has no recorded
    // bingBackgroundPath yet, clear the last-fetched date so the next
    // onLayoutReady refresh runs immediately and writes to the new,
    // correctly-separated Bing-owned file instead of leaving Bing mode
    // silently stuck with nowhere to write.
    if (this.settings.bingBackgroundEnabled && !this.settings.bingBackgroundPath) {
      this.settings.bingLastFetchedDate = "";
    }
    if (this.settings.backgroundOverlayOpacity === undefined || this.settings.backgroundOverlayOpacity === null)
      this.settings.backgroundOverlayOpacity = DEFAULT_SETTINGS.backgroundOverlayOpacity;
    // Migration guard: strip any statusId from columns that is not a known status id.
    // Guards against data corruption where a status label (e.g. "To Do") was
    // accidentally stored as a status id in a column's statusIds array.
    const knownIds = new Set(this.settings.statuses.map(s => s.id));
    for (const col of this.settings.columns) {
      col.statusIds = col.statusIds.filter(id => knownIds.has(id));
    }
  }

  async saveSettings() { await this.saveData(this.settings); }

  // Sets (or removes, when the toggle is off) the 8 CSS custom properties
  // that styles.css reads for toolbar/board/column/card backgrounds.
  // Removing the property — not setting it to an empty string — is what
  // makes the var(--ak-x-override, var(--background-y)) fallback in
  // styles.css fall through cleanly to Obsidian's standard theme colors
  // when disabled.
  applyCustomColors() {
    const s      = this.settings;
    const target = document.body;
    const props  = {
      "--ak-toolbar-bg-light-override": s.toolbarBgLight,
      "--ak-toolbar-bg-dark-override":  s.toolbarBgDark,
      "--ak-board-bg-light-override":  s.boardBgLight,
      "--ak-board-bg-dark-override":   s.boardBgDark,
      "--ak-column-bg-light-override": s.columnBgLight,
      "--ak-column-bg-dark-override":  s.columnBgDark,
      "--ak-card-bg-light-override":   s.cardBgLight,
      "--ak-card-bg-dark-override":    s.cardBgDark
    };
    for (const [name, value] of Object.entries(props)) {
      if (s.customColorsEnabled) target.style.setProperty(name, value);
      else                       target.style.removeProperty(name);
    }
  }

  // Sets the CSS custom property that styles.css reads for the days-in-status
  // dot diameter (--ak-dot-size, consumed via var(--ak-dot-size, 7px)).
  // Always applied — unlike custom colors, there is no enable/disable toggle.
  applyDotSize() {
    document.body.style.setProperty("--ak-dot-size", `${this.settings.dotSizePx}px`);
  }

  // Sets (or removes) the 14 CSS custom properties that styles.css reads
  // for the custom accent palette (--ak-accent-*-light/-dark pairs), and
  // toggles the .ak-native-palette class on <body>. When accentPaletteEnabled
  // is false, .ak-native-palette is present, which remaps every
  // --ak-accent-* token straight to Obsidian's own semantic colors
  // (--interactive-accent, --color-blue, etc.) in styles.css — so the board
  // looks exactly as it did before this feature existed, with no per-rule
  // fallback chain needed the way the background-color overrides use.
  applyAccentPalette() {
    const s      = this.settings;
    const target = document.body;
    const props  = {
      "--ak-accent-copper-light": s.accentCopperLight,
      "--ak-accent-copper-dark":  s.accentCopperDark,
      "--ak-accent-blue-light":   s.accentBlueLight,
      "--ak-accent-blue-dark":    s.accentBlueDark,
      "--ak-accent-violet-light": s.accentVioletLight,
      "--ak-accent-violet-dark":  s.accentVioletDark,
      "--ak-accent-green-light":  s.accentGreenLight,
      "--ak-accent-green-dark":   s.accentGreenDark,
      "--ak-accent-red-light":    s.accentRedLight,
      "--ak-accent-red-dark":     s.accentRedDark,
      "--ak-accent-amber-light":  s.accentAmberLight,
      "--ak-accent-amber-dark":   s.accentAmberDark,
      "--ak-accent-cyan-light":   s.accentCyanLight,
      "--ak-accent-cyan-dark":    s.accentCyanDark
    };
    for (const [name, value] of Object.entries(props))
      target.style.setProperty(name, value);
    target.classList.toggle("ak-native-palette", !s.accentPaletteEnabled);
  }

  // Sets (or removes) the --ak-board-bg-image custom property that
  // styles.css reads via var(--ak-board-bg-image, none) on .ak-board-root
  // — same body-level-property pattern as applyCustomColors(), so it
  // applies to every board root (standalone view + any number of embeds)
  // without touching KanbanBoardRenderer's render path at all. The path is
  // vault-relative and resolved through app.vault.adapter.getResourcePath()
  // — a raw OS filesystem path isn't usable here, since plugins run inside
  // Obsidian's sandboxed renderer, not with direct Node fs access, and a
  // hardcoded absolute path would break entirely on mobile.
  applyBackgroundImage() {
    const s = this.settings;
    const target = document.body;
    let url = null;
    // While Bing mode is on and has a written file, it takes precedence
    // and uses its own path — bingBackgroundPath, never backgroundImagePath
    // (that field is the user's manual choice and is never read here while
    // Bing owns the display, so it's never at risk of being treated as a
    // Bing-writable target). Falls back to the manual path otherwise.
    const activePath = (s.bingBackgroundEnabled && s.bingBackgroundPath)
      ? s.bingBackgroundPath
      : s.backgroundImagePath;
    if (s.backgroundImageEnabled && activePath) {
      try { url = this.app.vault.adapter.getResourcePath(activePath); }
      catch (err) { console.warn("[ActionKanban] Could not resolve background image path:", err); }
    }
    if (url) target.style.setProperty("--ak-board-bg-image", `url("${url}")`);
    else     target.style.removeProperty("--ak-board-bg-image");
    // Overlay opacity (0-100 setting -> 0-1 CSS value) for the semi-
    // transparent backgrounds styles.css applies to toolbar buttons and
    // columns while an image is active — see the body[style*=...] rules
    // in styles.css for where this is actually consumed.
    target.style.setProperty("--ak-bg-overlay-opacity", String(s.backgroundOverlayOpacity / 100));
    // Bing attribution overlay (bottom-right corner text) — only shown
    // while Bing mode is on and a fetch has actually populated the
    // attribution string. Uses a body-level CSS custom property, NOT a
    // data-* attribute — attr() on a pseudo-element only reads its own
    // originating element (.ak-board-root), never an ancestor like
    // <body>, so a data-* attribute here would be invisible to the CSS.
    // Custom properties inherit to descendants, which is why this works
    // the same way --ak-board-bg-image does above. JSON.stringify() wraps
    // the text in literal quote characters and escapes any embedded
    // quotes/backslashes — content: var(...) requires the value to
    // already be a valid quoted CSS string, not a bare unquoted one.
    if (s.bingBackgroundEnabled && s.bingBackgroundAttribution)
      target.style.setProperty("--ak-bing-attribution-text", JSON.stringify(s.bingBackgroundAttribution));
    else
      target.style.removeProperty("--ak-bing-attribution-text");
  }

  // Fetches Bing's "image of the day" and writes it to a Bing-owned path
  // (bingBackgroundPath) derived from the same folder as the user's manual
  // backgroundImagePath, but always a distinct filename — never overwrites
  // a manually-selected image. Runs at most once per calendar day, gated
  // by bingLastFetchedDate. Called from onload() via
  // workspace.onLayoutReady(), same deferral used for _bootstrapOnLoad(),
  // so this doesn't race initial vault indexing. Fire-and-forget:
  // network/parse/write failures are caught and logged, never thrown,
  // since a background-image refresh must never be able to break plugin
  // load.
  async refreshBingBackground() {
    const s = this.settings;
    if (!s.bingBackgroundEnabled) return;
    const today = IsoDate.today().value;
    if (s.bingLastFetchedDate === today) {
      dbg("[AK-BING] already fetched today, skipping");
      return;
    }
    // Bing writes to its own fixed filename, in the same FOLDER as
    // backgroundImagePath but never the same file — reusing the exact
    // path was a real bug: it silently overwrote a manually-selected
    // background image the first time Bing mode was turned on. Deriving
    // a distinct filename means enabling Bing can never destroy a
    // manual image, and turning Bing back off leaves the manual image
    // (and backgroundImagePath, untouched by this method) exactly as it
    // was.
    // normalizePath() first: a raw backslash-separated (Windows-style)
    // path resolves fine through getResourcePath() (which normalizes
    // internally), but a bare lastIndexOf("/") on the RAW string would
    // silently miss the folder entirely on such a path, always falling
    // back to "Attachments" and writing somewhere the user isn't
    // looking — this was a real, confirmed bug (Bing images landed in
    // Attachments/ instead of the user's actual configured folder).
    const BING_FILENAME = "ak-bing-daily.jpg";
    const existingPath  = import_obsidian5.normalizePath(s.backgroundImagePath || "");
    const lastSlash0    = existingPath.lastIndexOf("/");
    const folder0       = lastSlash0 > -1 ? existingPath.slice(0, lastSlash0) : "Attachments";
    const bingPath       = folder0 ? `${folder0}/${BING_FILENAME}` : BING_FILENAME;

    try {
      const metaRes = await import_obsidian5.requestUrl({
        url: "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US"
      });
      const meta  = metaRes.json;
      const image = meta && meta.images && meta.images[0];
      if (!image || !image.url) {
        console.warn("[ActionKanban] Bing background: unexpected API response, skipping");
        return;
      }
      const imageRes = await import_obsidian5.requestUrl({
        url: `https://www.bing.com${image.url}`
      });
      const bytes = imageRes.arrayBuffer;

      // Ensure the parent folder exists — vault.adapter.writeBinary does
      // not create intermediate folders itself.
      if (folder0 && !(await this.app.vault.adapter.exists(folder0))) {
        await this.app.vault.adapter.mkdir(folder0);
      }

      await this.app.vault.adapter.writeBinary(bingPath, bytes);

      s.bingBackgroundPath         = bingPath;
      s.backgroundImageEnabled     = true;
      s.bingBackgroundAttribution  = image.copyright || "";
      s.bingLastFetchedDate        = today;
      await this.saveSettings();
      this.applyBackgroundImage();
      dbg("[AK-BING] background refreshed:", bingPath);
    } catch (err) {
      console.warn("[ActionKanban] Bing background refresh failed:", err);
    }
  }

  // Reveals the existing standalone board tab if one's already open, rather
  // than opening a second one — the plugin only ever intends one standalone
  // board leaf at a time (embeds are unlimited, that's a separate mechanism).
  async _openKanbanView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KANBAN);
    if (existing.length > 0) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_KANBAN, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  // Refreshes every open standalone board (there's realistically at most
  // one, per _openKanbanView above) after an action that doesn't itself
  // trigger a metadataCache event the view would react to — e.g. right
  // after creating a new note.
  _refreshAllViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KANBAN))
      leaf.view.refresh();
  }

  // One-time cold-start backfill, invoked from onload() via
  // workspace.onLayoutReady(). Fire-and-forget (not awaited by the caller)
  // since there's nothing for onload() to block on — errors are caught and
  // logged, not thrown, so a bootstrap failure can't prevent the plugin
  // from finishing loading.
  _bootstrapOnLoad() {
    dbg("[AK-PLUGIN] _bootstrapOnLoad: scanning actions...");
    this.actionRepo.getAllActions()
      .then(actions => {
        dbg("[AK-PLUGIN] _bootstrapOnLoad: got", actions.length, "actions, executing bootstrap");
        this.bootstrapUC.execute(actions);
      })
      .catch(err => console.warn("[ActionKanban] Bootstrap failed:", err));
  }

  // Baseline value passed to CreateActionUseCase so a newly-created note's
  // order lands after every existing card, not at 0. Falls back to 0 (not
  // an error) if the scan itself fails, so note creation still works even
  // if this lookup can't complete.
  async _currentGlobalMaxOrder() {
    try {
      const actions = await this.actionRepo.getAllActions();
      let max = 0;
      for (const a of actions)
        if (a.order !== null && a.order > max) max = a.order;
      return max;
    } catch { return 0; }
  }

};
