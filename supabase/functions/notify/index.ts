// One Thing — notification sender (Supabase Edge Function named "notify")
//
// Handles:
//   { event: "tick" }                          every 5 minutes from the scheduler:
//                                              7 a.m. / 7 p.m. messages (once per household per day)
//                                              "time's up" when a together timer ends,
//                                              and event reminders 1 hour before
//   { event: "tick", force: "morning" | "evening" }   send now to every household (testing)
//   { event: "added", task_id }                someone put a task on your list
//   { event: "done",  task_id }                partner cheer
//   { event: "test" }                          "Send test notification" button
//   { event: "list_ready", list }              "List is ready" button
//   { event: "trip_done", list, items, stars } "Got everything"
//   { event: "together_invite" }               "Do ours together"
//   { event: "event_added", event_id }         partner put an event on your calendar
//   { event: "delete_account" }                App Store "Delete my account": removes this sign-in (and the
//                                              household too, if nobody else is left)
//   GET ?ics=<private token>                   the household calendar feed (iPhone Calendar subscription)
//
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// For the App Store app (Apple push), also: APNS_KEY (the .p8 file's text), APNS_KEY_ID, APNS_TEAM_ID,
// APNS_BUNDLE_ID, and optionally APNS_ENV = "sandbox" while testing a debug build (default: production).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
function pickKey(dictVar: string, legacyVar: string): string {
  const dict = Deno.env.get(dictVar);
  if (dict) {
    try {
      const parsed = JSON.parse(dict);
      if (parsed?.default) return parsed.default;
      const first = Object.values(parsed)[0];
      if (typeof first === "string") return first;
    } catch { /* fall through */ }
  }
  return Deno.env.get(legacyVar) ?? "";
}
const SECRET_KEY = pickKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);
const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Person = "p1" | "p2";
type House = { id: string; name_p1: string; name_p2: string; add_pref_p1: string; add_pref_p2: string };
const otherOf = (p: string): Person => (p === "p1" ? "p2" : "p1");
const nameIn = (names: { p1: string; p2: string }, p: string) => (p === "p1" ? names.p1 : p === "p2" ? names.p2 : "The wall display");
const short = (t: string, n = 60) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

// ---------- Apple push (App Store app) ----------
const APNS = {
  key: (Deno.env.get("APNS_KEY") ?? "").replace(/\\n/g, "\n"),
  keyId: Deno.env.get("APNS_KEY_ID") ?? "", teamId: Deno.env.get("APNS_TEAM_ID") ?? "",
  bundleId: Deno.env.get("APNS_BUNDLE_ID") ?? "",
  host: Deno.env.get("APNS_ENV") === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
};
let apnsJwt = { token: "", at: 0 };
async function apnsAuth(): Promise<string> {
  if (apnsJwt.token && Date.now() - apnsJwt.at < 45 * 60 * 1000) return apnsJwt.token;   // Apple wants it reused, refreshed < 1 h
  const key = await importPKCS8(APNS.key, "ES256");
  const token = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: APNS.keyId }).setIssuer(APNS.teamId).setIssuedAt().sign(key);
  apnsJwt = { token, at: Date.now() };
  return token;
}
// Returns "ok", "gone" (token no longer valid: delete it) or "error".
async function sendApns(deviceToken: string, payload: { title: string; body: string; tag?: string }): Promise<"ok" | "gone" | "error"> {
  if (!APNS.key || !APNS.keyId || !APNS.teamId || !APNS.bundleId) { console.error("APNS secrets not set"); return "error"; }
  const res = await fetch(`https://${APNS.host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsAuth()}`, "apns-topic": APNS.bundleId, "apns-push-type": "alert", "apns-priority": "10",
      ...(payload.tag ? { "apns-collapse-id": payload.tag.slice(0, 64) } : {}),
    },
    body: JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: "default" } }),
  });
  if (res.ok) return "ok";
  const why = await res.text();
  if (res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(why)) return "gone";
  console.error("apns failed", res.status, why);
  return "error";
}

