import { getSession } from "@/lib/session";

// Deliberately accessible to every signed-in role (ADMIN/HR_LEAD/HR_OFFICER
// all get the same content) -- John asked for this to be open to all,
// unlike every other /admin/* screen which is role-gated. No Prisma reads
// here on purpose: this is static operational documentation of how the
// built system actually behaves, kept in one page so it can't drift out of
// sync with STATUS.md/the build spec without someone noticing.
export default async function InstructionsPage() {
  const session = await getSession();
  if (!session?.user) return null;

  return (
    <main>
      <h1>Instructions -- how Tasco People Desk works</h1>
      <p>
        This page explains how the system works day to day and what to do at each stage of a ticket. Every
        signed-in role (ADMIN, HR_LEAD and HR_OFFICER) sees the same content. Below, these roles are called Admins,
        HR Leads and HR Officers.
      </p>
      <p>
        New here? Start with the <a href="/instructions/procedure">Procedure</a> (also under the Instructions menu) -- the whole process, start to finish, in one place.
      </p>

      <section className="section-card">
        <h2>What this system is</h2>
        <p>
          Tasco People Desk replaces the <code>humanresources@tascopetroleum.com.au</code> shared inbox. Every
          inbound email to that address becomes a <strong>ticket</strong> that moves through a fixed lifecycle, gets
          tracked, and is eventually archived for the 7-year retention period HR records require.
        </p>
        <p>
          <strong>Where things stand right now:</strong> sign-in is live (your normal Tasco Microsoft account).
          Real emails to HR become tickets when someone presses <strong>Check mailbox</strong> (or an Admin runs an
          import), rather than arriving on their own every few minutes, and <strong>sending email is switched
          off</strong> while HR finishes testing --
          acknowledgements, questions and outcomes are recorded on the ticket and listed under Admin &rarr; Failed
          sends instead of being delivered. Email attachments can be seen on a ticket but can&apos;t be opened
          until IT switches on malware scanning. Everything else on this page already works exactly as described;
          once the mailbox connection is switched on, emails flow in and out automatically with no change to how
          you work a ticket.
        </p>
      </section>

      <section className="section-card">
        <h2>The ticket lifecycle</h2>
        <p>Most tickets move through these statuses in order. The exceptions (closing early, merging) are explained below.</p>
        <ol>
          <li>
            <strong>NEW</strong> -- just arrived, sitting unassigned in the <a href="/pool">Pool</a>. The requester
            automatically gets an acknowledgement email straight away, with the ticket number, &quot;Expected
            response: as soon as practical&quot;, and a note asking them to keep the ticket number in the subject line
            when they reply (see &quot;Replying to a requester&quot; below). For a ticket you create yourself with{" "}
            <strong>+ New ticket</strong>, untick &quot;Send the requester an acknowledgement email&quot; if they don&apos;t
            need one. Anyone can claim it for themselves or assign it to someone else.
          </li>
          <li>
            <strong>ALLOCATED</strong> -- a person now owns it. No email goes to the requester at this point (they
            were already acknowledged when the ticket arrived). Anyone can reassign it to someone else at any time.
          </li>
          <li>
            <strong>IN_ACTION</strong> -- the assignee has started working it. <strong>A category must be set
            before a ticket can move here</strong> -- there&apos;s no way around this, by design. While in action, a
            ticket can also be in one of the states below. Pick one from the <strong>Current action</strong>{" "}
            drop-down and click <strong>Update action</strong>; the ticket&apos;s current action is always shown in the
            banner at the top of the ticket, with who set it and when.
            <ul>
              <li>
                <strong>AWAITING_RESPONSE</strong> -- you&apos;ve asked the requester something and are waiting to
                hear back. Anyone can set this. The assignee, HR Leads
                and Admins can also send a question by email with <strong>Email a question</strong>{" "}
                -- it goes to the requester by default, but you can change <strong>To</strong> to ask someone else
                (e.g. the requester&apos;s manager) and add CCs. Start typing a name or address in To or CC and
                the People Desk suggests addresses it has already seen (requesters, people CC&apos;d, anyone who
                has emailed HR or been emailed by HR) -- pick one with the mouse, or the arrow keys and Enter. You review the exact email before it sends, the
                ticket moves here automatically, and the reply threads back onto the ticket.
              </li>
              <li>
                <strong>RESPONSE_RECEIVED</strong> -- the requester (or whoever you asked) has come back.{" "}
                <strong>An emailed reply sets this automatically</strong> when the ticket is in action or awaiting a
                response (a reply to a ticket that is assigned but not started yet just raises the alert). For a phone
                call or a conversation, <strong>anyone</strong> can record it by hand: choose Response received, type
                what they said in the box that appears, and click Update action (the text is saved as an internal
                note). The assignee gets an alert -- a red number next to{" "}
                <strong>My tickets</strong> and a highlighted row -- until they open the ticket.
              </li>
              <li>
                <strong>Action items</strong> such as <strong>On Hold</strong> -- labels an Admin manages under
                Admin &rarr; Action items. Each appears in the Current action drop-down; the label then shows in
                place of IN_ACTION on the ticket and in every list. Setting one needs a reason (e.g. why it&apos;s on
                hold), saved as an internal note. Anyone can set one; only the assignee, HR Leads
                and Admins can clear it. It clears by itself when the ticket moves to any other status, and the due
                date keeps running while it&apos;s set.
              </li>
            </ul>
            The assignee picks <strong>In action</strong> in the drop-down to carry on working on it. Use the Status
            filter on any list to find tickets in any of these states.
          </li>
          <li>
            <strong>OUTCOME</strong> -- the resolution has been drafted and sent to the requester via the dispatch
            preview (see below). It goes to the requester by default; To and CC can be changed. Notes are never
            included -- they are internal only. The requester then has <strong>2 working days</strong> to reply: a
            reply reopens the ticket (back to its assignee as Response received); if there is no reply, it{" "}
            <strong>closes automatically</strong> overnight (see &quot;Reply windows&quot; below). You can also close
            it yourself straight away with <strong>Close -- Resolved</strong>.
          </li>
          <li>
            <strong>CLOSED</strong> -- the matter is finished. A ticket can also reach CLOSED directly from an
            earlier status with <strong>Info only</strong> (for information only, sent to the wrong address, or not an
            HR matter), <strong>Autoclose</strong> (similar, kept as a separate reason only so the two can be told
            apart in reporting) or <strong>Withdrawn</strong> (the requester no longer wants it actioned).
          </li>
          <li>
            <strong>ARCHIVED</strong> -- happens automatically 2 working days after closure if the requester
            hasn&apos;t replied, through an overnight job (an Admin can also archive on demand). See &quot;Closed vs.
            Archived&quot; below -- they are different things.
          </li>
        </ol>
        <p>
          A ticket can also be <strong>merged</strong> into another one if two emails turn out to be the same
          matter. On the duplicate, click <strong>Merge into another ticket</strong>, search for the ticket to keep
          by its number, subject, or the requester&apos;s name or email, tick it and click <strong>Confirm
          merge</strong>. Any unsaved changes on the duplicate are saved first. Its emails, notes and attachments move into the ticket you kept, which stays
          the case number; the duplicate closes with the reason &quot;Merged&quot; and shows a link to the other
          ticket. Replies to the duplicate&apos;s emails land on the kept ticket. Confidential tickets can&apos;t be
          merged, and you can&apos;t merge into an archived ticket. A merge can&apos;t be undone.
        </p>
      </section>

      <section className="section-card">
        <h2>Priority and due dates</h2>
        <p>When a ticket first arrives, its priority is set automatically:</p>
        <ul>
          <li>
            Subject contains <strong>&quot;Urgent&quot;</strong> (any capitalisation) → <strong>P1</strong>.
          </li>
          <li>
            Anything else → <strong>P3</strong> for now (the longest timeframe). The real priority of a non-urgent
            ticket should be set by whoever takes it on, not guessed from the subject line -- use the Priority
            selector in the ticket&apos;s Metadata panel once you&apos;ve read the request.
          </li>
        </ul>
        <p>
          Every ticket gets a <strong>target due date</strong> automatically from its priority, counted in working
          days -- Monday to Friday, skipping Victorian public holidays and any Tasco shutdown days listed on{" "}
          <strong>Admin &rarr; Calendar</strong> (an Admin keeps that list up to date). This is the date the
          People Desk tracks as its KPI: it drives the Due date, the Overdue list and overdue alerts.
          Requesters are only ever told &quot;as soon as practical&quot;.
        </p>
        <ul>
          <li><strong>P1</strong> -- 3 working days</li>
          <li><strong>P2</strong> -- 10 working days</li>
          <li><strong>P3</strong> -- 20 working days</li>
        </ul>
        <p>
          Any HR staff member can set the priority in the Metadata panel at any time. Changing it moves the
          automatic target due date to match, and the new date shows in the box (highlighted) as soon as you pick
          the priority, before you save. There is one <strong>Save changes</strong> button for priority,
          category, business unit and target due date, and pressing any Action button (Claim, Start action, Close,
          etc.) also saves whatever you&apos;ve changed there first.
        </p>
        <p>
          Anyone can <strong>override</strong> the target due date -- earlier or later -- for example for a Fair Work
          response date or a WorkCover deadline. An override needs a reason, and once overridden the date no
          longer changes when the priority does. Tickets that arrived before 3 October 2026 have no target date
          and are still measured against the old clock (P1 2 days, P2 7 days, P3 30 days, shown as &quot;Due
          (SLA)&quot;) until the ticket is next claimed, assigned or saved -- it then gets its automatic target date
          from its current priority.
        </p>
      </section>

      <section className="section-card">
        <h2>Replying to a requester</h2>
        <p>
          Every automated email the system sends carries the ticket number in the subject, e.g.{" "}
          <code>[260916094601] Leave request</code>. If a requester replies normally, their email client keeps that
          in the subject and the reply threads onto the right ticket automatically.
        </p>
        <p>
          If a reply arrives as a fresh email (a forward, a different email client, or the ticket number got
          copied into a brand-new message) it still threads onto the correct ticket as long as{" "}
          <code>[TICKETNO]</code> survives somewhere in the subject line -- this is why every email we send
          explicitly asks people to keep it there. This works for anyone who replies, not only the requester (for
          example a manager you emailed a question to).
        </p>
      </section>

      <section className="section-card">
        <h2>Definitions</h2>
        <dl className="definitions">
          <dt>Working day</dt>
          <dd>
            Monday to Friday in Melbourne time, <strong>except</strong> the dates listed on{" "}
            <strong>Admin &rarr; Calendar</strong> (Victorian public holidays and any Tasco shutdown days). Weekends and
            listed dates are skipped. Target due dates are counted from the moment the ticket arrived and fall
            at the same time of day: a P1 that arrives at 10:00 on a Monday is due at 10:00 on Thursday (3 working days).
            A ticket that arrives on a weekend or holiday starts counting from the next working day. &quot;Working
            days&quot; on the dashboard (average age, time to resolve, due in the next 7 working days) are counted the
            same way.
          </dd>
          <dt>On time</dt>
          <dd>
            A ticket is <strong>on time</strong> if it was closed with <strong>Close -- Resolved</strong> on or before
            its target due date. If the target date was overridden, the overridden date is the one that counts; for a
            ticket from before 3 October 2026 with no target date, its old SLA date counts. Tickets closed as Info only,
            Autoclose or Withdrawn, and merged tickets, are not counted at all. The dashboard&apos;s{" "}
            <strong>on-time rate</strong> is the number of on-time tickets divided by all tickets resolved in the
            selected period. An open ticket isn&apos;t counted until it is resolved -- if it is past its target due date
            in the meantime it shows as <strong>Overdue</strong>.
          </dd>
        </dl>
      </section>

      <section className="section-card">
        <h2>HR dashboard (all staff)</h2>
        <p>
          The <strong>Dashboard</strong> (on the menu bar, and the first page you see after signing in) shows the
          workload right now (open tickets by priority, status, assignee, business unit and category; unassigned;
          overdue; due in the next 7 working days; average age), what was created and closed this month, and, for
          the reporting period you choose, trends (inbound vs closed), average time to resolve and the{" "}
          <strong>on-time rate</strong> -- the share of resolved tickets closed on or
          before their target due date (an overridden target counts as the target), also broken down by assignee,
          business unit and category. Info only, Autoclose and Withdrawn closures are counted separately and are not
          part of the on-time rate. Click a number or a name to open the matching filtered list. Hover over a bar for its
          exact value, or use &quot;Show as a table&quot;. Everyone sees it; confidential tickets are only counted for
          people allowed to open them, so figures can differ slightly between users.
        </p>
        <p>
          <strong>Reporting period.</strong> Choose 7 days, 30 days, 90 days or 12 months, or, for month-end and
          quarter-end reporting, <strong>Last month</strong>, <strong>This quarter</strong> or{" "}
          <strong>Last quarter</strong> (calendar quarters: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec, which match the
          financial-year quarters). For any other period, enter <strong>From</strong> and <strong>To</strong> dates
          and press <strong>Show</strong> -- both dates are included in full. The period applies to the trends,
          on-time rate, time to resolve and target-date compliance; &quot;Workload now&quot; and &quot;This
          month&quot; always show the current position. The chosen period is part of the page address, so you can
          bookmark it.
        </p>
        <p>
          <strong>Check mailbox</strong> (the orange button with the envelope, top right on every page) brings in new
          emails from the HR mailbox straight away instead of waiting. It takes from a few seconds to a minute. When it
          finishes, a message shows how many new tickets were created and how many replies were added to existing
          tickets, and the page refreshes. Emails already brought in are skipped, so pressing it twice does no harm. If
          someone else&apos;s check is already running, the button waits for that one instead of starting another.
        </p>
        <p>
          <strong>Upcoming terminations</strong> (near the top of the dashboard) lists every open ticket in the
          Terminations/Resignations category with its termination date, business unit, assignee and due date -- soonest
          termination first; click the <strong>Termination date</strong> heading to reverse the order. Click a ticket
          number or subject to open it. The termination date is entered on the ticket itself: pick the
          Terminations/Resignations category and a <strong>Termination date</strong> box appears next to Business unit.
          Tickets without a date yet show &quot;not set&quot; at the bottom.
        </p>
        <p>
          <strong>Customise dashboard</strong> (top right) lets you arrange the dashboard your way: drag a section by
          its <strong>⠿</strong> handle to a new spot (or use ◀ ▶), set it to full, half or third width, or
          <strong> Hide</strong> it (hidden sections are listed at the top while customising, with a Show button).
          Press <strong>Done</strong> when you&apos;ve finished. Your arrangement is saved to your own account, so it
          follows you to any computer; <strong>Reset to standard</strong> puts it back. On a phone, sections always
          show one under another.
        </p>
      </section>

      <section className="section-card">
        <h2>Views -- where to find things</h2>
        <p>
          Every list has a filter bar. <strong>Status</strong>, <strong>Priority</strong>, <strong>Business unit</strong>{" "}
          and <strong>Assignee</strong> each open a list of tick boxes -- tick as many as you like (e.g. P1 and P2).
          A ticket is shown if it matches at least one ticked value in every box you&apos;ve used. Underneath,{" "}
          <strong>Sort by</strong> / <strong>then by</strong> sorts the list by up to three things in turn (e.g.
          priority, then due date) -- choose <strong>Date received</strong> to sort by the Received column (when
          the email arrived, or when a + New ticket was logged). <strong>Clear all filters</strong> resets everything.
          Each staff member has their own colour, shown on the Assignee name (an Admin can pick it on Admin &rarr;
          Users). The coloured strip down the left edge of each row shows its priority: red P1, amber P2, navy P3. To make a column wider or narrower, drag the thin line at the right
          edge of its heading -- the columns to its right make room. To move a column, drag its heading left or
          right and let go where the navy bar shows. Your layout is saved to your own account, so it&apos;s the
          same on every list and every computer (other staff keep theirs); <strong>Reset columns</strong> (or
          double-clicking a line) puts it back to the standard layout.
        </p>
        <ul>
          <li><strong>Pool</strong> -- unassigned NEW tickets, available for anyone to claim.</li>
          <li><strong>My tickets</strong> -- everything assigned to you, closed ones at the bottom. A red number next to it means someone recorded a response on one of your tickets.</li>
          <li><strong>All open</strong> -- every ticket that isn&apos;t CLOSED or ARCHIVED, across all officers.</li>
          <li><strong>Overdue</strong> -- tickets past their target due date (or, for tickets from before 3 October 2026 with no target date, their old SLA date).</li>
          <li><strong>Closed</strong> -- every CLOSED or ARCHIVED ticket, across all officers, most recent first.</li>
          <li>
            <strong>Archive search</strong> -- full-text search specifically over <em>archived</em> tickets (see
            below), with tick boxes to include Info only and Autoclose closures, which are left out by default.
          </li>
        </ul>
      </section>

      <section className="section-card">
        <h2>Closed vs. Archived -- these are not the same thing</h2>
        <p>
          <strong>CLOSED</strong> is the normal end of a ticket&apos;s working life. It&apos;s still a completely
          live, visible record. For <strong>2 working days</strong> after closing (Monday to Friday, skipping the
          days on Admin &rarr; Calendar), any staff member can <strong>Reopen</strong> it (a reason is required). It
          goes back to its assignee as In action (or Allocated if it has no category yet), or back to the Pool if
          it was never assigned. A ticket that was merged into another can&apos;t be reopened -- work on the
          ticket it was merged into instead.
        </p>
        <p>
          <strong>Reply windows.</strong> After the outcome is sent (OUTCOME), the requester has 2 working days
          to reply. If they don&apos;t, the ticket closes automatically, and they then have another 2 working days
          before it is archived. A reply inside either window <strong>reopens the ticket automatically</strong> --
          back to its assignee as Response received, with the usual alert. A reply that arrives after that starts a{" "}
          <strong>new ticket</strong>, with a note pointing back to the old one. (Info only and Autoclose tickets
          are archived straight away, so any reply to those is always a new ticket.)
        </p>
        <p>
          <strong>ARCHIVED</strong> happens later, automatically. An overnight job picks up tickets closed more
          than 2 working days ago (an Admin can also archive on demand) and writes them out to permanent files
          containing the full correspondence, notes and metadata. This is what starts the 7-year retention clock,
          and from then on the ticket is read-only for everyone except Admins.
        </p>
        <p>The Closed page lists both. Archive search only searches tickets that have been archived.</p>
      </section>

      <section className="section-card">
        <h2>Confidential tickets and legal hold</h2>
        <ul>
          <li>
            An HR Lead or Admin can mark a ticket <strong>confidential</strong>. Anyone not allowed to see it gets a
            plain &quot;not found&quot; page, not an access-denied message -- to them, the ticket appears not to exist.
          </li>
          <li>
            Every view of a confidential ticket is logged, including views by Admins -- there is no &quot;break
            glass&quot; exception. The audit trail is the control.
          </li>
          <li>
            <strong>Legal hold</strong> (Admins only) suspends the 7-year retention purge on a ticket indefinitely,
            for as long as it&apos;s needed -- typically for active litigation, an investigation, or a
            whistleblower matter.
          </li>
        </ul>
      </section>

      <section className="section-card">
        <h2>Step-by-step: handling a ticket end to end</h2>
        <ol>
          <li>Check the <a href="/pool">Pool</a> for unassigned tickets, or check <a href="/my-tickets">My tickets</a> for what&apos;s already yours.</li>
          <li>Claim it, or use <strong>Assign to</strong> to give it to a colleague. Any unsaved changes in the Metadata panel are saved when you press Claim.</li>
          <li>Read the request properly, then set its real <strong>Priority</strong> and <strong>Category</strong> in the Metadata panel -- category is mandatory before you can start action.</li>
          <li>Set a <strong>Business unit</strong> if relevant (optional, never blocks progress). Check the automatic <strong>target due date</strong> and override it (with a reason) if there&apos;s a specific external deadline.</li>
          <li>Click <strong>Start action</strong> once you begin working on it.</li>
          <li>
            When you&apos;re done with a ticket for now, press the green <strong>Save &amp; exit</strong> button at the top
            right. It saves anything you haven&apos;t saved yet -- changes in the Metadata panel, a new choice in the
            Current action drop-down, and a note you&apos;ve typed but not added -- then takes you back to{" "}
            <strong>My tickets</strong> for the next one. If something can&apos;t be saved (for example Response
            received with no note), it stays on the ticket and tells you why. Changed your mind? The burgundy{" "}
            <strong>Cancel</strong> button beside it leaves without saving -- the ticket stays as it was last saved.
            (Anything you already applied with its own button, such as Claim, an action or an added note, was saved
            at the time and stays.)
          </li>
          <li>Use <strong>internal notes</strong> to record progress. Notes are internal only -- they are never sent outside HR.</li>
          <li>To ask the requester -- or someone else, such as their manager -- something, use <strong>Email a question</strong> (or set the Current action to <strong>Awaiting response</strong> if you asked another way). To park a ticket, set it to <strong>On Hold</strong> and type the reason. To take over a colleague&apos;s ticket, pick yourself under <strong>Reassign</strong>. An emailed reply marks the ticket <strong>Response received</strong> automatically; if they come back by phone or in person, set it yourself.</li>
          <li>When resolved, click the purple <strong>Send outcome to employee</strong> button (shown once the ticket is in action) to write up the results of the enquiry, check who it goes To and CC, review the exact email that will send, and confirm. The email&apos;s subject ends &quot;Outcome of your enquiry&quot; and it opens with a purple heading; in Correspondence it shows as a purple <strong>[OUTCOME SENT]</strong> card.</li>
          <li>
            Then either click <strong>Close -- Resolved</strong> yourself -- this also sends the requester a short
            standardised closing confirmation, separate from the outcome email -- or leave it: if the requester
            doesn&apos;t reply within 2 working days the ticket closes by itself overnight, and is archived 2 working
            days after that. If they do reply in that time, it comes back to you as Response received.
          </li>
          <li>If the email is for information only or not an HR matter, use <strong>Close -- Info only</strong>; for spam or anything needing no action, <strong>Close -- Autoclose</strong>. Neither needs a priority, category or target date, neither notifies the requester, and both <strong>archive the ticket straight away</strong> (you&apos;re asked to confirm, as it can&apos;t be reopened afterwards).</li>
          <li>If the requester withdraws the request before it&apos;s resolved, use <strong>Close -- Withdrawn</strong>. This doesn&apos;t notify the requester either, since they withdrew it.</li>
        </ol>
      </section>

      <section className="section-card">
        <h2>Roles and permissions</h2>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>ADMIN</th>
              <th>HR_LEAD</th>
              <th>HR_OFFICER</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>View the Pool / claim a ticket</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Assign a Pool ticket to someone else / reassign any ticket</td><td>Yes</td><td>Yes</td><td>Any ticket you can see</td></tr>
            <tr><td>Edit ticket metadata (priority, category, business unit)</td><td>Yes</td><td>Yes</td><td>Any ticket you can see</td></tr>
            <tr><td>Set the current action (awaiting response, response received, action items)</td><td>Yes</td><td>Yes</td><td>Any ticket you can see</td></tr>
            <tr><td>Set the target due date</td><td>Yes</td><td>Yes</td><td>Any ticket you can see</td></tr>
            <tr><td>Draft and send the outcome, close</td><td>Yes</td><td>Yes</td><td>Assigned tickets only</td></tr>
            <tr><td>Close as Info only, Autoclose or Withdrawn</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Reopen a closed ticket (within 2 working days, reason required)</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Merge a ticket into another</td><td>Yes</td><td>Yes</td><td>Assigned tickets only</td></tr>
            <tr><td>HR dashboard</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Set / clear the confidential flag</td><td>Yes</td><td>Yes</td><td>No</td></tr>
            <tr><td>View a confidential ticket</td><td>Yes (logged)</td><td>Yes (logged)</td><td>Only if given access or assigned</td></tr>
            <tr><td>Set / clear legal hold</td><td>Yes</td><td>No</td><td>No</td></tr>
            <tr><td>Reverse a status transition</td><td>Yes (step-up required)</td><td>No</td><td>No</td></tr>
            <tr><td>Soft-delete a ticket</td><td>Yes (step-up required)</td><td>No</td><td>No</td></tr>
            <tr><td>Manage users and colours, categories, business units, action items, calendar, block list, ignored images</td><td>Yes</td><td>No</td><td>No</td></tr>
            <tr><td>View the audit log, legal holds list and address book</td><td>Yes</td><td>Yes</td><td>No</td></tr>
            <tr><td>Bulk export (CSV)</td><td>Yes</td><td>Yes</td><td>No</td></tr>
          </tbody>
        </table>
        <p>
          &quot;Step-up required&quot; means you&apos;ll be asked to re-confirm your sign-in immediately before the
          action goes through. This applies to the few actions that can&apos;t easily be undone: reversing a status
          change, deleting a ticket, clearing confidential status and changing someone&apos;s role.
        </p>
      </section>

      <section className="section-card">
        <h2>Admin tasks (Admins only, listed here for information)</h2>
        <ul>
          <li><strong>Admin &rarr; Users</strong>: create or pre-provision users, change roles, set a person&apos;s real display name, pick their colour (or Automatic), archive/restore a user.</li>
          <li><strong>Admin &rarr; Calendar</strong>: the non-working days (Victorian public holidays, Tasco shutdowns) skipped when counting working days -- for target due dates, the reply windows and the dashboard. Add next year&apos;s dates each year.</li>
          <li><strong>Admin &rarr; Address book</strong> (Admins and HR Leads): every address the People Desk has seen (requesters, CCs, anyone who emailed or was emailed by HR) -- the list the To and CC suggestions come from. It&apos;s built from the tickets themselves, so it&apos;s always up to date, and it&apos;s read-only.</li>
          <li><strong>Admin &rarr; Categories</strong> / <strong>Business units</strong> / <strong>Action items</strong>: add new ones, rename existing ones, deactivate (never delete -- existing tickets keep their history either way).</li>
          <li><strong>Admin &rarr; Legal holds</strong>: see every ticket currently under hold, oldest first.</li>
          <li><strong>Admin &rarr; Deleted</strong>: see soft-deleted tickets (they can&apos;t be opened from here, by design).</li>
          <li><strong>Admin &rarr; Audit log</strong>: search every recorded action by ticket number, actor, action type, date range, or correlation ID.</li>
          <li><strong>Admin &rarr; Failed sends</strong>: any outbound email that failed after 3 attempts.</li>
          <li><strong>Admin &rarr; Block list</strong>: stop obvious non-HR email (newsletters, app sign-up notices, job ads) becoming tickets, by exact sender, whole domain, or words in the subject. Rules are switched off, never deleted. On a ticket from an outside sender, <strong>Block this sender</strong> adds a Sender rule and closes the ticket as Info only in one step.</li>
          <li><strong>Admin &rarr; Blocked emails</strong>: everything the Block list stopped, and which rule caught it. Nothing is lost -- the email stays in the hrtickets@ mailbox; switch the rule off and it comes in on the next mailbox check.</li>
          <li><strong>Admin &rarr; Ignored images</strong>: email signature and footer images (Tasco logos etc.) to skip when emails come in. It suggests images repeated across 3+ tickets; ignoring one also takes the copies already on tickets off them (reversible -- switching it off puts them back). On a ticket, <strong>Always ignore</strong> next to an emailed image does the same. Only that exact image is skipped -- pasted screenshots still come through.</li>
        </ul>
      </section>
    </main>
  );
}
