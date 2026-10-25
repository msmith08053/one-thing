# Upgrade: "Our Home"

This update adds:
- **The room:** a shared home that grows as you level up.
- **Stars, XP and 10 levels**
- **The Store:** 8 items, restocked every Monday.
- **Storage and swapping**
- **Pause** with "left off" notes
- **Evening mode** after 7 p.m.
- **Celebrations** on check-off and level-up
- **The new cozy look** on every screen

Time needed: about 10 minutes. Your tasks, names, passcode and notifications all stay as they are.

> **Order matters:** do the database step (2) **before** uploading the app files (3). The new app needs the new database pieces.

---

## 1. Make a backup (1 minute)

In the app, go to **Settings → Export backup** and save the file. You'll probably never need it, but it costs nothing.

## 2. Upgrade the database (2 minutes)

1. Go to **Supabase → SQL Editor → New query**.
2. Open `supabase/002_our_home.sql` from the upgrade folder, copy **everything**, and paste it in.
3. Click **Run**. If the "destructive operation" warning appears, click **Run query**. The warning is triggered by `drop policy if exists` lines that replace access rules; no data is touched.
4. You should see *Success. No rows returned.*

## 3. Upload the new app files to GitHub (5 minutes)

1. Open your `one-thing` repository on github.com.
2. Click **Add file → Upload files**.
3. Drag in these files from the upgrade folder:
   - `index.html` (replaces the old one)
   - `app.js` (replaces)
   - `styles.css` (replaces)
   - `room.js` (**new**)
   - `README.md` and `UPGRADE.md`
   - the `supabase` folder (adds `002_our_home.sql` for your records)
4. Click **Commit changes**.

> **Do not upload `config.js`.** Your live copy holds your Supabase keys. The upgrade folder deliberately doesn't include it, so you can't overwrite it by accident.

## 4. Load it on your phones (2 minutes)

1. Wait 1–2 minutes for GitHub to publish.
2. On each iPhone, fully close One Thing: swipe up from the bottom, then swipe the app away. Then open it from the home-screen icon.
3. You should see the new look and five tabs at the bottom: **Today · Home · Add · Store · More**.

Still seeing the old version? GitHub can cache for up to 10 minutes. Wait a bit, then close and reopen again.

## 5. Quick check

- **Home** shows an empty room, **Level 1**, and **0 Stars**. Everyone starts fresh, as decided.
- **Add** a task, and the Stars counter goes to 1.
- Check a task off, and you get a **+10 Stars!** burst.
- The first piece of furniture, the **Sunny window**, arrives at level 2 (60 XP).

---

## How Stars, XP and levels work

| You… | Stars & XP |
|---|---|
| Add a task | +1 (up to 5 a day each) |
| Finish a Normal or Low task | +10 |
| Finish a High task | +15 |
| Finish a task that waited | +1 per day it waited, up to +5 more |
| Undo a check-off | the Stars come back off |
| Buy something | spends Stars; XP never goes down |

**Levels** are shared by the household:

| Level | XP needed | It brings |
|---|---|---|
| 2 | 60 | Sunny window |
| 3 | 150 | Round rug |
| 4 | 280 | Mint sofa |
| 5 | 450 | Leafy plant |
| 6 | 660 | Floor lamp |
| 7 | 920 | Sunny hills print |
| 8 | 1,230 | Wall clock |
| 9 | 1,600 | String lights |
| 10 | 2,050 | Coffee table |

- If something you bought is already in that item's spot, the level reward goes to **Storage** instead. Nothing ever replaces your choices.
- **The Store** shows 8 items each week, and restocks every Monday. Items one level above yours show as locked, so you can see what's coming.
- **Storage:** buying something for a filled spot moves the old piece to Storage. Tap any spot in the room, or the **Storage** button, to swap pieces back anytime.
- **Pause** (⏸) keeps a task on your card with a note about where you left off. It doesn't use your swap.

## If something goes wrong

| Problem | Fix |
|---|---|
| Home or Store says "Loading…" forever, or an error mentions `get_home` | Step 2 didn't run. Run `002_our_home.sql` again; it's safe to repeat. |
| Old look still showing | Wait up to 10 minutes, then fully close and reopen the app. |
| "Almost there" screen | `config.js` got replaced. Re-enter your three values (README, step 6). |
| Want to go back to the old version | Re-upload the old `index.html`, `app.js` and `styles.css`. The database additions don't affect the old app. |

You don't need to change anything in Edge Functions or the notification schedule for this update.