async function sendTo(hh: string, person: Person, payload: { title: string; body: string; tag?: string }) {
  const { data: subs } = await admin.from("push_subs").select("*").eq("household_id", hh).eq("person", person);
  let sent = 0;
  for (const s of subs ?? []) {
    if (s.kind === "apns") {
      const r = await sendApns(String(s.endpoint).replace(/^apns:/, ""), payload);
      if (r === "ok") sent++;
      if (r === "gone") await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...payload, url: "./" }),
        { TTL: 60 * 60 * 6 },
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, (err as Error).message);
    }
  }
  return sent;
}

// What's on someone's card right now (pins + their one thing + shared), excluding done/paused/due-prompts.
async function cardFor(hh: string, p: Person): Promise<string[]> {
  const { data, error } = await admin.rpc("_today_for", { p_hh: hh, p });
  if (error) throw error;
  return (data.items as { kind: string; title: string }[])
    .filter((i) => i.kind === "pinned" || i.kind === "pick" || i.kind === "shared")
    .map((i) => i.title);
}
const summary = (titles: string[]) =>
  titles.length === 1 ? titles[0] : `${titles.length} things: ${titles.map((t) => short(t, 30)).join(" · ")}`;

// "19:30" → "7:30 PM"
function clock(hm: string | null): string {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ---------- Calendar feed (iCalendar) ----------
type Ev = { id: string; title: string; whose: string; start_date: string; all_day: boolean; start_time: string | null;
  end_time: string | null; repeat: string; location: string | null; notes: string | null; updated_at: string };
const icsText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replaceAll("-", "");
function shift(date: string, time: string, mins: number) {   // naive local date+time arithmetic
  const [y, mo, d] = date.split("-").map(Number); const [h, mi] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi + mins));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`;
}
function fold(line: string): string {   // RFC 5545: lines over 75 bytes continue with a leading space
  const enc = new TextEncoder(); const out: string[] = []; let cur = ""; let n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
function buildIcs(tz: string, names: { p1: string; p2: string }, events: Ev[]): string {
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//One Thing//Plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:One Thing", `X-WR-TIMEZONE:${tz}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of events) {
    const who = e.whose === "both" ? "Both of us" : e.whose === "p1" ? names.p1 : names.p2;
    L.push("BEGIN:VEVENT", `UID:${e.id}@one-thing`, `DTSTAMP:${new Date(e.updated_at).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
      `SUMMARY:${icsText(e.title)} (${icsText(who)})`);
    if (e.all_day || !e.start_time) {
      L.push(`DTSTART;VALUE=DATE:${ymd(e.start_date)}`, `DTEND;VALUE=DATE:${shift(e.start_date, "00:00", 24 * 60).slice(0, 8)}`);
    } else {
      const [sh, sm] = e.start_time.split(":").map(Number);
      let mins = 60;
      if (e.end_time) { const [eh, em] = e.end_time.split(":").map(Number); mins = eh * 60 + em - (sh * 60 + sm); }
      L.push(`DTSTART;TZID=${tz}:${shift(e.start_date, e.start_time, 0)}`, `DTEND;TZID=${tz}:${shift(e.start_date, e.start_time, mins)}`);
    }
    if (e.repeat === "weekly") L.push("RRULE:FREQ=WEEKLY");
    if (e.repeat === "biweekly") L.push("RRULE:FREQ=WEEKLY;INTERVAL=2");
    if (e.repeat === "monthly") {
      const day = Number(e.start_date.slice(8, 10));
      // On the 29th–31st, use the last available day in short months (same as the app).
      L.push(day >= 29 ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: day - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1` : "RRULE:FREQ=MONTHLY");
    }
    if (e.location) L.push(`LOCATION:${icsText(e.location)}`);
    if (e.notes) L.push(`DESCRIPTION:${icsText(e.notes)}`);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

