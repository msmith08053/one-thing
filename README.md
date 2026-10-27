# One Thing

One task each, every day. A shared to-do app for two people with ADHD: you can dump everything into it, but it only ever shows you one thing at a time.

**Phase 1** (this) is the iPhone app. Phase 2 puts the same app on the Raspberry Pi wall display.

---

## How it works

- **Add** anything, for yourself, your partner, or both of you. Tap 🎤 on the keyboard to dictate.
- **Today** shows each of you **one** task. The day resets at **4 a.m.**
  - **Urgent tasks show all at once.** A task is urgent if it's High priority, overdue, or due within 2 days.
  - Otherwise you get one Normal or Low task. The order is Normal before Low, then soonest due date, then random.
  - Unfinished tasks **stay** on your card day after day until they're done.
  - **✓** = done (with a few seconds to undo). **✗** = "not today," which uses your **one swap per day**. The task goes back in the pile.
  - After you finish, **Give me another** gives you one more.
  - After 3 days on your card, a task offers to be **broken into a smaller first step**.
- **Plan** is your shared calendar: plans for you, your partner, or both of you. You get a reminder 1 hour before, and **I went** earns +10 Stars. Plans can also show in the iPhone Calendar app (Settings → Calendar).
- **Our Home:** every task earns Stars and XP. Levels add furniture to a shared room, and the Store (8 items, new every Monday) lets you pick more. **Pause** (⏸) saves a "left off" note without using your swap. See `UPGRADE.md` for the full table.
- **Notifications:**
  - 7 a.m.: your task(s) for today.
  - 7 p.m.: only if something's still open.
  - When your partner adds something to your list.
  - When your partner finishes one 🎉.
  - 1 hour before a plan, and when your partner adds a plan for you.

---

## Setup (about 45 minutes, once)

You need a computer for steps 1–8 (any computer with a web browser), then your iPhones.

### 1. Create the database (Supabase, free)

