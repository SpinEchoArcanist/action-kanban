<%*
// 1. Ask for the Name
let title = await tp.system.prompt("Enter Action Name", "New Action");
if (!title) title = "Untitled Action";

// 2. Add the emoji prefix to the title 
const finalTitle = `⚡ ${title}`;

// 2. Ask for Priority
const priorityOptions = ["high", "medium", "low", "none"];
const priorityNames = ["🔴 High", "🟡 Medium", "🟢 Low", "⚪ Empty"];
const priorityChoice = await tp.system.suggester(priorityNames, priorityOptions);

// 3. Rename the file to the chosen title
await tp.file.rename(finalTitle);

	// 4. Output the Frontmatter
%>---
Type:
  - Action
status:
  - 1 todo
priority:
  - <% priorityChoice %>
tags:
  - personal-actions
Description: 
---

# [[<% finalTitle %>]]

## 🎯 Goal
<!-- What does "done" look like? One or two sentences — the outcome, not the steps. -->
<% tp.file.cursor() %>

## 📋 Contexe
<!-- Why this exists, background, constraints. -->

## ✅ Tasks
<!-- Tasks-plugin checklist for concrete next steps. Each still needs its own ➕ Created Date. -->
- [ ] 

> [!question]- 🧭 Stuck? Ask yourself (only open this if you're procrastinating)
> 1. What's the literal next physical action — not "work on X", but what would you actually type/click/say first?
> 2. How long will it really take once you start? If under 2 minutes, stop reading this and just do it.
> 3. What's actually stopping you — missing information, an unclear next step, or just not wanting to? Naming it usually breaks the freeze.
> 4. What genuinely happens if this doesn't move this week? If the honest answer is "nothing" — that's useful information too, maybe it belongs in backlog, not todo.

## 📓 Journal
<!-- Running log. Entries here are appended automatically when this Action is mentioned in a Daily Note's Dump Zone (see Daily-Review-Protocol), plus anything you log manually. -->


## 🔗 Links
<!-- Related people, projects, releases. -->

