# Putting One Thing on the iPhone App Store

You don't need a Mac. Codemagic builds the app on a cloud Mac and sends it to Apple, and everything else happens in a web browser.

**Realistic timeline:**
- **Weekend:** accounts set up, a test build on both your phones (TestFlight), and the app submitted for review.
- **Early next week:** Apple reviews most apps within about 48 hours, so it's live once approved.

Do these in order. Steps marked **(wait)** can take minutes to a day, so start them early.

---

## 0. Before you start

- [ ] **v6 is deployed** (`UPGRADE-v6.md`), including `006_someday_store.sql` and the new notify code.
- [ ] **Pick the name.** It has to be unique on the App Store, and you'll set it in three places (step 9).
- [ ] **Pick a support email** for the privacy, terms and support pages. Replace `SUPPORT-EMAIL` in `privacy.html`, `terms.html` and `support.html` on GitHub (pencil icon → edit → Commit). A free address just for the app is fine.
- [ ] **Pick a bundle ID.** It's a permanent ID like `com.yourname.onething`: lowercase, no spaces, and it can't change after launch. Put it in place of `com.YOURNAME.onething` in two files on GitHub:
  - `native/capacitor.config.json`
  - `codemagic.yaml`

  Also do a search-and-replace in `native/ios/App/App.xcodeproj/project.pbxproj` (it appears twice).

## 1. Join the Apple Developer Program (wait)

1. Go to **developer.apple.com/programs** → **Enroll**, then sign in with your Apple ID.
2. Enroll as an **Individual**. It's $99 a year.
3. Approval usually takes a few hours to 2 days. You'll get an email.

## 2. Register the app's ID, with notifications turned on

1. Go to **developer.apple.com/account** → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
2. Choose **App IDs** → **App**, then **Continue**.
3. **Description:** One Thing. **Bundle ID:** Explicit, with the bundle ID from step 0.
4. Under **Capabilities**, tick **Push Notifications**.
5. Click **Continue**, then **Register**.

## 3. Make the notification key (.p8)

1. Still in Certificates, Identifiers & Profiles, go to **Keys** → **+**.
2. **Name:** One Thing push. Tick **Apple Push Notifications service (APNs)**.
3. Click **Continue**, then **Register**.
4. Click **Download**. Apple lets you download it **only once**, so keep the `.p8` file somewhere safe.
5. Write down the **Key ID** (10 characters, shown on that page).
6. Write down your **Team ID** (top right of the page, under your name; also 10 characters).

## 4. Give the notify function the Apple notification secrets

1. Go to **Supabase → Edge Functions → Secrets**.
2. Add these four:

| Name | Value |
|---|---|
| `APNS_KEY` | Open the `.p8` file in Notepad, copy **everything** (including the BEGIN/END lines), and paste it |
| `APNS_KEY_ID` | The Key ID from step 3 |
| `APNS_TEAM_ID` | Your Team ID |
| `APNS_BUNDLE_ID` | Your bundle ID |

> These are secret. They only ever go into Supabase secrets, never into GitHub, `config.js` or a chat.

## 5. Create the app in App Store Connect

1. Go to **appstoreconnect.apple.com** → **Apps** → **+** → **New App**.
2. Fill in:
   - **Platform:** iOS
   - **Name:** your app name
   - **Language:** English (U.S.)
   - **Bundle ID:** pick yours
   - **SKU:** anything, for example `onething1`
   - **User Access:** Full Access
3. Open the new app → **App Information**. Copy the **Apple ID**, a number like `6738291045`. Put it in `codemagic.yaml` in place of `0000000000`.

## 6. Make an API key so Codemagic can upload builds

1. In App Store Connect, go to **Users and Access** → **Integrations** → **App Store Connect API** → **Team Keys** → **+**.
2. **Name:** Codemagic. **Access:** App Manager. Click **Generate**.
3. **Download** the key (also only once), and note the **Issuer ID** and the **Key ID**.

## 7. Set up Codemagic (the cloud Mac)

1. Go to **codemagic.io** → **Sign up with GitHub**, then allow access to your `one-thing` repository.
2. **Add application** → pick `one-thing`. If it asks for a project type, choose **Other** (it uses `codemagic.yaml`).
3. **Team settings → Team integrations → Developer Portal → Connect.**
   - **App Store Connect API key name:** `One Thing API key` (exactly what `codemagic.yaml` says)
   - Fill in the Issuer ID and Key ID, and upload the `.p8` from step 6.
4. **Team settings → Code signing identities:**
   - **iOS certificates → Generate certificate → Apple Distribution.** Pick the key you just added, then save.
   - **iOS provisioning profiles → Fetch profiles.** If none show for your bundle ID, create one at developer.apple.com → **Profiles** → **+** → **App Store Connect** → your App ID → the certificate, then click **Fetch** again.

Codemagic's free plan includes build minutes on its Mac machines each month, which is plenty for a few builds.

## 8. Build (wait about 15–25 minutes)

1. In Codemagic, open the app and click **Start new build**.
2. Choose branch **main** and workflow **iPhone App Store (TestFlight)**.
3. When it's green, the build uploads to App Store Connect by itself. Apple then "processes" it for another 10–30 minutes. You'll get an email.

If a step turns red, open it. The first lines of the error usually say exactly what's missing (often a bundle ID typo or a missing profile). Send me the red text and I'll tell you the fix.

## 9. Change the name (if it's not "One Thing")

Edit these three on GitHub, then rebuild (step 8):
- `native/capacitor.config.json` → `"appName"`
- `native/ios/App/App/Info.plist` → the line after `CFBundleDisplayName` (the name under the icon, about 12 characters max to fit)
- `manifest.webmanifest` → `"name"` and `"short_name"` (the website version)

## 10. Test on both phones with TestFlight

1. In App Store Connect → your app → **TestFlight** → **Internal Testing** → **+**, make a group called "Us" and add both your Apple IDs. Natalie has to be added under **Users and Access** first, with the role **Developer** or **Marketing**.
2. Install the **TestFlight** app from the App Store on both phones, then accept the invite.
3. Open One Thing:
   - Tap **I have a code**, enter your household code, and pick who you are.
   - Go to **Settings → Turn on notifications → Allow**, then tap **Send a test**. It should arrive within seconds.
4. Check the basics:
   - Add a task for each other and see the notification.
   - Mark a task **Done**.
   - Add an event 1 hour 5 minutes from now and wait for its reminder.
   - Open **Someday**.
   - Open the **Home** room.

> The store app and the website share the same household. You can keep using either one.

## 11. Fill in the App Store listing

Everything you need to paste is in `APP-STORE-LISTING.md`: name, subtitle, description, keywords, privacy answers and review notes. Upload the 6 screenshots I sent (they're the 6.9-inch size Apple asks for).

## 12. Submit

1. Go to **App Store** tab → **iOS App 1.0** → **Build** → **+**, and pick the build you tested.
2. Answer the export question with **No** (the app only uses standard HTTPS; this is pre-set in the build too).
3. Click **Add for Review**, then **Submit**.

Apple usually answers within 1–2 days. If they reject it, the message says which rule and why. Send it to me and we'll fix it and resubmit.

---

## Before real users (not needed for you two)

- **Supabase Pro** (about $25 a month). The free plan pauses after a week without use and has no automatic backups.
- **Bot protection (CAPTCHA)** on sign-ins.
- **Android:** a Google Play account ($25 once), then 12 testers for 14 days before it can publish.
