# Upgrade v5: Plan (your shared calendar)

What's new:
- **Plan tab.** A shared calendar for you, your partner, or both of you. Events can be one-off or repeat weekly, every 2 weeks, or monthly. They can be all-day or have a start and end time, a location, and notes.
- **"I went" earns +10 Stars.** You can tap it once the event starts, until 4 a.m. the next morning. On a shared plan, one tap gives **+10 each**.
- **Reminder 1 hour before** each timed event.
- **A heads-up when your partner adds a plan** for you or for both of you.
- **Today's plans** show at the top of Today, with an "I went" button right there.
- **"See all tasks"** button on Today. The All tab is gone from the bottom bar, and Plan takes its spot.
- **iPhone Calendar:** your plans can also appear in the iPhone's Calendar app. Set it up in ⚙ Settings → Calendar.
- **Groceries:** "Got everything" now pays a flat **10 Stars** per order (still 2 orders a day).
- **Fixes** (if you skipped 4.1 and 4.2):
  - The tab bar stays at the bottom on iPhone.
  - The + button tucks away while you scroll down.
  - Room markers no longer cover placed items.

Time needed: about 10 minutes. Nothing is lost.

> **Order:** database (2) → notification sender (3) → app files (4).

---

## 1. Back up

Go to **⚙ Settings → Export backup**.

## 2. Upgrade the database

1. Go to **Supabase → SQL Editor → New query**.
2. Paste everything from `supabase/005_calendar.sql` and click **Run**. If the warning appears, click **Run query**.
3. You should see *Success. No rows returned.*

The scheduler already runs every 5 minutes (from v4), so the 1-hour reminders need nothing else.

## 3. Update the notification sender

1. Go to **Supabase → Edge Functions → notify → Code**.
2. Select all of the code, delete it, and paste everything from `supabase/functions/notify/index.ts`.
3. Click **Deploy**.
4. Check that **Verify JWT** is still **off**. The iPhone Calendar feed depends on it.

## 4. Upload the app files to GitHub

1. Go to **Add file → Upload files**.
2. Drag in these files:
   - `index.html`, `app.js`, `styles.css`, `room.js`, `version.json`
   - `README.md` and `UPGRADE-v5.md`
   - the `supabase` folder
3. Click **Commit**.

> As always, **don't upload `config.js`.**

## 5. On your phones

1. Within a minute or two of GitHub publishing, the app shows **"A new version of One Thing is ready."** Tap **Refresh**.
2. You should see **Plan** in the bottom bar, between Home and Lists.

## 6. Optional: put your plans in the iPhone Calendar app

Do this on each phone that wants it:

1. In One Thing, go to **⚙ Settings → Calendar → Add to iPhone Calendar**.
2. Tap **Subscribe**, then **Add**.

**If tapping the button doesn't open Calendar**, add it by hand:
1. In One Thing, tap **Copy link**.
2. On the iPhone, go to **Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar**. On older iOS, it's **Settings → Calendar → Accounts**.
3. Paste the link, then tap **Next → Save**.

Good to know:
- **It's read-only.** Add and change plans in One Thing, and the iPhone Calendar picks up the changes. iPhone checks about once an hour, so changes can take a little while to appear there.
- **Reminders come from One Thing**, so you won't get two.
- **The link is private, but anyone who has it can see your plans.** If it ever leaks, tap **Reset link**. Then remove the old subscription from each phone and add the new link.

## 7. Quick check

- On **Plan**, tap **+**, add a test event starting 2 minutes from now for **Both of us**, and save it. Your partner should get a "Matt added a plan for you both" notification.
- Once the start time passes, the event shows **We went · +10 each** on Plan and on Today. Tap it, and the Stars go up by 20.
- Make another test event about **1 hour and 5 minutes** from now. Its reminder arrives about 5 minutes later.
- **Today** shows **See all tasks · N** at the bottom.
- Delete the test events afterwards: tap an event, then **Delete event**.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Errors mentioning `get_plan`, `save_event` or `get_today_extras` | Step 2 didn't run. Run `005_calendar.sql` again; it's safe to repeat. |
| No Plan tab | Tap **Refresh**, or close the app fully and reopen it. |
| No 1-hour reminder | Check that step 3 deployed, then look at Supabase → Edge Functions → notify → **Logs**. Reminders are sent only for events with a start time, not all-day ones. |
| iPhone Calendar says it can't verify the account | **Verify JWT** must be **off** on the notify function (step 3.4). Then add the subscription again. |
| iPhone Calendar shows old events | It refreshes about hourly. To force a refresh, open the Calendar app → **Calendars** → pull down. |
