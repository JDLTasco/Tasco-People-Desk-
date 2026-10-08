import { getSession } from "@/lib/session";

// The Procedure -- the whole process, start to finish. Moved off the
// Instructions page onto its own page (2026-10-06, John: "move procedures
// to a different section under instructions so can click on that only").
// Same access as Instructions: every signed-in role, static content.
export default async function ProcedurePage() {
  const session = await getSession();
  if (!session?.user) return null;

  return (
    <main>
      <h1>Procedure -- how Tasco People Desk works, start to finish</h1>
      <section className="section-card">
        <p>
          The whole process in order: what the system does by itself, and what you do at each point. Times are
          Melbourne time; &quot;working day&quot; means Monday to Friday, skipping the days on Admin &rarr; Calendar.
        </p>

        <h3>1. An email arrives</h3>
        <ol>
          <li>The email is checked against the <strong>Block list</strong>. If a rule matches, it is not made into a ticket; it&apos;s listed under Admin &rarr; Blocked emails.</li>
          <li>Automatic replies (out-of-office and similar) are ignored.</li>
          <li>
            If it is a reply to an existing ticket -- same email thread, or the <code>[ticket number]</code> is in
            the subject -- it is added to that ticket&apos;s correspondence. A reply to a ticket being worked marks it{" "}
            <strong>Response received</strong> and alerts the assignee. For outcome and closed tickets, see step 5.
          </li>
          <li>
            Otherwise a <strong>new ticket</strong> is created in the <a href="/pool">Pool</a> as NEW, priority P3
            (P1 if the subject says &quot;Urgent&quot;), with an automatic target due date. Known signature images
            (Admin &rarr; Ignored images) are left off. The requester gets an acknowledgement email with the ticket
            number.
          </li>
          <li>A ticket can also be logged by hand with <strong>+ New ticket</strong> (e.g. after a phone call) -- choose whether to send the acknowledgement email.</li>
        </ol>

        <h3>2. Triage -- take ownership and set it up</h3>
        <ol>
          <li>Check the <a href="/pool">Pool</a> regularly (the Dashboard you land on shows how many are waiting). Open a ticket and read it.</li>
          <li>If it isn&apos;t an HR matter: <strong>Close -- Info only</strong> (for information only, or sent to the wrong address) or <strong>Close -- Autoclose</strong> (spam). Both archive straight away and send nothing. An Admin can use <strong>Block this sender</strong> for repeat junk from outside Tasco.</li>
          <li>If it duplicates another ticket: <strong>Merge into another ticket</strong> (see &quot;The ticket lifecycle&quot;).</li>
          <li>Otherwise <strong>Claim</strong> it, or <strong>Assign to</strong> a colleague. It becomes ALLOCATED.</li>
          <li>Set the real <strong>Priority</strong>, a <strong>Category</strong> (required before work can start) and a <strong>Business unit</strong> if relevant. The target due date follows the priority: P1 3, P2 10, P3 20 working days from arrival. Override it, with a reason, only for a real external deadline.</li>
        </ol>

        <h3>3. Work the ticket</h3>
        <ol>
          <li>Click <strong>Start action</strong> -- it becomes IN_ACTION.</li>
          <li>Record what you do as <strong>internal notes</strong> (never sent outside HR).</li>
          <li>Need information? <strong>Email a question</strong> (to the requester, or change To to ask someone else) -- the ticket becomes Awaiting response. Asked another way? Set Current action to <strong>Awaiting response</strong>.</li>
          <li>When they answer: an emailed reply sets <strong>Response received</strong> and alerts you automatically; for a phone call or conversation, choose Response received and type what they said.</li>
          <li>Waiting on something else? Set an action item such as <strong>On Hold</strong>, with the reason. The due date keeps running.</li>
          <li>Handing over? Anyone can <strong>Reassign</strong> -- including picking yourself to take over a colleague&apos;s ticket.</li>
          <li>Leaving the ticket for now? <strong>Save &amp; exit</strong> saves everything unsaved; <strong>Cancel</strong> leaves without saving.</li>
        </ol>

        <h3>4. Resolve it</h3>
        <ol>
          <li>Click <strong>Send outcome to employee</strong>, write the outcome, check To and CC, review the email and confirm. The ticket becomes OUTCOME.</li>
          <li>If the requester withdraws before then, use <strong>Close -- Withdrawn</strong> instead (no email).</li>
        </ol>

        <h3>5. After the outcome -- reply windows (automatic)</h3>
        <ol>
          <li><strong>OUTCOME:</strong> the requester has 2 working days to reply. Example: outcome sent Thursday 3pm &rarr; the window ends Monday 3pm.</li>
          <li><strong>A reply inside the window</strong> reopens the ticket automatically -- back to its assignee as Response received, with the alert. Carry on from step 3.</li>
          <li><strong>No reply:</strong> the overnight job closes it (Closed -- Resolved, dated when the window ended). You can also close it yourself any time with <strong>Close -- Resolved</strong>, which sends a short closing confirmation.</li>
          <li><strong>CLOSED:</strong> a second window of 2 working days. A reply in it reopens the ticket the same way; staff can also <strong>Reopen</strong> it by hand, with a reason.</li>
          <li><strong>No reply again:</strong> the overnight job <strong>archives</strong> it -- it is written to the permanent record and becomes read-only, and the 7-year retention period starts.</li>
          <li><strong>A reply after that</strong> (or to an archived ticket) starts a <strong>new ticket</strong> in the Pool, with a note &quot;Follow-up to ticket &hellip;&quot; so the history is one click away. Replies to Info only or Autoclose tickets always start a new ticket; replies to a merged ticket go to the ticket it was merged into.</li>
        </ol>

        <h3>6. What runs by itself</h3>
        <ul>
          <li><strong>01:00 nightly</strong> -- closes OUTCOME tickets whose window has ended, then archives CLOSED tickets whose window has ended (and Info only / Autoclose tickets straight away). The deadlines are exact; the job runs once a night, so a ticket can close or archive up to a day after its window ends. A reply after the window still makes a new ticket.</li>
          <li><strong>02:00 daily</strong> -- removes archived records whose 7-year retention has ended, unless they are on legal hold.</li>
          <li><strong>06:00 daily</strong> -- overdue escalation: one reminder a day for a ticket past its due date (at most three per ticket); overdue tickets nobody has taken go to the HR Lead.</li>
          <li><strong>Every 15 minutes, once the mailbox connection is switched on</strong> -- picks up new emails. Until then, press <strong>Check mailbox</strong> (the orange button at the top of every page) to bring them in.</li>
        </ul>

        <h3>7. Routine checks</h3>
        <ul>
          <li><strong>Every day:</strong> the Pool, your <strong>My tickets</strong> (a red number means a response came in), and <strong>Overdue</strong>.</li>
          <li><strong>Every week:</strong> the <strong>Dashboard</strong> -- workload, overdue tickets and the on-time rate.</li>
          <li><strong>Month and quarter end:</strong> the Dashboard with <strong>Last month</strong> or <strong>Last quarter</strong> chosen (or your own From/To dates) for reporting.</li>
          <li><strong>Admins, weekly:</strong> Admin &rarr; Failed sends and Blocked emails (if anything was wrongly blocked, switch the rule off).</li>
          <li><strong>Admins, yearly:</strong> add next year&apos;s public holidays and shutdown days on Admin &rarr; Calendar.</li>
        </ul>
      </section>
    </main>
  );
}
