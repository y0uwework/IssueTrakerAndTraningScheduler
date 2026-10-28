# Issue Tracker

A small, local-only issue tracker. Built with Next.js (App Router), TypeScript, Tailwind CSS v4, SQL Server (`mssql`), and Lucide icons. It runs on `http://localhost:3000` only, with no login.

## Project structure

```text
issue_traker/
├── app/
│   ├── api/
│   │   ├── issues/route.ts            GET list + stats, POST create
│   │   ├── issues/export/route.ts     GET filtered issues as .xlsx with screenshots
│   │   ├── issues/[id]/route.ts       GET one, PUT update, DELETE
│   │   └── images/[imageId]/route.ts  serves screenshots (only files registered in the DB)
│   ├── layout.tsx
│   ├── page.tsx                       dashboard (cards, filters, table, dialogs)
│   └── globals.css                    Tailwind import + shared button/field styles
├── components/
│   ├── IssueForm.tsx                  create/edit modal with image previews and upload progress
│   ├── IssueTable.tsx
│   ├── IssueDetails.tsx               details modal + full-size image viewer
│   ├── StatusBadge.tsx                status and priority badges
│   ├── ConfirmDialog.tsx
│   └── Modal.tsx
├── lib/
│   ├── db.ts                          server-only mssql connection pool
│   ├── api.ts                         server-only validation and error helpers
│   ├── uploads.ts                     server-only image validation and storage
│   └── types.ts                       shared types and constants
├── database/schema.sql                run this in SSMS first
├── uploads/                           screenshots are stored here (ignored by git)
└── .env.local.example
```

Tailwind CSS v4 is configured in CSS (`@import "tailwindcss"` in `app/globals.css`), so there is no `tailwind.config.ts`. That's the setup the current Next.js generator uses.

## Setup (Windows PowerShell)

The project in this folder is already created and its packages are installed. For reference, it was set up like this:

```powershell
npx create-next-app@latest issue-tracker --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
cd issue-tracker
npm install mssql lucide-react server-only
npm install -D @types/mssql
```

On a fresh copy of this project, just run:

```powershell
cd "C:\Users\vmarc\OneDrive\Desktop\Extra web tools made to make life easy\issue_traker"
npm install
```

### 1. Find your SQL Server instance name

When SSMS opens, the **Connect to Server** dialog shows the **Server name**:

- `localhost` or `.` or your PC name means the **default instance** (`MSSQLSERVER`).
- `localhost\SQLEXPRESS` or `.\SQLEXPRESS` means a **named instance** called `SQLEXPRESS`.

