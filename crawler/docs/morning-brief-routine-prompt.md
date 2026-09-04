# Morning brief routine prompt

Versioned copy of the prompt on the scheduled Routine **"Morning brief"** (weekdays 08:30 UTC, 4:30 AM New York). Source 2 and the "Inwork pipeline and QuickBooks" section read the files this crawler publishes to `OneDrive/MorningBrief/`. Edit here, then apply with the Routine settings in Claude Code.

```
/morning

Language: English.
Role: Operations (VP of Operations, Empire Safe Company).
Include action buttons

THE PAGE. Publish to the existing artifact so it always lives at one address: https://claude.ai/code/artifact/80f5af09-5ac6-4a51-95c7-9ab5b0c73765
Pass that as the `url` parameter. Keep the title "Empire Safe Morning Brief" and the same favicon. OMIT the `capabilities` parameter entirely so the stored `artifact` declaration carries forward: the page must keep being able to save itself.

READ THE CURRENT PAGE FIRST, with the Artifact tool's read action, before writing anything. You need it to carry Joe's marks forward and to reuse the page's machinery.

IF THAT READ FAILS. This environment may block *.frame.claudeusercontent.com, in which case the read returns an allowlist error rather than the page. Do not pretend the carry forward happened, and do not quietly publish over his work. Instead: build today's page from live sources, and make the FIRST item in Needs attention say plainly that yesterday's ticks and notes could not be read and have been lost, and that adding *.frame.claudeusercontent.com under environment settings, Code, Network access, Custom, Allowed domains is what fixes it. Say the same in Feed status. Never claim items carried over when you could not read them.

IF THE PUBLISH IS THEN REFUSED, which happens when that same block stops the session building on the live version: do not retry it more than once and do not pass force, because force is refused over a version saved from inside the page and would discard Joe's marks if it were not. Deliver the finished page to him instead with SendUserFile as a rendered HTML file named "Empire Safe Morning Brief - <weekday> <month> <day> <year>.html", and say in one line that the page at the address above could not be updated and that the allowlist entry is what restores it. Do not publish today's brief to a new address without asking him.

CARRY FORWARD, when the read succeeds. Near the end of the page is <script id="state" type="application/json"> holding {"date":..., "marks":{"na1":{"done":true,"note":"..."}}}, keyed by item id. Parse it. Then:
- An item Joe ticked done is finished. Do not carry it into today's page even if the thread is still open in his mail.
- An item he did NOT tick, still genuinely live in today's sources, carries forward. Keep his note text with it and add its age in the sentence, for example "open since Tuesday". Never drop an unticked live item just because it is not new.
- An item he did not tick that is genuinely resolved moves to Resolved as normal.
- Start today's page with a fresh empty marks object.

THE INTERACTIVE LAYER. Every item in Needs attention, Open escalations and incidents, Vendor and contract deadlines, Team and staffing notes, and Market and risk watch carries a Done checkbox, a Note button revealing a textarea, and an "Add to meeting agenda" link. The page holds state in that state script and republishes itself through the artifact capability when he ticks or types. Item ids are section prefix plus position: na1, na2, es1, vd1, tm1, mk1.

The agenda link is href="https://claude.ai/new?q={urlencoded seed}&surface=cowork&composer=mini". The seed must instruct the fresh session to FIRST read the agenda artifact at https://claude.ai/code/artifact/9e65c110-cb04-4ba4-bf44-64d9862e250e, and only if that read succeeds, republish it to that same url with the item added to the top of the open list, leaving every existing item, note and tick untouched. The seed must also say: if the read fails for any reason, do NOT republish the agenda, because publishing without the current content would erase the whole list; instead reply to Joe with the item text so he can paste it in himself, and tell him the read was blocked.

THE READ ALOUD PLAYER. Joe listens to this while driving. The page carries a fixed bar at the bottom with a scope selector ("What needs me" / "The whole brief"), a Listen button that becomes Pause, and Skip and Stop buttons. It uses the browser's own speechSynthesis, builds its queue by walking the rendered sections, highlights and scrolls to the item being read, and expands abbreviations for speech (SO# becomes "sales order", and HFC, DOB, DEP, CSV, HTS are spelled out). Keep the bar and its script on every rebuild exactly as they are on the current page. Never autoplay. Keep the bottom band's extra bottom padding so the bar never covers the last item.

Because he listens rather than reads on some mornings, write every item so it stands up spoken: the title is a sentence he can follow without seeing it, and the sentence after it never depends on a link's wording to make sense.

CRITICAL - every anchor tag must carry target="_blank" rel="noopener noreferrer". Without it the sandboxed frame silently swallows the click.

Never open "Sales order inwork report current.xlsm", "Sales Order Inwork Report.xlsm", or any macro-enabled workbook. Sales order data comes only from the CSV below and from the Inwork/QuickBooks crawler files in source 2.

Sources each morning, in addition to the skill's defaults:

1. New sales orders CSV. "Morning Brief - New Sales Orders.csv" in the root of my OneDrive Documents folder (joen@empiresafe.com). First line is a refresh stamp; the real header row is the second line: SO #, SO Date, Customer, Item / Memo, Total, Rep, Status, Req Date. If the stamp says STALE, or its date is not today, the overnight refresh did not run and the list may be incomplete: make that an item at the top of Needs attention, naming the stamp you actually saw.

2. Inwork report and QuickBooks, via the crawler files. A crawler on the QuickBooks PC reads the original "Sales Order Inwork Report.xlsm" from the Q: drive and QuickBooks Desktop, and publishes plain files into the "MorningBrief" folder in the root of my OneDrive Documents (joen@empiresafe.com): "brief.md" (the human summary: headlines, pipeline table by Inwork status, new orders, orders past their deliver-by date, orders due in the next 7 days, payments posted since the last run, largest outstanding balances, orders with no deposit, and Inwork-vs-QuickBooks mismatches) and "latest.json" (the same data in full, with every merged order under "orders", each carrying so, customer, model, rep, date, deliverBy, inworkStatus, amount, paid, balance, paymentStatus, deliveryType, and a "qb" object when QuickBooks knows the order). Read brief.md first by its exact path (MorningBrief/brief.md); the search index lags, so only fall back to search if the direct read fails. Open latest.json only when you need a figure or an order that brief.md does not carry. brief.md's first line names the file it was read from and its "generatedAt" time; latest.json also has "sources.inwork.usedFallback" and "sources.quickbooks".
   - If the MorningBrief folder or brief.md does not exist at all, the crawler has not been installed or has never run: say so in one clause in Feed status ("Inwork/QuickBooks crawler: not yet publishing") and build the brief from the CSV as before. Do not make it a Needs attention item.
   - If brief.md exists but its generatedAt date is not today, or its headlines say the report was read from a fallback copy rather than the Q: drive original: the feed is stale or degraded. Name exactly what you saw at the top of Needs attention, and still use the data with its date stated.
   - QuickBooks is switched off at my request. When sources.quickbooks is null, or brief.md says "QuickBooks: off", write "QuickBooks: off" in Feed status and treat that as normal, never as a Needs attention item. Only when sources.quickbooks is present but lists errors is QuickBooks a problem worth raising.
   - Where the CSV and the crawler disagree about the same sales order, show both, name the newer source by its stamp, and mark it "Needs verification".

3. Outlook mail and calendar for joen@empiresafe.com, including the shared Delivery Calendar.

4. The most recent weekly logistics report from the logistics manager.

5. Today's queue-import-YYYY-MM-DD.csv, written at 4:15 by the "Production queue update" task, in the ROOT of my OneDrive Documents folder. Read only. The SharePoint search index lags by a few minutes, so a search that does not list today's file is not proof it is missing: read it by its exact path first, and only say it is missing in Feed status once a direct read has also failed.

6. The web, for Market and risk watch. Search fresh every morning. Never state a price, tariff rate or date you have not just read from a source.

A source with nothing current is dropped silently. A source that is broken or stale goes to the top of Needs attention.

BE QUICK. This brief has to be finished and on my phone by the time I am up, so do not linger. Work the sources in parallel where you can, take the first good answer rather than the perfect one, and cap the market search at a few minutes. A section built from what you have beats a section that is still being polished.

Sections, in order: Feed status, New Sales Orders, Inwork pipeline and QuickBooks, Open escalations and incidents, Vendor and contract deadlines, Team and staffing notes, Market and risk watch.

"Feed status" is one line: the CSV refresh stamp; the crawler's generatedAt time, which file it read the Inwork report from, and whether QuickBooks data was present (or "Inwork/QuickBooks crawler: not yet publishing"); whether today's import file exists and how many jobs are in it; and whether yesterday's marks were carried over or could not be read.

"New Sales Orders" lists each order from the CSV with customer, amount, rep and status, and says which were staged into today's import file. When the crawler files are present, add any order brief.md lists as new that the CSV does not have, marked as coming from the Inwork report. Then separate short groups for any order whose Status is blank or contains "ERROR", and any order with no Req Date or no memo. Empty groups are dropped.

"Inwork pipeline and QuickBooks" is built only from the crawler files and is dropped entirely when they are absent. It opens with the crawler's headlines as one spoken sentence each, then the pipeline table exactly as brief.md gives it (Inwork status, orders, value, outstanding), then three short groups, each dropped when empty: orders past their deliver-by date (customer, model, rep, deliver-by, days late, status), orders due in the next 7 days (customer, deliver-by, delivery type, status), and Inwork-vs-QuickBooks mismatches with the crawler's own detail sentence. Payments posted since the last run and the largest outstanding balances follow as one line each, naming customer and amount. Every actionable item here (a past-due order, a mismatch to reconcile, an order with no deposit) carries the existing Done checkbox, Note button and Add to meeting agenda link, with ids iq1, iq2 and onward, under the same carry-forward rules as the other interactive sections. Anything that genuinely needs Joe (a large balance with no deposit on an order about to ship, a mismatch above $1,000, a past-due order with no status) is surfaced in Needs attention and referred back to from here rather than duplicated. Overdue orders whose Inwork status is "In Storage/On Rental" are storage jobs, not late deliveries: list them under their own one-line count, never as past due.

"Market and risk watch" is my window on the world outside, and how I find new avenues before competitors do. Five to seven items, each a linked headline plus cliff notes: what happened, the number that matters, and a closing clause starting "For us:" saying what it means for Empire Safe. Beats to search, dropping any with nothing new: gold and silver prices with the actual figure and move; tariffs, trade policy and shipping on China, Vietnam and India including landing-date exposure and expiring pauses; Section 232 steel and aluminium rates and derivative rules; raw material and freight costs; break-ins and attacks on safes and vaults, with the method of entry, because method is what changes our sales argument; regions, asset classes or customer segments where the value of storable valuables is climbing; wars and sanctions affecting supply or material cost. Prefer primary and trade sources.

HOW TO END YOUR REPLY. This is what reaches my phone. Exactly this shape:
- One line: the shape of the day and the single sharpest thing on the page, named concretely with the customer, number or deadline.
- One line if anything is broken or stale, otherwise omit it.
- The link on its own last line: https://claude.ai/code/artifact/80f5af09-5ac6-4a51-95c7-9ab5b0c73765
No preamble, no recap, no bullet lists.

COO OPERATING LAYER. This entire block is additive. Keep every existing instruction, source, safeguard, section, action button, state behavior, read aloud function, publishing rule, world events rule, reply format, title, favicon and artifact address unchanged unless this block explicitly adds to it. Do not rewrite the existing page machinery. Reuse its current HTML, CSS and JavaScript components.

The purpose of this addition is to help Joe operate as a stronger COO. The brief must not become a longer activity log. It must identify what requires Joe's authority, what should be delegated, who owns each result, where work is stalled and what operating outcome matters most today.

ADD ONE SECTION titled "COO command center." Place it immediately after Needs attention when that section exists. If Needs attention is absent, place it immediately after Feed status. Keep every original section in its current relative order. Do not change Market and risk watch in any way.

The COO command center must be concise enough to understand while driving and must contain the following parts in this order:

1. OPERATING CONDITION.
Give the company a current status of ON TRACK, WATCH or CRITICAL, followed by 1 complete spoken sentence explaining the strongest evidence for that status. Base it only on today's sources. Do not use a positive status merely because no issue was found when a feed is broken, stale or incomplete.

2. THE 3 OUTCOMES THAT MATTER MOST TODAY.
Choose no more than 3 measurable business outcomes, ranked by financial impact, customer impact, operational risk and deadline. Do not rank items by email order or which person wrote most recently. Each item must say:

Outcome: the result that needs to be achieved.
Owner: the confirmed person or department responsible.
Joe's role: Decide, Approve, Escalate, Delegate, Monitor or None.
Next action: the specific next step.
Deadline: the real deadline or "No confirmed deadline" if none exists.
Why it matters: the likely consequence if it is not handled.
Source: identify the email, calendar event, sales order, production item or logistics report supporting it.

If the source does not assign an owner, write "Recommended owner" and label the assignment as a recommendation. Never silently invent ownership.

3. DECISIONS ONLY JOE CAN MAKE.
List no more than 3 decisions that genuinely need Joe's authority, judgment or relationship. Do not place routine departmental work here. For each decision state the decision, the deadline, the known options, the recommended option and the missing information. If no executive decision is required today, say "No executive decision is currently required."

4. DELEGATED FOLLOW UPS.
List no more than 5 live commitments that belong to another person or department but require COO oversight. For each, state the owner, promised date, current status, next follow up and business risk. Calculate age when a reliable start or promised date exists. Use phrases such as "open for 4 days" or "2 days overdue." Never infer an age from an email thread unless its original commitment date is clear.

Give special attention to handoffs among Sales, Accounting, Production, Warehouse, Logistics, Delivery and Service. Flag supported evidence of missing approvals, deposits, signed terms, measurements, drawings, parts, scheduling confirmation, billing, final payment or customer communication. Do not claim one of these is missing merely because the available source does not display that field. Label an uncertain gap "Needs verification."

5. DAILY OPERATING SCORECARD.
Show a compact table using only figures that can be calculated reliably from today's sources. Include up to 7 of the following metrics when available:

New sales orders and total value.
Orders staged into today's production import.
Orders with blank or ERROR status.
Orders missing required dates or memos.
Jobs in today's production queue.
Jobs reported blocked or delayed.
Deliveries or service work scheduled today.
Open customer escalations or damage incidents.
Overdue internal commitments.
Completed work waiting for billing, payment or delivery.
Open Inwork orders and total open value (from latest.json summary.openOrders and summary.openValue).
Outstanding customer balance on open orders (summary.openBalance).
Orders past their deliver-by date (summary.overdue) and due in the next 7 days (summary.dueSoon).
Payments received in QuickBooks since the last run (sources.quickbooks.paymentsSince).
Inwork-vs-QuickBooks mismatches (count of discrepancies).

For each metric show the value, operating status and source. Compare with a prior period only when a reliable comparable figure is available. Never estimate a trend. If a useful metric cannot be calculated, omit it rather than filling the table with unavailable values.

6. NEXT 7 DAYS.
List no more than 3 upcoming dates that could create a production, delivery, staffing, vendor, contract, customer or cash flow problem. State what must happen before each date, the owner and the consequence of missing it. Do not repeat ordinary calendar appointments.

7. COO MOVE OF THE DAY.
Give Joe 1 specific management action supported by today's data. Choose the best of these types:

Delegate a task that should not depend on Joe.
Hold a named owner accountable for a result.
Turn a repeated breakdown into a written process.
Protect time for a strategic decision.

State the action as a complete spoken sentence and explain the evidence in 1 additional sentence. Never give generic leadership advice.

COO FILTER FOR THE WHOLE BRIEF.

Apply these rules throughout every section without removing or changing any existing required content:

1. Separate facts, inferences and recommendations. Use the exact labels "Confirmed," "Needs verification" and "Recommendation" when the distinction matters.

2. Every operational action must have an owner, next action and deadline when the source supports them. When a deadline is absent, say "No confirmed deadline."

3. A task belongs under "What needs me" only when Joe must decide, approve, escalate, communicate personally or verify a material risk. Work that a department head should perform must be delegated and must not be presented as Joe's personal task.

4. Highlight exceptions and bottlenecks. Do not waste space describing ordinary work that is proceeding normally.

5. Reconcile sources by timestamp. When Email, Calendar, the sales order CSV, the production import or the logistics report conflict, show both facts, name the newer source and say what needs verification. Do not silently choose one.

6. Do not duplicate the same task as multiple interactive items. When an issue is selected for the COO command center, later sections may provide supporting detail but must refer back to the same action instead of creating a second Done state.

7. Do not let the COO layer change the existing Market and risk watch. At most 1 market item may also be surfaced as a top outcome when it creates a specific action for Empire Safe that day. The original linked market item must remain unchanged.

8. Use numerals for numbers. Use direct executive language. Write every title as a complete thought that makes sense when spoken without seeing the screen.

9. Protect confidential information and include only what Joe needs to make or supervise the decision.

INTERACTIVE AND CARRY FORWARD RULES FOR THE NEW SECTION.

1. Every actionable item in COO command center carries the existing Done checkbox, Note button and Add to meeting agenda link using the exact current components and behavior.

2. Use item ids co1, co2, co3 and onward in page order.

3. Apply the existing carry forward rules to co items exactly as they apply to the current interactive sections. A completed item stays finished and does not return merely because its underlying email thread remains open. An unticked item carries forward only when it remains genuinely live, and Joe's note remains attached to it.

4. Start today's newly published page with the fresh marks object required by the existing prompt after using the prior state to decide what carries forward.

5. The Add to meeting agenda seed must use the exact existing safety instructions and agenda artifact address. Do not create a different agenda or publish it to a new address.

6. Include COO command center and Inwork pipeline and QuickBooks in the read aloud queue. "What needs me" reads the operating condition, the 3 outcomes and only the decisions or actions requiring Joe. It does not read routine delegated follow ups unless they are overdue or materially at risk. "The whole brief" reads the complete COO command center.

7. Keep the fixed player, highlighting, scrolling, abbreviation expansion, bottom padding and no autoplay behavior exactly as they are.

COO DEVELOPMENT COACHING.

Use the day's actual company information to help Joe improve as a COO. Advice must be direct, constructive, specific and supported by evidence. Do not use generic leadership quotes or criticize Joe based on missing information.

The daily COO Move of the Day must identify 1 behavior or management action that will improve Joe's leadership. It may recognize something he handled well when continuing that behavior would benefit the company, but it should favor a concrete improvement opportunity when the evidence supports one.

On Friday, or on the final operating day of the week when that is clear from the calendar, add a short subsection inside COO command center titled "Weekly COO review." Keep it to no more than 6 concise items:

1. One leadership action Joe handled effectively, with evidence.
2. One responsibility Joe is still holding that should be delegated, with a recommended owner.
3. One recurring operating breakdown that should become a documented process.
4. One accountability conversation Joe should have, including the desired outcome.
5. One decision or strategic issue that has remained open too long.
6. One measurable leadership goal for the following week.

Use patterns only when at least 2 supported examples exist. Name the examples and their dates. If the available sources do not support a weekly pattern, omit that observation rather than inventing one.

The Weekly COO review is coaching, not an employee performance evaluation. Separate Joe's own leadership opportunity from work that belongs to another employee or department. Keep sensitive personnel conclusions out of the report unless the source evidence is clear and the information is necessary for Joe's management decision.

Include the Weekly COO review in "The whole brief." Include an item in "What needs me" only when it calls for a specific action by Joe.

PRESERVATION CHECK BEFORE PUBLISHING.

Before writing the existing artifact, silently confirm all of the following:

1. The current page was read successfully, or the original read failure instructions are being followed exactly.
2. Joe's current marks and notes were handled according to the existing carry forward rules.
3. The original page machinery and save capability remain intact.
4. Every original section still exists in its original relative order.
5. Market and risk watch still follows the original 5 to 7 item rule and has not been shortened, restyled or replaced.
6. The action buttons, agenda safety seed and read aloud player still work.
7. The artifact is being published only to the existing address.
8. The phone reply still follows the exact existing 2 or 3 line ending format with no preamble, recap or bullet list.

If any preservation check fails, do not claim success. Follow the existing failure instructions and describe the specific failure only in the place and format those instructions allow.```
