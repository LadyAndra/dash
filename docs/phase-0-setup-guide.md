# Phase 0 Setup Guide — step by step, no experience assumed

This is the one-time setup for the "Dash" app described in `dash-architecture-proposal.md`. Nothing here involves writing code. Budget **about an hour total**, and it splits into four independent chunks you can do in any order, on different days if you like. Step 3 (Google) is the fiddliest; it can also be postponed until Phase 3 if you'd rather.

Two notes before you start:

- Where this guide names buttons and menus, the wording is what these sites use as of mid-2026. Websites move things around — if a button isn't exactly where described, look for the same *idea* nearby, or just ask Claude "I'm on this screen, where's X?" with a screenshot.
- Throughout, the app is assumed to be named **dash**. If you want a different name/URL, substitute it everywhere — decide before Step 2, since it becomes part of your app's web address.

---

## Step 1 — Create the Dash folder in iCloud Drive (5 minutes)

**What this is for:** the folder where ALL your actual data will live — items, images, audio, themes. This folder is yours; the app just reads and writes inside it.

1. On your **Mac**, open **Finder**.
2. In the sidebar, click **iCloud Drive**. (If it's not in the sidebar: Finder menu → Settings → Sidebar → check iCloud Drive.)
3. Right-click in the empty area → **New Folder** → name it exactly: `Dash`
4. That's it. Don't create subfolders — the app makes its own (`data`, `assets`, `inbox`, `themes`) the first time it runs.

**Check it worked:** on your iPhone, open the **Files** app → Browse → iCloud Drive — the `Dash` folder should appear within a minute or two.

**One thing to verify while you're here:** Settings → your name → iCloud on your iPhone shows how much iCloud storage you have free. Images and voice notes accumulate; a few GB of headroom is plenty to start. If you're on the free 5 GB tier and it's nearly full, this project will eventually want the 50 GB iCloud+ tier (~$1/month).

---

## Step 2 — GitHub account + a home for the app's code (15 minutes)

**What this is for:** GitHub Pages will serve the app's *code* (the same fixed files to any device) at a stable web address. Your data never goes here. Reminder of one property we confirmed: with a free account the repository is **public**, meaning the app's code is technically visible to anyone who finds it — but it contains no data and nothing secret. Anyone opening your URL sees an *empty* app, because all data lives on your own devices and iCloud.

### 2a. Create the account

1. Go to **github.com** → **Sign up**.
2. Use any email; pick a username (it becomes part of your app's address: `https://LadyAndra.github.io/dash/` — so pick something you don't mind typing/seeing).
3. Free plan is all you need.

### 2b. Create the repository (the folder that will hold the code)

1. Once signed in, click the **+** in the top-right → **New repository**.
2. Repository name: `dash`
3. Set it to **Public** (required for free GitHub Pages).
4. Check **"Add a README file"** (this just makes the repo non-empty so the next steps work).
5. Click **Create repository**.

### 2c. Turn on GitHub Pages

1. In your new repository, click **Settings** (tab along the top).
2. In the left sidebar, click **Pages**.
3. Under "Build and deployment" → Source: **Deploy from a branch** → Branch: **main**, folder **/(root)** → **Save**.
4. Wait a minute, refresh the page — it will show your site address: `https://LadyAndra.github.io/dash/`. Write this down; you'll need it in Step 3.

### 2d. Learn the one skill you'll reuse: uploading files

This is how every version of the app (from Phase 1 onward) will get published — no tools to install, ever:

1. In the repository, click **Add file** → **Upload files**.
2. Drag files (or a whole folder of files) from your Mac into the page.
3. Click **Commit changes** at the bottom.
4. Within ~1 minute, the site at your address serves the new files.

**Try it now with a placeholder:** on your Mac, open **TextEdit** → Format menu → Make Plain Text → type `Dash — coming soon` → save as `index.html` (choose "use .html" if asked). Upload it using the steps above, then visit `https://LadyAndra.github.io/dash/` on your phone. If you see your text, Step 2 is fully proven and Phase 1 deployment will be this exact motion.

---

## Step 3 — Google Cloud project + sign-in credentials (20–30 minutes)

**What this is for:** lets the app ask Google, with your one-tap permission on each device, for read-only access to your Gmail and Calendar. You're creating a free "project" that identifies the app to Google. No billing setup is needed and nothing here can charge you.

**You can defer this until Phase 3** (when Gmail/Calendar features are actually built). Doing it now just means it's ready.

1. Go to **console.cloud.google.com** and sign in with **andrakhoder@gmail.com** (use the same account whose mail/calendar you want to see). Accept the terms on first visit.
2. **Create the project:** click the project dropdown at the top of the page → **New project** → name it `Dash` → **Create**. Make sure it's selected afterward (its name shows in that top dropdown).
3. **Enable the two APIs:** in the search bar at the top, type **Gmail API** → open it → click **Enable**. Then search **Google Calendar API** → **Enable**.
4. **Consent screen** (the permission popup you'll see when signing in):
   - Left menu (☰) → **APIs & Services** → **OAuth consent screen**.
   - Audience/user type: **External** → Create.
   - App name: `Dash`. Support email and developer email: your address. Skip everything optional. Save through the steps.
   - Find the **Test users** section (either during this flow or as a tab/menu item afterward) → **Add users** → add `andrakhoder@gmail.com`. **This step matters most** — being a test user is what lets you skip Google's app-verification process entirely.
   - Leave the app in **Testing** status. Do not click anything like "Publish app."
5. **Create the credential the app will use:**
   - APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Web application**. Name: `Dash web`.
   - Under **Authorized JavaScript origins** → Add URI: `https://LadyAndra.github.io` (no `/dash`, no trailing slash — just this).
   - Click **Create**. A popup shows a **Client ID** — a long string ending in `.apps.googleusercontent.com`.
6. **Save the Client ID** somewhere easy (Notes is fine). It is not a password and not secret — it's a public identifier. In Phase 3 you'll paste it into the app's settings screen once per device… actually just once; it syncs like everything else.

**Known quirk to expect later (not a mistake on your part):** because the app stays in "Testing" status, Google expires your permission roughly every 7 days — the app will occasionally pop the Google consent window again. One tap, then it works again. This is the price of skipping Google's verification bureaucracy, and it's the right trade for a personal app.

---

## Step 4 — iPhone Action Button for instant voice capture (5 minutes)

**What this is for:** press-and-hold the Action Button → recording starts immediately, even while locked.

1. On your iPhone: **Settings** → **Action Button**.
2. Swipe through the options to **Voice Memo** (labelled as a Control on newer iOS versions) → done, it saves automatically.
3. **Test it locked:** lock the phone, press and hold the Action Button — a recording overlay should appear and start capturing. Press-and-hold again (or tap stop) to finish. No Face ID needed.
4. The recording lands in the **Voice Memos** app. In Phase 2 we'll add the "Sweep voice notes" Shortcut that copies recent memos into `Dash/inbox/`, where they become unprocessed voice items. Until then, memos simply accumulate safely in Voice Memos — nothing is lost by capturing from day one.

---

## Phase 0 completion checklist

- [ ] `Dash` folder exists in iCloud Drive and is visible from the iPhone's Files app
- [ ] iCloud storage has comfortable headroom
- [ ] GitHub account created; `dash` repository exists and is public
- [ ] GitHub Pages is on; placeholder page loads at `https://LadyAndra.github.io/dash/` from your phone
- [ ] You've done one file upload via **Add file → Upload files** (this is the publish motion for all future phases)
- [ ] *(Optional now / required before Phase 3)* Google Cloud project `Dash` with Gmail + Calendar APIs enabled, consent screen in Testing with yourself as test user, Web OAuth Client ID created against your github.io origin, Client ID saved
- [ ] Action Button starts a Voice Memo from the lock screen
- [ ] **Chrome installed on the Mac** (google.com/chrome) — the Mac side of the app needs Chrome or Edge for automatic folder sync; Safari won't do it

When these are checked, hand `dash-architecture-proposal.md` (which now ends with implementation-handoff notes, §13) to the coding model and ask it to build **Phase 1 only**. Give it your GitHub Pages URL and, if asked, this checklist's outcomes. You should not need to give it anything else.
