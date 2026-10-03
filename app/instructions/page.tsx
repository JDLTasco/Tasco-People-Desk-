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
      <h1>Instructions -- How Tasco People Desk works</h1>
      <p>
        This page explains how the system works day to day and what to do at each stage of a ticket. It&apos;s
        visible to every signed-in role -- ADMIN, HR_LEAD and HR_OFFICER all see the same content.
      </p>

      <section className="section-card">
        <h2>What this system is</h2>
        <p>
          Tasco People Desk replaces the <code>humanresources@tascopetroleum.com.au</code> shared inbox. Every
          inbound email to that address becomes a <strong>ticket</strong> that moves through a fixed lifecycle, gets
          tracked, and is eventually archived for the 7-year retention period HR records require.
        </p>
        <p>
          <strong>Current limitation:</strong> the real mailbox connection isn&apos;t live yet (that depends on IT/
          Entra setup outside this app). Until then, test tickets are created through a dev-only tool rather than
          real inbound email, and outbound emails are logged as attempted-but-not-actually-delivered. The rest of
          this page describes how the system behaves once that connection is live, since none of the ticket
          workflow itself depends on it.
        </p>
      </section>

      <section className="section-card">
        <h2>The ticket lifecycle</h2>
        <p>Every ticket moves through these statuses in order. Nothing skips a step.</p>
        <ol>
          <li>
            <strong>NEW</strong> -- just arrived, sitting unassigned in the <a href="/pool">Pool</a>. The requester
            automatically gets an acknowledgement email straight away, with the ticket number, &quot;Expected
            response: as soon as practical&quot;, and a note asking them to keep the ticket number in the subject line
            when they reply (see &quot;Replying to a requester&quot; below). For a ticket you create yourself with{" "}
            <strong>+ New ticket</strong>, untick &quot;Send the requester an acknowledgement email&quot; if they don&apos;t need one. Anyone can self-assign it, or assign it
            to someone else.
          </li>
          <li>
            <strong>ALLOCATED</strong> -- a person now owns it. No email goes to the requester at this point (they
            were already acknowledged when the ticket arrived). Anyone can reassign it to someone else at any time.
          </li>
          <li>
            <strong>IN_ACTION</strong> -- the assignee has started working it. <strong>A category must be set
            before a ticket can move here</strong> -- there&apos;s no way around this, by design. While in action, a
            ticket can also be in one of the states below. Pick one from the <strong>Current action</strong>{" "}
            dropdown and click <strong>Update action</strong>; the ticket&apos;s current action is always shown in the
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
                Admin &rarr; Action items. Each appears in the Current action dropdown; the label then shows in
                place of IN_ACTION on the ticket and in every list. Anyone can set one; only the assignee, HR Leads
                and Admins can clear it. It clears by itself when the ticket moves to any other status, and the due
                date keeps running while it&apos;s set.
              </li>
            </ul>
            The assignee picks <strong>In action</strong> in the dropdown to carry on working it. Use the Status filter on
            any list to find tickets in either state.
          </li>
          <li>
            <strong>OUTCOME</strong> -- the resolution has been drafted and sent to the requester via the dispatch
            preview (see below). It goes to the requester by default; To and CC can be changed. Notes are never
            included -- they are internal only.
          </li>
          <li>
            <strong>CLOSED</strong> -- the matter is finished. A ticket can also reach CLOSED directly from an
            earlier status via &quot;Not a request&quot; close (spam, wrong address, genuinely not an HR matter),
            Autoclose (similar, kept as a separate reason purely so the two can be told apart in reporting), or
            Withdrawn (the requester no longer wants it actioned).
          </li>
          <li>
            <strong>ARCHIVED</strong> -- happens automatically 30 days after closure, via an overnight job (an
            ADMIN can also trigger it on demand). See &quot;Closed vs. Archived&quot; below -- they are genuinely
            different things.
          </li>
        </ol>
        <p>
          A ticket can also be <strong>merged</strong> into another one if two emails turn out to be the same
          matter -- the merged-away ticket closes with its own distinct reason and its content moves into the
          other ticket&apos;s correspondence.
        </p>
      </section>

      <section className="section-card">
        <h2>Priority and due dates</h2>
        <p>When a ticket first arrives, its priority is set automatically:</p>
        <ul>
          <li>
            Subject contains <strong>&quot;Urgent&quot;</strong> (any case) → <strong>P1</strong>, 48-hour/2-day
            SLA.
          </li>
          <li>
            Anything else → defaults to <strong>P3</strong> (the longest, safest clock) provisionally. Real
            priority for a non-urgent ticket is meant to be decided by whoever allocates it, not guessed from the
            subject line -- use the Priority selector in the ticket&apos;s Metadata panel to set it properly once
            you&apos;ve actually read the request.
          </li>
        </ul>
        <p>
          Every ticket gets a <strong>target due date</strong> automatically from its priority, counted in working
          days (Monday to Friday -- public holidays are not skipped, so adjust the date if one falls inside). This is
          the date the People Desk tracks as its KPI: it drives the Due date, the Overdue list and overdue alerts.
          Requesters are only ever told &quot;as soon as practical&quot;.
        </p>
        <ul>
          <li><strong>P1</strong> -- 3 working days</li>
          <li><strong>P2</strong> -- 10 working days</li>
          <li><strong>P3</strong> -- 20 working days</li>
        </ul>
        <p>
          Priority is set in the Metadata panel by any HR staff member, at any time -- changing it moves the
          automatic target due date to match. There is one <strong>Save changes</strong> button for priority,
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
        <h2>Views -- where to find things</h2>
        <p>
          Every list has a filter bar. <strong>Status</strong>, <strong>Priority</strong>, <strong>Business unit</strong>{" "}
          and <strong>Assignee</strong> each open a list of tick boxes -- tick as many as you like (e.g. P1 and P2).
          A ticket shows if it matches any ticked value in a box, and all the boxes you&apos;ve used. Underneath,{" "}
          <strong>Sort by</strong> / <strong>then by</strong> sorts the list by up to three things in turn (e.g.
          priority, then due date). <strong>Clear filters</strong> resets everything. Each staff member has their
          own colour, shown on the Assignee name and down the left edge of their rows.
        </p>
        <ul>
          <li><strong>Pool</strong> -- unassigned NEW tickets, available for anyone to self-assign. Default landing page.</li>
          <li><strong>My tickets</strong> -- everything assigned to you, closed ones at the bottom. A red number next to it means someone recorded a response on one of your tickets.</li>
          <li><strong>All open</strong> -- every ticket that isn&apos;t CLOSED or ARCHIVED, across all officers.</li>
          <li><strong>Overdue</strong> -- tickets past their target due date (or, for tickets from before 3 October 2026 with no target date, their old SLA date).</li>
          <li><strong>Closed</strong> -- every CLOSED or ARCHIVED ticket, across all officers, most recent first.</li>
          <li>
            <strong>Archive search</strong> -- full-text search specifically over <em>archived</em> tickets (see
            below), with checkboxes to include &quot;Not a request&quot; and Autoclose closures, which are excluded
            by default.
          </li>
        </ul>
      </section>

      <section className="section-card">
        <h2>Closed vs. Archived -- these are not the same thing</h2>
        <p>
          <strong>CLOSED</strong> is the normal end of a ticket&apos;s working life. It&apos;s still a completely
          live, visible record. For <strong>30 days</strong> after closing, any staff member can
          <strong>Reopen</strong> it (a reason is required). It goes back to its assignee as IN ACTION (or
          ALLOCATED if it has no category yet), or back to the Pool if it was never assigned. A ticket that was
          merged into another can&apos;t be reopened -- work on the ticket it was merged into instead.
        </p>
        <p>
          <strong>ARCHIVED</strong> happens later, automatically. An overnight job picks up tickets closed more
          than 30 days ago (an ADMIN can also archive on demand) and writes them out to permanent, durable files containing the full correspondence,
          notes, and metadata -- this is what actually starts the 7-year retention clock, and it&apos;s what makes
          a ticket read-only in the portal for everyone except ADMIN from that point on.
        </p>
        <p>The Closed page lists both. Archive Search only searches the ones that have actually been archived.</p>
      </section>

      <section className="section-card">
        <h2>Confidential tickets and legal hold</h2>
        <ul>
          <li>
            An HR_LEAD or ADMIN can mark a ticket <strong>confidential</strong>. Unauthorised viewers get a plain
            404, not an access-denied message -- the ticket appears not to exist to them at all.
          </li>
          <li>
            Every view of a confidential ticket is logged, including by ADMIN -- there is no &quot;break glass&quot;
            exception. The audit trail is the control.
          </li>
          <li>
            <strong>Legal hold</strong> (ADMIN only) suspends the 7-year retention purge on a ticket indefinitely,
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
          <li>Click <strong>Start action</strong> once you begin working it.</li>
          <li>Use <strong>internal notes</strong> to record progress. Notes are internal documents only -- they can never be sent outside HR.</li>
          <li>To ask the requester -- or someone else, such as their manager -- something, use <strong>Email a question</strong> (or set the Current action to <strong>Awaiting response</strong> if you asked another way). To park a ticket, set it to <strong>On Hold</strong>. An emailed reply marks the ticket <strong>Response received</strong> automatically; if they come back by phone or in person, set it yourself.</li>
          <li>When resolved, use the <strong>outcome dispatch preview</strong> to draft the resolution, check who it goes To and CC, review the exact email that will send, and confirm.</li>
          <li>Click <strong>Close -- Resolved</strong> -- this also sends the requester a short standardised closing confirmation, separate from the outcome email you already sent above.</li>
          <li>If the email turns out to be spam or genuinely not an HR matter, use <strong>&quot;Not a request&quot; close</strong> or <strong>Autoclose</strong> instead of working it -- neither notifies the requester.</li>
          <li>If the requester withdraws the request before it&apos;s resolved, use <strong>Close -- Withdrawn</strong> -- also doesn&apos;t notify the requester, since they&apos;re the one who withdrew it.</li>
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
            <tr><td>View pool / self-assign</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Assign a Pool ticket to someone else / reassign any ticket</td><td>Yes</td><td>Yes</td><td>Any ticket you can see</td></tr>
            <tr><td>Edit ticket metadata, category, business unit, priority</td><td>Yes</td><td>Yes</td><td>Any ticket you can see</td></tr>
            <tr><td>Set the current action (awaiting response, response received, action items)</td><td>Yes</td><td>Yes</td><td>Any ticket you can see</td></tr>
            <tr><td>Set target due date</td><td>Yes</td><td>Yes</td><td>Any ticket, not just your own</td></tr>
            <tr><td>Draft and send outcome, close</td><td>Yes</td><td>Yes</td><td>Assigned tickets only</td></tr>
            <tr><td>&quot;Not a request&quot; close / Autoclose / Withdrawn close</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Reopen a closed ticket (within 30 days, reason required)</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>Set / clear confidential flag</td><td>Yes</td><td>Yes</td><td>No</td></tr>
            <tr><td>View a confidential ticket</td><td>Yes (logged)</td><td>Yes (logged)</td><td>Only if granted or assigned</td></tr>
            <tr><td>Set / clear legal hold</td><td>Yes</td><td>No</td><td>No</td></tr>
            <tr><td>Reverse a status transition</td><td>Yes (step-up required)</td><td>No</td><td>No</td></tr>
            <tr><td>Soft-delete a ticket</td><td>Yes (step-up required)</td><td>No</td><td>No</td></tr>
            <tr><td>Manage users, categories, business units</td><td>Yes</td><td>No</td><td>No</td></tr>
            <tr><td>View audit log</td><td>Yes</td><td>Yes</td><td>No</td></tr>
            <tr><td>Bulk export (CSV)</td><td>Yes</td><td>Yes</td><td>No</td></tr>
          </tbody>
        </table>
        <p>
          &quot;Step-up required&quot; means you&apos;ll be asked to re-confirm your sign-in immediately before the
          action goes through -- this applies to the handful of genuinely destructive actions (reversing a
          ticket, deleting one, clearing confidential status, changing someone&apos;s role).
        </p>
      </section>

      <section className="section-card">
        <h2>Admin tasks (ADMIN only, listed here for visibility)</h2>
        <ul>
          <li><strong>Admin -- Users</strong>: create/pre-provision users, change roles, set a person&apos;s real display name, archive/restore a user.</li>
          <li><strong>Admin -- Categories</strong> / <strong>Business units</strong> / <strong>Action items</strong>: add new ones, rename existing ones, deactivate (never delete -- existing tickets keep their history either way).</li>
          <li><strong>Admin -- Legal holds</strong>: see every ticket currently under hold, oldest first.</li>
          <li><strong>Admin -- Deleted</strong>: see soft-deleted tickets (no drill-down back into them, by design).</li>
          <li><strong>Admin -- Audit log</strong>: search every recorded action by ticket number, actor, action type, date range, or correlation ID.</li>
          <li><strong>Admin -- Failed sends</strong>: any outbound email that failed after 3 attempts.</li>
        </ul>
      </section>
    </main>
  );
}