You can also run this query in SSMS: `SELECT @@SERVERNAME, SERVERPROPERTY('InstanceName');` (if `InstanceName` is NULL, it's the default instance). Or in PowerShell: `Get-Service MSSQL*`. `MSSQL$SQLEXPRESS` means a named instance called SQLEXPRESS.

### 2. Create the database

1. In SSMS, connect to your server.
2. **File > Open > File...** and choose `database\schema.sql`.
3. Press **Execute** (F5). This creates `IssueTrackerDB` with the `Issues` and `IssueImages` tables. You can run it more than once safely.

### 3. Choose an authentication method

**Option A: SQL Server login (recommended, works out of the box)**

The default `mssql` driver (tedious) connects over TCP with a SQL login.

1. Enable mixed mode: in SSMS, right-click the server, then **Properties > Security > SQL Server and Windows Authentication mode**. Then restart the SQL Server service.
2. Create a login. There's a ready-to-use block at the bottom of `schema.sql` (it creates `issue_tracker_app` with read/write access). Or use `sa`.
3. Make sure **TCP/IP is enabled**: open *SQL Server Configuration Manager*, go to **SQL Server Network Configuration > Protocols for <instance> > TCP/IP = Enabled**, then restart the service. SQL Express ships with TCP/IP disabled.

**Option B: Windows Authentication**

`tedious` does **not** support Windows/integrated authentication. To use it:

1. Install the native driver: `npm install msnodesqlv8`. It needs Node.js 22 or newer and a 64-bit Node.
2. Install a **Microsoft ODBC Driver for SQL Server** (17 or 18). To check which you have, open *ODBC Data Sources (64-bit)* and look at the **Drivers** tab, or run `Get-OdbcDriver -Platform '64-bit' | Select Name`.
3. In `.env.local`, set `DB_AUTH=windows` and set `DB_ODBC_DRIVER` to the exact driver name, e.g. `ODBC Driver 17 for SQL Server`.

The app runs as your Windows user, so that user needs access to `IssueTrackerDB`.

### 4. Configure `.env.local`

```powershell
Copy-Item .env.local.example .env.local
notepad .env.local
```

| Your setup | Settings |
| --- | --- |
| Default instance | `DB_SERVER=localhost`, leave `DB_PORT` empty (uses 1433) |
| Named instance, SQL Browser running | `DB_SERVER=localhost\SQLEXPRESS`, leave `DB_PORT` empty |
| Named instance with a fixed port (no SQL Browser needed) | `DB_SERVER=localhost`, `DB_PORT=1433` (or whatever port is set under TCP/IP > IP Addresses > IPAll) |
| SQL login | `DB_AUTH=sql`, `DB_USER=...`, `DB_PASSWORD=...` |
| Windows login | `DB_AUTH=windows`, `DB_ODBC_DRIVER=ODBC Driver 17 for SQL Server` |

**Encryption:** a local SQL Server uses a self-signed certificate. Keep `DB_ENCRYPT=false` with `DB_TRUST_SERVER_CERTIFICATE=true`. If your server forces encryption, set `DB_ENCRYPT=true` and keep `DB_TRUST_SERVER_CERTIFICATE=true`.

These variables are read only on the server. Never rename them with a `NEXT_PUBLIC_` prefix. `.env.local` is git-ignored.

> **This PC:** `SQLEXPRESS` is running with mixed-mode auth and TCP/IP on port 1433. SQL Server Browser is **disabled**, so use `DB_SERVER=localhost` with `DB_PORT=1433`, not `localhost\SQLEXPRESS`. Only ODBC Driver 17 is installed, so if you use Windows auth, set `DB_ODBC_DRIVER=ODBC Driver 17 for SQL Server`.

### 5. Run

```powershell
npm run dev
```

Open http://localhost:3000. The dev server listens on `localhost` only, so other machines on the network can't reach it.

For a faster production build: `npm run build`, then `npm start` (also localhost-only).

## Testing checklist

1. **Create:** click **+ New Issue**, enter a title, set a priority and category, attach 2 or 3 screenshots (JPEG/PNG/WebP), remove one preview, then click **Create Issue**. The summary cards update and the table shows the image count.
2. **Read:** click the title or the eye icon. Check the fields and timestamps, click a thumbnail to open the large viewer (use the ← / → keys and Esc).
3. **Update:** click the pencil icon. Change the status to **Resolved**, mark one existing image with ✕ (it shows "Will be removed"), add a new one, and save. Open the details: *Resolved* now has a timestamp and *Last Updated* has changed. Set the status back to **Open** and the resolved timestamp disappears.
4. **Validation:** try saving without a title, or picking a file over 5 MB or a non-image. You'll see an error and nothing gets saved.
5. **Search/filter:** search by `#ID` or a word from a title, combine the status, priority, and category filters, switch between newest and oldest, then click **Clear**.
6. **Export:** apply some filters and click **Export Excel**. The `.xlsx` contains only the issues currently shown, in the same order, with screenshot thumbnails in the last column (**Screenshots**). WebP screenshots are converted to PNG thumbnails because Excel can't embed WebP.
7. **Delete:** click the trash icon and confirm. The issue, its image rows, and its files in `uploads\` are all removed.

## Training Records module

Open **Training Records** in the top bar (`/training-records`). It tracks HRMS and CRM training for new joiners.

- A **training session** has a title, start/end date and time, training mode (**Face to face** with an optional venue, or **Online** with a required meeting link), status (*Scheduled*, *Completed*, *Cancelled*), notes, one or more **trainers**, and screenshots.
- You can add many employees to one session, either one at a time or by pasting a list (`Name, Code, Department` per line, which also works when pasted from Excel). Choose **HRMS**, **CRM** or **Both** when adding. Each employee/app row records **which trainer(s) trained that person**: tick the trainer chips on the row, or use the "*Trainer*: all" buttons in the column header.
- The **Employee Records** tab lists one row per employee per app (who was trained, on which app, by whom, and when). Filter it by app, status, trainer or date range. **Export Excel** downloads that list plus a *Sessions* sheet.
- Tables: `TrainingSessions`, `TrainingSessionTrainers`, `TrainingAttendees`, `TrainingAttendeeTrainers`, `TrainingImages` (all in `database/schema.sql`. Re-running the script adds them to an existing database without touching issues). Requires SQL Server 2017 or later (`STRING_AGG`).
- Screenshots use the same `uploads\` folder and validation as issues, and are served by `/api/training/images/<ImageId>`.

## How uploads work

- The browser sends `multipart/form-data`. The server checks each file's **magic bytes** (it doesn't trust the file name or MIME type), allows at most 5 MB per image and 10 images per save, and accepts JPEG, PNG, and WebP only.
- Files are saved as `uploads\<random-uuid>.<ext>`, and the relative path is stored in `IssueImages.ImagePath`. The original file name is stored only for display.
- Images are served by `/api/images/<ImageId>`, which looks up the path in the database and accepts only names the app generated. Arbitrary paths can't be requested.
- New files are written before the database transaction. If the transaction fails, they're deleted. Files belonging to removed or deleted images are deleted only **after** the database change commits.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot connect to SQL Server` banner | Check the server console for the actual error. Check that the SQL Server service is running (`Get-Service MSSQL*`), and check the `.env.local` values. Restart `npm run dev` after editing `.env.local`. |
| `Login failed for user` | Mixed mode isn't enabled (restart the service after enabling it), the password is wrong, or the login has no user in `IssueTrackerDB`. |
| `Failed to connect to localhost:1433` / `ESOCKET` | TCP/IP is disabled, or the instance listens on a different port. Enable TCP/IP in SQL Server Configuration Manager and check the port under **IPAll**, then set `DB_PORT`. |
| `Failed to connect to localhost\SQLEXPRESS` / `EINSTLOOKUP` | The SQL Server Browser service isn't running. Start it (set it to Automatic in `services.msc`), or use `DB_SERVER=localhost` with an explicit `DB_PORT`. |
| `self-signed certificate` / SSL errors | Set `DB_TRUST_SERVER_CERTIFICATE=true`. |
| `Cannot find module 'msnodesqlv8'` | You set `DB_AUTH=windows` without running `npm install msnodesqlv8`. |
| `Data source name not found and no default driver specified` | `DB_ODBC_DRIVER` doesn't match an installed ODBC driver name exactly. |
| `Invalid object name 'dbo.Issues'` | `schema.sql` wasn't run, or `DB_DATABASE` points to a different database. |
| Port 3000 already in use | Find the process with `Get-NetTCPConnection -LocalPort 3000 \| Select OwningProcess`, then `Stop-Process -Id <id>`. |
| `npm` scripts blocked ("running scripts is disabled") | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `npm.cmd run dev`. |
| `EPERM` / file-locking errors under OneDrive | OneDrive sync can lock files in `.next` or `node_modules`. Pause syncing, or move the project to a folder outside OneDrive, e.g. `C:\dev\issue-tracker`. |
| Timestamps look shifted | Times are stored in UTC and shown in your browser's local time. Don't change `useUTC` in `lib/db.ts`. |
