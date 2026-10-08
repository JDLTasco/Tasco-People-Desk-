// The app version shown in the nav bar and footer (John, 2026-10-01).
// Bump this with every update that gets pushed, and add a line below.
// Patch (x.y.Z) for fixes and small tweaks, minor (x.Y.0) for new features.
export const APP_VERSION = "2.7.0";

// History:
// 2.7.0 (2026-10-08) -- Dashboard is the opening page after sign-in (was the
//   Pool); Upcoming terminations has a soft warm background
// 2.6.0 (2026-10-08) -- Termination date on Terminations/Resignations tickets;
//   Upcoming terminations list on the dashboard, sortable by that date
// 2.5.0 (2026-10-08) -- ticket list columns can also be moved by dragging the
//   heading; layout saved to each person's account (any computer)
// 2.4.0 (2026-10-08) -- ticket list columns can be dragged wider/narrower
//   (Pool, My tickets, All open, Overdue, Closed); remembered per browser
// 2.3.3 (2026-10-07) -- ticket page as wide as the list pages
// 2.3.2 (2026-10-07) -- list pages wider: side margins halved again
// 2.3.1 (2026-10-07) -- fix: merge search ignored what HR Officers typed and
//   could show stale results; now also searches requester name/email.
//   Archive Search no longer shows HR Officers confidential tickets on a
//   requester search
// 2.3.0 (2026-10-06) -- Procedure moved to its own page; Instructions is now a
//   drop-down menu (Instructions / Procedure)
// 2.2.2 (2026-10-06) -- fix: merging refused with "version, intoTicketId, and
//   intoVersion are all required" (ticket search didn't return the version)
// 2.2.1 (2026-10-06) -- Instructions brought up to date; new Procedure section
//   (the whole process start to finish)
// 2.2.0 (2026-10-06) -- reply windows: Outcome closes after 2 working days with no
//   reply, Closed archives 2 working days later; a reply inside a window reopens
//   the ticket, a later reply starts a new ticket pointing back to the old one
// 2.1.1 (2026-10-06) -- fix: P3 target date previews on tickets with no date yet;
//   merging (and saving) no longer refused with "Give a reason for overriding..."
// 2.1.0 (2026-10-05) -- Admin -> Users: pick each staff member's colour (or
//   Automatic); Dianne Nichols set to Purple
// 2.0.1 (2026-10-05) -- choosing a new priority shows the new target due date
//   straight away (before Save changes)
// 2.0.0 (2026-10-05) -- Received date column on every ticket list (sortable
//   via Sort by -> Date received); version 2.0 at John's request
// 1.13.0 (2026-10-05) -- "Send outcome to employee" (purple): outcome email
//   subject "Outcome of your enquiry" + purple heading, purple [OUTCOME SENT]
//   card; outbound emails labelled by type; list row edge colour = priority
// 1.12.1 (2026-10-05) -- On Hold (any action item) needs a reason, saved as a
//   note; Reassign lists yourself, so you can take over a colleague's ticket
// 1.12.0 (2026-10-05) -- burgundy Cancel beside Save & exit: leave a ticket
//   without saving
// 1.11.1 (2026-10-05) -- fix: after a priority change, Save & exit no longer
//   asks for a target due reason (automatic date change)
// 1.11.0 (2026-10-05) -- Admin -> Ignored images: skip email signature / footer
//   logos by exact contents; Always ignore on ticket images
// 1.10.2 (2026-10-05) -- Dashboard moved from the Admin menu to the main menu bar
// 1.10.1 (2026-10-05) -- HR dashboard open to all staff (HR Officers too)
// 1.10.0 (2026-10-05) -- Admin -> Block list + Blocked emails; Block this
//   sender button on tickets (ADMIN, outside senders only)
// 1.9.3 (2026-10-05) -- category dropdown alphabetical ("Other" last)
// 1.9.2 (2026-10-03) -- Clear all filters buttons; Definitions in
//   Instructions; dashboard information panel
// 1.9.1 (2026-10-03) -- nav/header bar stays on screen while scrolling
// 1.9.0 (2026-10-03) -- business calendar (Vic public holidays + shutdowns,
//   Admin -> Calendar) for the working-day target; HR dashboard
//   (Admin -> Dashboard); list filters by category / from the address bar
// 1.8.1 (2026-10-03) -- darker green Save & exit button
// 1.8.0 (2026-10-03) -- "Close -- Not a request" renamed "Close -- Info only";
//   Info only and Autoclose close + archive immediately, nothing to fill in
// 1.7.0 (2026-10-03) -- green "Save & exit" button at the top of every
//   ticket: saves unsaved work and returns to My tickets
// 1.6.0 (2026-10-03) -- wider pages (half the empty side margins);
//   responsive for tablets and phones (menu button, ticket cards)
// 1.5.1 (2026-10-03) -- fix: an older ticket with no target due date gets
//   one when claimed/assigned/saved, even if the priority didn't change
// 1.5.0 (2026-10-03) -- address suggestions in To/CC boxes; Admin -> Address
//   book; admin screens grouped under one "Admin" menu in the nav bar
// 1.4.3 (2026-10-03) -- Admin -> Users hides archived users (button to show
//   all); pages recover from a crash (e.g. tab open across a deploy) by
//   reloading once instead of "Application error"
// 1.4.2 (2026-10-03) -- "Send acknowledgement email" tick box on + New ticket
// 1.4.1 (2026-10-03) -- acknowledgement email: "keep the ticket number" line
//   bold and yellow
// 1.4.0 (2026-10-03) -- colour per assignee; multi-choice filters + sort by
//   up to 3 fields; new categories (Terminations/Resignations, Incidents,
//   Staff Details) and business units (Albury Office, Sky Garden, Garment
//   Gallery), Transport -> Carriers, business units alphabetical; sent
//   emails show who sent them
// 1.3.0 (2026-10-03) -- anyone can assign/reassign; notes internal only;
//   question/outcome emails to any To + CC; emailed reply auto-marks
//   Response received; automatic working-day target due date (the KPI);
//   acknowledgement email on arrival replaces the allocation email
// 1.2.0 (2026-10-01) -- "Current action" dropdown replaces the separate status
//   buttons; "Current action: ..." banner at the top of every ticket
// 1.1.0 (2026-10-01) -- version number + "Powered by JDL" footer
// 1.0.0 (2026-10-01) -- baseline: action items (On Hold), ask-requester
//   question email, split ticket layout (commit 6145f44)
