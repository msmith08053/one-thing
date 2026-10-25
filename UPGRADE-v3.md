# Upgrade v3: Lists, new Pause, Do it together

What's new:
- **Shared shopping lists** (Groceries and Household) with Usual chips, a "List is ready" button, and Stars for finishing the shopping.
- **"Order groceries"** appears on both your cards when the grocery list reaches 8 items.
- **New Pause:** a panel with a note, a come-back date, and an optional replacement task.
- **Do ours together:** a shared 25-minute timer, with +5 bonus Stars each if you both finish.
- **Limited seasonal items** in the Store. Halloween is live now, then winter and spring.
- **Wallpaper and floors** in the Store under Walls & floors.
- **All tasks** is its own tab again. Add is the round **+** button, and Settings is behind the ⚙ gear.
- **Update banner:** from now on, phones show "A new version is ready. Refresh" instead of holding on to old files.

Time needed: about 10 minutes. Your tasks, Stars, room and settings all stay as they are.

> **Order:** database (2) → notification sender (3) → app files (4).

---

## 1. Back up

In the app, go to **⚙ Settings → Export backup**. In the old version, Settings is under **More**.

## 2. Upgrade the database

1. Go to **Supabase → SQL Editor → New query**.
2. Paste everything from `supabase/003_lists_pause_together.sql` and click **Run**. If the warning appears, click **Run query**. It's triggered by lines that replace older versions of a few functions; no data is touched.
3. You should see *Success. No rows returned.*

## 3. Update the notification sender

This adds the "List is ready", "Got everything" and "wants to do tasks together" notifications.

1. Go to **Supabase → Edge Functions → notify**, then open the **Code** tab.
2. Select all of the code there and delete it.
3. Paste everything from `supabase/functions/notify/index.ts`.
4. Click **Deploy**.
5. Check the function's settings: **Verify JWT** must still be **off**.

## 4. Upload the app files to GitHub

1. In your `one-thing` repo, go to **Add file → Upload files**.
2. Drag in these files:
   - `index.html`, `app.js`, `styles.css`, `room.js` (these replace the old ones)
   - `version.json` (**new**)
   - `README.md` and `UPGRADE-v3.md`
   - the `supabase` folder
3. Click **Commit changes**.

> As before, **don't upload `config.js`.** It isn't in the upgrade folder.

## 5. Load it on your phones

This is the last time you need to wait out the phone cache. Fully close One Thing, wait a few minutes, then reopen it.

You'll know it worked when the bottom bar reads **Today · Home · Lists · Store · All** and there's a round **+** button.

For future updates, you'll get a banner at the top: tap **Refresh** and you're on the new version.

---

## How the new pieces work

**Lists**
- Type several items at once, separated by commas, like "milk, eggs, 2 avocados". A number at the start (or "x2" at the end) becomes the quantity.
- **Usual** chips show things you've bought before. Tap to add one, or tap ✕ to stop suggesting it. Typing filters the chips.
- **List is ready** notifies your partner.
- Tick items as they go into the delivery cart, then tap **Got everything**. You earn **+10 Stars plus 1 per item, up to +30**, for up to 2 shopping runs a day. Your partner gets a notification. Anything not ticked stays on the list.
- Tap an item's name to edit its quantity or note, or to remove it.
- At **8+ grocery items**, an **Order groceries** task shows up for both of you. Finishing the groceries checks it off.

**Pause (⏸)**
- **Where did you leave off?** Writing a note earns **+3 Stars** (once per task per day).
- **Come back on:** Tomorrow, In 2 days, Next week (same weekday), or a date you pick. You'll get a warning if that's after the task's due date.
- **Give me a new task now** is on by default and never uses your swap.
- On the return date, **High** tasks come back on your card for sure. Others go back into the regular shuffle.
- Changed your mind? Tap **Undo** on the paused row.

**Do ours together**
- Tap the button on Today. Your partner gets "*Name* wants to do tasks together", opens the app and taps **Join**.
- A 25-minute timer runs on both phones. If you each finish a task before it ends, you both get **+5 bonus Stars**.
- Unanswered invites expire after 30 minutes. **End early** stops the timer anytime.

**Seasonal items and walls**
- **Halloween** items are available through Nov 7, **winter** items Dec 1 – Jan 6, and **spring** items Mar 20 – Apr 30. They show a **Limited** tag and are extra, on top of the weekly 8.
- **Walls & floors** items change the room's wallpaper or floor. On the Home tab, the **Wallpaper** and **Floor** buttons let you swap back, including to the original look.

## If something goes wrong

| Problem | Fix |
|---|---|
| Lists tab shows "Loading…", or errors mention `get_lists` / `pause_task` | Step 2 didn't run. Run `003_lists_pause_together.sql` again; it's safe to repeat. |
| "List is ready" or invites don't notify | Step 3 didn't deploy. Check Edge Functions → notify → Logs. |
| Still the old look | Close the app fully, wait a few minutes, then reopen. |
| "Almost there" screen | `config.js` got replaced. Re-enter your three values (README, step 6). |
