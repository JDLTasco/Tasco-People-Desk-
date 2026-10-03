// The app version shown in the nav bar and footer (John, 2026-10-01).
// Bump this with every update that gets pushed, and add a line below.
// Patch (x.y.Z) for fixes and small tweaks, minor (x.Y.0) for new features.
export const APP_VERSION = "1.8.0";

// History:
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