async function tick(force?: string) {
  const out: Record<string, unknown> = {};
  // 7 a.m. / 7 p.m. — each household exactly once per day
  const { data: due, error } = await admin.rpc("_due_notifications", { p_force: force ?? null });
  if (error) throw error;
  let sent = 0;
  for (const h of (due ?? []) as { hh: string; kind: string; names: { p1: string; p2: string } }[]) {
    for (const p of ["p1", "p2"] as Person[]) {
      const open = await cardFor(h.hh, p);
      if (!open.length) continue;
      sent += await sendTo(h.hh, p, h.kind === "morning"
        ? { title: `Good morning, ${nameIn(h.names, p)}`, body: `Today: ${summary(open)}`, tag: "morning" }
        : { title: "Still on your card", body: summary(open), tag: "evening" });
    }
  }
  out.daily = { households: (due ?? []).length, sent };
  // Together timers that just ended
  if (!force) {
    const { data: ended } = await admin.rpc("_ended_timers");
    for (const t of (ended ?? []) as { hh: string; bonus: boolean }[]) {
      for (const p of ["p1", "p2"] as Person[]) {
        await sendTo(t.hh, p, { title: "Time's up!", body: t.bonus ? "Nice work, you two. Bonus Stars earned." : "Nice work. Check off what you finished.", tag: "together-end" });
      }
    }
    out.timers = (ended ?? []).length;

    // Events starting within the hour
    const { data: rem, error: remErr } = await admin.rpc("_due_event_reminders");
    if (remErr) throw remErr;
    for (const e of (rem ?? []) as { hh: string; title: string; whose: string; location: string | null; start_time: string }[]) {
      const people: Person[] = e.whose === "both" ? ["p1", "p2"] : [e.whose as Person];
      for (const p of people) {
        await sendTo(e.hh, p, { title: `In 1 hour: ${short(e.title)}`, body: [clock(e.start_time), e.location].filter(Boolean).join(" · "), tag: `event-${e.title}` });
      }
    }
    out.reminders = (rem ?? []).length;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("ics") ?? "";
    const { data, error } = await admin.rpc("_ics_for", { p_token: token });
    if (error) { console.error(error); return new Response("error", { status: 500 }); }
    if (!data) return new Response("Calendar link not found. Make a new one in One Thing → Settings.", { status: 404 });
    return new Response(buildIcs(data.tz, data.names, data.events as Ev[]), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache",
                 "Content-Disposition": 'inline; filename="one-thing.ics"' },
    });
  }
  let body: { event?: string; task_id?: string; event_id?: string; force?: string; list?: string; items?: number; stars?: number } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  try {
    if (body.event === "tick") {
      if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
      return json(await tick(body.force));
    }

    // ---- App events: the caller must be a signed-in household member ----
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "not signed in" }, 401);

    if (body.event === "delete_account") {
      const { data: res, error: delErr } = await admin.rpc("_delete_account", { p_uid: uid });
      if (delErr) throw delErr;
      const { error: authErr } = await admin.auth.admin.deleteUser(uid);
      if (authErr) console.error("auth delete", authErr.message);   // data is already gone; the sign-in is harmless without it
      return json({ ok: true, household_deleted: res?.household_deleted ?? false });
    }
    const { data: member } = await admin.from("members").select("person, household_id").eq("uid", uid).maybeSingle();
    if (!member?.household_id) return json({ error: "not a member" }, 403);
    const hh: string = member.household_id;
    const me: string = member.person;
    const { data: house } = await admin.from("households").select("id,name_p1,name_p2,add_pref_p1,add_pref_p2").eq("id", hh).single();
    const h = house as House;
    const names = { p1: h.name_p1, p2: h.name_p2 };

    if (body.event === "test") {
      if (me !== "p1" && me !== "p2") return json({ error: "The wall display doesn't get notifications." }, 400);
      return json({ sent: await sendTo(hh, me, { title: "One Thing", body: "Test notification ✓ You're all set.", tag: "test" }) });
    }

    const LIST_NAME: Record<string, string> = { groceries: "Groceries", household: "Household" };
    if (body.event === "list_ready" || body.event === "trip_done" || body.event === "together_invite") {
      if (me !== "p1" && me !== "p2") return json({ error: "Pick who you are in Settings first." }, 400);
      const partner = otherOf(me);
      const who = nameIn(names, me);
      if (body.event === "together_invite") {
        return json({ sent: await sendTo(hh, partner, { title: `${who} wants to do tasks together`, body: "Open One Thing and tap Join. 25 minutes, bonus Stars if you both finish.", tag: "together" }) });
      }
      const list = LIST_NAME[body.list ?? ""] ?? "Shopping";
      if (body.event === "list_ready") {
        const { count } = await admin.from("shop_items").select("id", { count: "exact", head: true })
          .eq("household_id", hh).eq("list", body.list).is("trip_id", null).is("checked_at", null);
        return json({ sent: await sendTo(hh, partner, { title: `The ${list} list is ready`, body: `${who} finished the list${count ? ` (${count} item${count === 1 ? "" : "s"})` : ""}.`, tag: `ready-${body.list}` }) });
      }
      const extra = body.stars ? ` · +${body.stars} Stars` : "";
      return json({ sent: await sendTo(hh, partner, { title: `${who} got everything on ${list} 🎉`, body: `${body.items ?? "All the"} item${body.items === 1 ? "" : "s"} done${extra}`, tag: `trip-${body.list}` }) });
    }

    if (body.event === "event_added") {
      const { data: ev } = await admin.from("events").select("*").eq("id", body.event_id ?? "").eq("household_id", hh).maybeSingle();
      if (!ev) return json({ error: "event not found" }, 404);
      const targets = (ev.whose === "both" ? ["p1", "p2"] : [ev.whose]).filter((p: string) => p !== ev.created_by) as Person[];
      const who = ev.created_by === "p1" || ev.created_by === "p2" ? nameIn(names, ev.created_by) : "Someone";
      const [y, m, d] = (ev.start_date as string).split("-").map(Number);
      const when = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      let sent = 0;
      for (const p of targets) {
        if ((p === "p1" ? h.add_pref_p1 : h.add_pref_p2) === "off") continue;
        sent += await sendTo(hh, p, { title: `${who} added ${ev.whose === "both" ? "an event for you both" : "an event for you"}`,
          body: `${short(ev.title)} · ${when}${ev.all_day ? "" : ` ${clock((ev.start_time as string).slice(0, 5))}`}`, tag: `ev-${ev.id}` });
      }
      return json({ sent });
    }

    if (!body.task_id) return json({ error: "task_id required" }, 400);
    const { data: task } = await admin.from("tasks").select("*").eq("id", body.task_id).eq("household_id", hh).maybeSingle();
    if (!task) return json({ error: "task not found" }, 404);

    if (body.event === "added") {
      const targets: Person[] = task.owner === "both"
        ? (["p1", "p2"] as Person[]).filter((p) => p !== task.created_by)
        : task.owner !== task.created_by ? [task.owner as Person] : [];
      let sent = 0;
      for (const p of targets) {
        const pref = p === "p1" ? h.add_pref_p1 : h.add_pref_p2;
        if (pref === "off" || (pref === "high" && task.priority < 2)) continue;
        const who = task.created_by ? nameIn(names, task.created_by) : "Someone";
        const where = task.owner === "both" ? " (both of you)" : "";
        const pri = task.priority === 2 ? " · High" : "";
        sent += await sendTo(hh, p, { title: `${who} added a task${where}`, body: `${short(task.title)}${pri}`, tag: `add-${task.id}` });
      }
      return json({ sent });
    }

    if (body.event === "done") {
      if (!task.done_at) return json({ skipped: "not done" });
      const doer = task.done_by === "p1" || task.done_by === "p2" ? task.done_by : null;
      if (!doer) return json({ skipped: "unknown doer" });
      return json({ sent: await sendTo(hh, otherOf(doer), { title: `${nameIn(names, doer)} finished one 🎉`, body: short(task.title), tag: `done-${task.id}` }) });
    }

    return json({ error: "unknown event" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
