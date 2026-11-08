# Routine 🎯

An offline-first Progressive Web App (PWA) built for focused, routine-based skill building, practice habits, and study sessions. Designed with **Material Design 3 (Material You)**, **Svelte 5**, and client-side **IndexedDB**, Routine gives you countdown timers, task switching, offline PDF storage, Android app launching, and system share target integration with zero external server dependencies.

---

## ✨ Features

### ⏱️ Session Runner & Precision Timer
- **Circular Countdown Timer**: Large SVG progress ring displaying elapsed vs. remaining task time.
- **Sleep & Screen-Lock Resilient**: Accurately tracks elapsed time using wall-clock timestamp offsets (`Date.now() - lastResumedAt`) so timers never drift when your phone locks or you switch apps.
- **Control Bar**: Play, pause, skip (`⏭ Next Task`), and redo (`↻ Re-do Task`) controls.

### ⭕ Active Task Progress Rings
- **Dashboard Ring Visualization**: On the main **Today** view (`/`), each routine card showcases a mini circular progress ring directly inside the active task badge.
- **Visual Statuses**: Displays task progress percentage, remaining duration (e.g. `Vocabulary Drill · 5m left`), and dynamic center status icons:
  - `▶` Ready / not yet started
  - `⏸` In-progress / paused with saved progress
  - `✓` Task completed

### 🔀 Flexible Task Switching & State Persistence
- **Top Task Chips Carousel**: Jump between routine tasks at any moment from the session header. Completed tasks show checkmarks (`✓`).
- **Full Routine Task List**: Browse and switch to any task in the routine on the fly.
- **Persistent Active State**: Switching tasks updates the session's active task in IndexedDB. Exiting and re-entering the routine immediately restores the exact task and timer position.
- **Dynamic Task Synchronization**: Adding, removing, or re-ordering tasks dynamically syncs with active sessions without resetting your progress.

### 📱 Android App Preset Launcher
- **Curated Reading & Learning Presets**: One-tap app presets for focused skill building:
  - 📖 **Amazon Kindle** (`com.amazon.kindle`)
  - ✝️ **YouVersion Bible** (`com.sirma.mobile.bible.android`)
  - 📰 **Ground News** (`com.checkitt`)
  - 🎵 **Perfect Ear** (`com.evilduck.musiciankit`)
  - 🧩 **Crossword** (`com.redstonegames.crossword.en`)
  - 📚 **Vocabulary Builder** (`com.magoosh.vocabulary.builder`)
- **Chrome Intent Integration**: Builds Android Intent URIs targeting installed app packages with automatic fallback to the Google Play Store if the app isn't installed.

### 📄 Local Offline PDF Storage & Bookmarking
- **IndexedDB Blob Storage**: Upload study PDFs directly into browser storage (`db.files`).
- **Offline PDF Viewer**: Opens PDF documents in the browser using secure object URLs (`URL.createObjectURL(blob)#page=N`).
- **Live Page Bookmarking**: Update your current page bookmark directly from the active session view (e.g., jump from page 12 to 18).

### 🔗 Smart Links & YouTube Timestamps
- Attach URLs to tasks with automatic platform detection.
- Handles YouTube links (`youtube.com/watch`, `youtu.be`) with starting timestamp parsing (`?t=120s`, `&t=2m`).

### 📤 Android Web Share Target
- Registered in the Web App Manifest as a system share target.
- Share videos or links directly from Android apps (like YouTube, Chrome, or Twitter) into Routine using the native Android share sheet.
- **Smart Share Parser**: Automatically extracts URLs, detects timestamps, and prompts via a global **Quick Attach Modal** to add as a new task or update an existing routine task.

### 📅 Routine Scheduling
- **Daily**: Runs every single day.
- **Every N Days**: Flexible cadence (e.g., every 2 days for gym/alternate-day routines).
- **Weekly Days**: Select specific days of the week (e.g., Mon, Wed, Fri).

---

## 🛠️ Tech Stack

