# Upgrade v4: launch-ready foundation

What's new:
- **Households.** The app can now hold many separate, private households. Yours is moved over automatically, and you each stay signed in.
- **Household codes replace the passcode.** Your partner (or a new phone) joins with your household's code, found in ⚙ Settings, and you can make a new code anytime.
- **Pins.** Keep up to 3 tasks on your card until they're done. Urgent tasks no longer flood the card; they jump the line for your one thing instead. A task due today shows a **Pin it** prompt.
- **How it works** page and a **first-run tour** (⚙ Settings → Help).
- **New logo** on the home screen icon and the browser tab.
- **Fixes:**
  - Paused tasks no longer appear in the 7 p.m. reminder.
  - Stars can't go below zero.
  - No double reward for "Order groceries".
  - Swapping a shared task only hides it for you.
  - Wall-display adds count toward the list owner's daily cap.
  - Backup now includes your shopping lists.
  - A **"Time's up!"** notification when a Do-it-together timer ends.

Time needed: about 10 minutes. Nothing is lost.

> **Order:** database (2) → notification sender (3) → app files (4).

---

## 1. Back up

Go to **⚙ Settings → Export backup**.

## 2. Upgrade the database

1. Go to **Supabase → SQL Editor → New query**.
2. Paste everything from `supabase/004_households_pins.sql` and click **Run**. If the warning appears, click **Run query**.
3. You should see *Success. No rows returned.*

This also switches the notification schedule from hourly to **every 5 minutes**, which the "Time's up" alert needs. You don't need to edit `cron.sql`. The 7 a.m. and 7 p.m. messages still go out once a day each.

## 3. Update the notification sender

1. Go to **Supabase → Edge Functions → notify → Code**.
2. Select all of the code, delete it, and paste everything from `supabase/functions/notify/index.ts`.
3. Click **Deploy**.
4. Check that **Verify JWT** is still **off**.

## 4. Upload the app files to GitHub

1. Go to **Add file → Upload files**.
2. Drag in these files:
   - `index.html`, `app.js`, `styles.css`, `room.js`, `version.json`
   - the **`icons` folder** (it has the new logo files)
   - `README.md` and `UPGRADE-v4.md`
   - the `supabase` folder
3. Click **Commit**.

> As always, **don't upload `config.js`.**

## 5. On your phones

1. Within a minute or two of GitHub publishing, the app shows **"A new version of One Thing is ready."** Tap **Refresh**.
2. Open **⚙ Settings**. You'll see your **household code** at the top. Keep it somewhere safe, like in a note. If a phone is ever lost or reset, open One Thing on the new phone, tap **I have a code**, and you're back in.
3. **The home-screen icon:** iPhones keep the old icon until you re-add the app. That's optional: if you want the new logo on your home screen, delete the icon, then re-add it from Safari (**Share → Add to Home Screen**). After that, join again with your household code and turn notifications back on in Settings.

## 6. Quick check

- Each card shows a pin counter, like **0/3**.
- Tap the pin icon on your task, and it moves to **Pinned**.
- ⚙ Settings shows your household code and a **How it works** button.
- The browser tab shows the new house-and-check icon.

---

## For later: before you invite other couples

- **Bot protection.** Turn on Supabase's free bot check (CAPTCHA) for sign-ins. Strangers can't see anything without a code, but this stops bots from creating junk accounts.
- **Email sign-in** for account recovery, planned for launch prep.
- **Paid plan.** Supabase's free plan pauses after a week of no use and has no automatic backups. Move to Pro (about $25/month) when real users arrive.

## If something goes wrong

| Problem | Fix |
|---|---|
| Errors mentioning `household`, `pin_task` or `create_household` | Step 2 didn't run. Run `004_households_pins.sql` again; it's safe to repeat. |
| The app shows "Start a household" on a phone that was already set up | That phone's sign-in was lost. Tap **I have a code** and enter your household code from the other phone's Settings. |
| No 7 a.m. message the next day | Check Supabase → Edge Functions → notify → **Logs**, and that step 3 deployed. |
| Still the old look | Close the app fully and reopen it, or wait for the Refresh banner. |