1. Go to **supabase.com** → sign up → **New project**.
2. Name it `one-thing`. Pick any strong database password (save it somewhere). For region, pick **East US**. Click **Create**, then wait about 2 minutes.
3. Left sidebar → **Authentication** → **Sign In / Providers** (on some versions it's under *Settings*). Turn on **Allow anonymous sign-ins** → **Save**.
   > This lets each phone get its own sign-in without email. Your **household code** (step 9) is what actually keeps strangers out.

### 2. Load the database setup

1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this folder, copy **everything**, and paste it in.
3. Click **Run**. You should see *Success. No rows returned.*
4. Do the same with `supabase/002_our_home.sql`, then `003_lists_pause_together.sql`, then `004_households_pins.sql`, then `005_calendar.sql` (in that order).

### 3. Make your notification keys

1. On your computer, double-click `tools/make-keys.html` to open it in your browser.
2. Click **Generate keys**. Keep this tab open; you'll copy from it in the next steps.

### 4. Add the notification sender

1. Supabase left sidebar → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly: `notify`
3. Delete the sample code. Paste in everything from `supabase/functions/notify/index.ts`, then click **Deploy**.
4. Open the function's settings and turn **off** **Verify JWT** (sometimes labeled *Enforce JWT verification*), then save. The function checks who's calling by itself.
5. **Edge Functions** → **Secrets** → add these four:

   | Name | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | from make-keys page |
   | `VAPID_PRIVATE_KEY` | from make-keys page |
   | `VAPID_SUBJECT` | `mailto:` + your email, e.g. `mailto:you@gmail.com` |
   | `CRON_SECRET` | from make-keys page |

### 5. Schedule the 7 a.m. / 7 p.m. notifications

1. Find your **project ref**: it's the code in your project URL, `https://THIS-PART.supabase.co`. You'll also find it under **Project Settings → General**.
2. Open `supabase/cron.sql`. Replace `YOUR-PROJECT-REF` and `YOUR-CRON-SECRET` with your values.
3. Paste it into **SQL Editor** → **Run**.

### 6. Point the app at your database

Open `config.js` in any text editor (Notepad is fine) and fill in three values:

- `SUPABASE_URL`: from **Project Settings → API** (or *Data API*), the Project URL.
- `SUPABASE_KEY`: from **Project Settings → API Keys**, the **Publishable** key (starts `sb_publishable_`). If you only see legacy keys, use the **anon public** key.
- `VAPID_PUBLIC_KEY`: from the make-keys page.

> These three values are meant to be public. **Never** paste the *secret* / *service_role* key or the VAPID **private** key into this file.

### 7. Put the app online (GitHub Pages, free)

1. On github.com → **New repository** → name `one-thing` → **Public** → **Create**.
2. Click **uploading an existing file**. Drag in everything **inside** this folder: the files *and* the `icons`, `supabase` and `tools` folders. → **Commit changes**.
3. Repo **Settings** → **Pages** → *Source*: **Deploy from a branch** → Branch **main**, folder **/ (root)** → **Save**.
4. Wait 1–2 minutes. Your app is at **`https://YOUR-GITHUB-USERNAME.github.io/one-thing/`**

### 8. Quick check on the computer

Open that link. You should see **Set up your household**. If you see *Almost there*, `config.js` wasn't filled in. If you see *Can't sign in*, redo step 1.3.
**Don't set up the household on the computer.** Do it from your phone in step 9.

### 9. Your iPhone

1. Open the link in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Open **One Thing from the new home-screen icon.** This matters: iPhone only allows notifications from the icon, not from Safari.
4. Tap **Start a household** and enter your name and your partner's. You'll get a **household code**. Save it somewhere, since it's also how you get back in on a new phone.
5. Go to **Settings** → **Turn on notifications** → **Allow** → **Send a test**. You should get a notification within a few seconds.

### 10. Her iPhone

Same as step 9, but tap **I have a code**, enter the household code, then pick her name. Then turn on notifications and send a test.

### 11. Test the scheduled notifications (optional)

In Supabase **SQL Editor**, run this with your values swapped in. It sends the morning notification right now:

```sql
select net.http_post(
  url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR-CRON-SECRET'),
  body    := '{"event":"tick","force":"morning"}'::jsonb
);
```

Change `morning` to `evening` to test the 7 p.m. one. You'll only get it if a task is still open.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Can't sign in" | Step 1.3: turn on anonymous sign-ins. |
| No "Turn on notifications" button | You opened it in Safari. Open it from the home-screen icon instead. |
| Test says "No subscription found" | Tap **Turn on notifications** again from the home-screen app. |
| Test fails with an error | Check that all 4 secrets are set (step 4.5) and that Verify JWT is **off** (step 4.4). Supabase → Edge Functions → notify → **Logs** shows the exact error. |
| No 7 a.m. notification | Run the test in step 11. If that works, check SQL Editor: `select * from cron.job_run_details order by start_time desc limit 5;` |
| Notifications stopped after a while | iOS occasionally drops web-app subscriptions. Open the app (it re-registers automatically). If that doesn't work, use Settings → Turn on notifications. |
| Changed `config.js` but the phone still shows old values | Close the app fully (swipe up) and reopen it. |
| "Too many tries" | That device entered a wrong household code 10 times in an hour. Wait an hour. |

## Good to know

- **Keep it alive:** Supabase's free tier pauses a project after 7 days with no use. Normal daily use prevents that, and in Phase 2 the always-on wall display guarantees it. If it ever pauses, click **Restore project** in Supabase.
- **Backups:** Settings → **Export backup** saves all your tasks to a file. Do it once a month or so.
- **Updating the app:** edit a file on GitHub (pencil icon) → **Commit**. On the phones, close and reopen the app.
- **Privacy:** the app's code is public on GitHub, but your tasks aren't. Only devices that joined with your household code can read or change them.

## Files

```
index.html, styles.css, app.js   the app
room.js                          the room and all furniture art
config.js                        your Supabase + key settings (step 6)
sw.js, manifest.webmanifest      make it installable + receive notifications
icons/                           home-screen icon
supabase/schema.sql              database setup (step 2)
supabase/002_our_home.sql        Our Home upgrade: Stars, levels, Store (step 2.4)
supabase/003_lists_pause_together.sql  Lists, new Pause, together timer, seasonal + walls
supabase/004_households_pins.sql Households + join codes, pins, fixes
supabase/005_calendar.sql        Plan: events, I went, reminders, calendar feed
version.json                     tells phones a new version is out (bump it with each update)
supabase/functions/notify/       notification sender (step 4)
supabase/cron.sql                7 a.m. / 7 p.m. schedule (step 5)
tools/make-keys.html             key generator (step 3)
```

## Updates

- `UPGRADE.md`: Our Home (Stars, levels, Store)
- `UPGRADE-v3.md`: Lists, new Pause, Do it together, seasonal items, walls & floors
- `UPGRADE-v4.md`: households and codes, pins, How it works, new logo, fixes
- `UPGRADE-v5.md`: Plan (shared calendar), See all tasks, flat grocery Stars

## Roadmap

- **Phase 2: Raspberry Pi wall display.** Full-screen kiosk mode, always on, dims from 10 p.m. to 6 a.m. Same app, logged in as "Shared screen."
- **Our Home, next:** weekly team goal (being designed), new rooms after level 10.
- **Phase 3:** a Siri Shortcut ("Hey Siri, add to One Thing") and recurring tasks.
