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
            <strong>NEW</strong> -- just arrived, sitting unassigned in the <a href="/pool">Pool</a>. Anyone can
            self-assign it, or an ADMIN/HR_LEAD can assign it to someone specific.
          </li>
          <li>
            <strong>ALLOCATED</strong> -- a person now owns it. The requester automatically gets an email confirming
            this, with the ticket number, expected response time, and a note asking them to keep the ticket number
            in the subject line when they reply (see &quot;Replying to a requester&quot; below).
          </li>
          <li>
            <strong>IN_ACTION</strong> -- the assignee has started working it. <strong>A category must be set
            before a ticket can move here</strong> -- there&apos;s no way around this, by design.
          </li>
          <li>
            <strong>OUTCOME</strong> -- the resolution has been drafted and sent to the requester via the dispatch
            preview (see below). This is the only way an outcome email goes out -- there is no way to email a
            requester directly from a note.
          </li>
          <li>
            <strong>CLOSED</strong> -- the matter is finished. A ticket can also reach CLOSED directly from an
            earlier status via &quot;Not a request&quot; close (spam, wrong address, genuinely not an HR matter) or
            Autoclose (similar, kept as a separate reason purely so the two can be told apart in reporting).
          </li>
          <li>
            <strong>ARCHIVED</strong> -- happens automatically, some time after closure, via an overnight job (an
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
        <p>Standard response-time expectations by priority:</p>
        <ul>
          <li><strong>P1</strong> -- 2 days</li>
          <li><strong>P2</strong> -- 7 days</li>
          <li><strong>P3</strong> -- 30 days</li>
        </ul>
        <p>
          Priority can be changed at any time from the Metadata panel (by the assignee, an HR_LEAD, or an ADMIN) --
          changing it automatically recalculates the SLA clock.
        </p>
        <p>
          Separately, a <strong>target due date</strong> can be set on any ticket for a specific external
          deadline (a Fair Work response date, a WorkCover deadline, and similar) -- it requires a reason, and can
          only bring the deadline <em>forward</em>, never push it later than the standard SLA. Unlike most other
          fields, the target due date can be set by <strong>any signed-in staff member</strong>, not just the
          ticket&apos;s own assignee.
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
          <code>[TICKETNO]</code> survives somewhere in the subject line -- this is why the allocation email
          explicitly asks the requester to keep it there.
        </p>
      </section>

      <section className="section-card">
        <h2>Views -- where to find things</h2>
        <ul>
          <li><strong>Pool</strong> -- unassigned NEW tickets, available for anyone to self-assign. Default landing page.</li>
          <li><strong>My tickets</strong> -- everything assigned to you.</li>
          <li><strong>All open</strong> -- every ticket that isn&apos;t CLOSED or ARCHIVED, across all officers.</li>
          <li><strong>Overdue</strong> -- tickets past their effective deadline (SLA or target due, whichever is earlier).</li>
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
          live, visible record -- an ADMIN can even reverse it back to an earlier status if it was closed by
          mistake.
        </p>
        <p>
          <strong>ARCHIVED</strong> happens later, automatically. An overnight job (or an ADMIN, on demand) picks
          up CLOSED tickets and writes them out to permanent, durable files containing the full correspondence,
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
          <li>Claim a ticket (or have it assigned to you by an HR_LEAD/ADMIN).</li>
          <li>Read the request properly, then set its real <strong>Priority</strong> and <strong>Category</strong> in the Metadata panel -- category is mandatory before you can start action.</li>
          <li>Set a <strong>Business unit</strong> if relevant (optional, never blocks progress) and a <strong>target due date</strong> if there&apos;s a specific external deadline.</li>
          <li>Click <strong>Start action</strong> once you begin working it.</li>
          <li>Use <strong>internal notes</strong> to record progress -- mark a note &quot;requester-visible&quot; only if you want it available later as an option in the outcome email.</li>
          <li>When resolved, use the <strong>outcome dispatch preview</strong> to draft the requester-facing resolution, tick any requester-visible notes you want included, review the exact email that will send, and confirm.</li>
          <li>Close the ticket.</li>
          <li>If the email turns out to be spam or genuinely not an HR matter, use <strong>&quot;Not a request&quot; close</strong> or <strong>Autoclose</strong> instead of working it -- neither notifies the requester.</li>
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
            <tr><td>Reassign another user&apos;s ticket</td><td>Yes</td><td>Yes</td><td>Own tickets only</td></tr>
            <tr><td>Edit ticket metadata, category, business unit, priority</td><td>Yes</td><td>Yes</td><td>Assigned tickets only</td></tr>
            <tr><td>Set target due date</td><td>Yes</td><td>Yes</td><td>Any ticket, not just your own</td></tr>
            <tr><td>Draft and send outcome, close</td><td>Yes</td><td>Yes</td><td>Assigned tickets only</td></tr>
            <tr><td>&quot;Not a request&quot; close / Autoclose</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
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
          <li><strong>Admin -- Categories</strong> / <strong>Business units</strong>: add new ones, rename existing ones, deactivate (never delete -- existing tickets keep their history either way).</li>
          <li><strong>Admin -- Legal holds</strong>: see every ticket currently under hold, oldest first.</li>
          <li><strong>Admin -- Deleted</strong>: see soft-deleted tickets (no drill-down back into them, by design).</li>
          <li><strong>Admin -- Audit log</strong>: search every recorded action by ticket number, actor, action type, date range, or correlation ID.</li>
          <li><strong>Admin -- Failed sends</strong>: any outbound email that failed after 3 attempts.</li>
        </ul>
      </section>
    </main>
  );
}