- **Framework**: [SvelteKit](https://kit.svelte.dev/) with [Svelte 5](https://svelte.dev/) (modern Runes: `$state`, `$derived`, `$effect`)
- **Adapter**: `@sveltejs/adapter-static` (Single Page Application, zero server-side rendering required)
- **Database**: [Dexie.js](https://dexie.com/) (Reactive client-side wrapper around browser IndexedDB)
- **PWA Engine**: `@vite-pwa/sveltekit` + Workbox (automatic cache updates and offline service worker)
- **Design Tokens**: Material Design 3 (Material You) CSS custom properties supporting light and dark themes
- **Testing**: Node.js native test runner (`node:test`) + `tsx`

---

## 📁 Project Structure

```
task-manager/
├── src/
│   ├── app.css                 # Material Design 3 tokens & global styles
│   ├── app.html                # PWA HTML shell with viewport and theme meta
│   ├── lib/
│   │   ├── components/         # Reusable Svelte components (e.g. QuickAttachModal)
│   │   ├── constants/          # App presets and configuration constants
│   │   ├── db/                 # Dexie.js schema, models, and CRUD operations
│   │   │   ├── database.ts     # IndexedDB table definitions (routines, tasks, sessions, files)
│   │   │   ├── files.ts        # PDF blob storage utilities
│   │   │   ├── routines.ts     # Routine queries and lifecycle
│   │   │   ├── sessions.ts     # Session state, progress sync, and active task tracking
│   │   │   └── tasks.ts        # Task CRUD and ordering
│   │   └── utils/              # Pure utility helpers
│   │       ├── apps.ts         # App intent URIs and preset catalog
│   │       ├── links.ts        # Link formatting and link type detection
│   │       ├── progress.ts     # Task progress calculations and icon resolvers
│   │       ├── scheduler.ts    # Routine due-date engine (daily, weekly, every N days)
│   │       ├── shareParser.ts  # Android share payload parser
│   │       └── time.ts         # Time formatting and seconds conversion
│   └── routes/                 # SvelteKit pages
│       ├── +layout.svelte      # Main app navigation bar & share modal mount
│       ├── +page.svelte        # "Today" dashboard with routine cards & progress rings
│       ├── history/            # Session history and review logs
│       └── routines/
│           ├── +page.svelte    # All routines library
│           ├── new/            # Routine builder with task & schedule editor
│           └── [id]/           # Routine editor & session runner
│               ├── +page.svelte
│               └── session/    # Live routine session runner (timer & controls)
├── tests/                      # Automated unit test suite (24 tests)
├── static/                     # PWA icons, manifest, and favicon
├── svelte.config.js            # SvelteKit static adapter configuration
└── vite.config.ts              # Vite & VitePWA configuration with Web Share Target
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18+ or 20+ recommended)
- `npm` (included with Node.js)

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/<your-username>/routine.git
cd routine
npm install
```

### Development Server
Start the local Vite development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Quality Checks

Run the automated test suite (24 unit tests covering scheduler, DB CRUD, share parser, app intents, session isolation, task sync, and progress rings):
```bash
npm test
```

Run TypeScript and Svelte diagnostics:
```bash
npm run check
```

---

## 📦 Building & Distribution for Personal Use

Because Routine is a static SPA with offline client-side storage, you can build and distribute it for personal use in minutes.

### 1. Build Production Assets
```bash
npm run build
```
This compiles the application and generates the offline service worker into the [`build/`](file:///c:/Users/groza/workspace/task-manager/build) directory.

### 2. Deploy to Free Static Hosting (HTTPS Required for PWA)

Deploy the `build/` directory to any static host with HTTPS:

* **Cloudflare Pages**:
  ```bash
  npx wrangler pages deploy build --project-name=my-routine
  ```
* **Vercel**:
  ```bash
  npx vercel build --prod
  ```
* **Netlify**:
  ```bash
  npx netlify deploy --dir=build --prod
  ```
* **GitHub Pages**:
  Push your project to GitHub and configure GitHub Pages to serve the `build/` directory from a `gh-pages` branch or root.

### 3. Install on Mobile as a PWA

1. Open your deployed HTTPS URL in **Google Chrome** (Android) or **Safari** (iOS).
2. Tap the browser menu (`⋮` on Chrome / Share button on iOS).
3. Select **"Install app"** or **"Add to Home Screen"**.
4. **Android Native Features**:
   - The app runs in standalone full-screen mode without browser chrome.
   - It functions **100% offline** via Workbox caching and IndexedDB.
   - It appears in your phone's native **"Share via..."** menu to capture incoming links and YouTube videos.
   - It launches installed Android apps (Kindle, YouVersion, etc.) through Chrome intent links.

### 4. Package as an Android APK (Optional)
If you prefer a native `.apk` installer file:
1. Deploy your PWA to an HTTPS URL.
2. Go to [PWABuilder.com](https://www.pwabuilder.com/).
3. Enter your URL and click **Package for Android**.
4. Download the generated `.apk` and sideload it directly onto your Android device.

---

## 📄 License

MIT License. Free for personal and commercial use.
