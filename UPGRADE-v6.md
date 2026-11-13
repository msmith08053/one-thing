# Upgrade v6: Events, Someday Together, and App Store ready

What's new:
- **New tab bar: Today · Tasks · Events · Lists · Home.** All tasks are one tap away, Plan is now **Events**, and the **Store** opens from Home.
- **Someday, Together** (on the Events tab) is a shared list of things to do together: places to eat, trips, movies, projects. **Surprise us** picks one for you, and **Let's do it** puts it on the calendar. Once you've gone, it moves to **Done together**.
- **A styled time picker** replaces the iPhone's built-in time wheel when you add an event.
- **The Done button celebrates:** a check-mark pop, the title crossed out, and the task sweeping off the card.
- **A living room:** on the Home tab the curtains sway, the clouds drift, plants move, lights twinkle at night, the cat breathes and the clock ticks. It all stops if your iPhone has **Reduce Motion** on.
- **Logo fix** for the browser tab and the home-screen icon.
- **App Store groundwork:**
  - A **Delete my account** button and in-app privacy policy and terms.
  - Support for real iPhone notifications.
  - Fonts and the database library are now part of the app instead of being downloaded each time it opens.

Time needed: about 15 minutes. Nothing is lost.

> **Order:** database (2) → notification sender (3) → app files (4).

---

## 1. Back up

Go to **⚙ Settings → Export backup**.

## 2. Upgrade the database

1. Go to **Supabase → SQL Editor → New query**.
2. Paste everything from `supabase/006_someday_store.sql` and click **Run**. If the warning appears, click **Run query**.
3. You should see *Success. No rows returned.*

## 3. Update the notification sender

1. Go to **Supabase → Edge Functions → notify → Code**.
2. Select all of the code, delete it, and paste everything from `supabase/functions/notify/index.ts`.
3. Click **Deploy**.
4. Check that **Verify JWT** is still **off**.

Nothing changes for web notifications. The Apple notification settings are added later, in `STORE-LAUNCH.md`.

## 4. Upload the app files to GitHub

This release has more files and folders than usual. Use **Add file → Upload files** and drag in **everything in this folder except `config.js`**:

- Files: `index.html`, `app.js`, `styles.css`, `room.js`, `version.json`, `manifest.webmanifest`, `privacy.html`, `terms.html`, `support.html`, `codemagic.yaml`, `README.md`, `UPGRADE-v6.md`, `STORE-LAUNCH.md`, `APP-STORE-LISTING.md`
- Folders: **`lib`**, **`fonts`**, **`native`**, **`supabase`**

Then click **Commit**.

> **The logo fix needs the `icons` folder to be on GitHub.** Check by opening `https://YOUR-USERNAME.github.io/one-thing/icons/favicon-32.png`. If you see a 404 page, upload the `icons` folder from the v4 package as well. Most likely, that's why the browser showed a globe.

> **Still not uploading `config.js`.** The one already on GitHub keeps working.

## 5. On your phones

1. Wait for **"A new version of One Thing is ready"**, then tap **Refresh**.
2. You should see **Today · Tasks · Events · Lists · Home** at the bottom.

## 6. Quick check

- **Events → Someday, Together:** add two ideas, then tap **Surprise us**.
- **Events → +:** tap **Starts**. You should see hour and minute buttons, not the wheel.
- **Today:** tap **Done** on a task and watch it sweep off.
- **Home:** the curtains move.
- **Settings:** scroll down to see **Privacy** and **Delete my account**. You don't need to try deleting.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Errors mentioning `get_someday` or `save_someday` | Step 2 didn't run. Run `006_someday_store.sql` again; it's safe to repeat. |
| The app is stuck on "Loading…" | The `lib` folder didn't upload. Check that `https://YOUR-USERNAME.github.io/one-thing/lib/supabase.js` opens (it shows a page of code). |
| Text shows in a plain system font | The `fonts` folder didn't upload. |
| Still the old tab bar | Close the app fully and reopen it, or wait for the Refresh banner. |
