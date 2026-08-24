# Setting up the commission portal

Four steps, about ten minutes. You need a Supabase account (the free tier is
plenty) and the files in this repository.

---

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Pick a strong database password and keep it somewhere safe.
3. Wait for it to finish provisioning.

## 2. Build the database

1. In your project, open **SQL Editor** in the left sidebar.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repository,
   copy **the whole file**, paste it in, and press **Run**.

It creates the four tables, the summary view, the security rules, a private
bucket for the uploaded files, and two years of monthly periods. Running it a
second time is harmless — it will not wipe anything you have already collected.

> Paste **only** `schema.sql` here. `index.html` and the files under `js/` are
> the web app; SQL Editor cannot run those, and pasting them produces a
> `syntax error at or near "const"`.

## 3. Point the app at your project

1. In Supabase, open **Project Settings → API**.
2. Copy the **Project URL** and the **anon / publishable** key.
3. Open `js/core.js` in a text editor and replace the first two values:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_KEY = 'your-publishable-key';
```

The publishable key is designed to sit in the browser where anyone can read
it — the rules from step 2 are what protect the data, not the key. **Never put
the `service_role` key here.** That one bypasses every rule in this document.

## 4. Create the first account

1. In Supabase, open **Authentication → Users → Add user**.
2. Use your own work email and set a password.

**The first account created becomes the owner.** Everyone invited afterwards
arrives as a sales account. Sign in, and you will land on the owner dashboard
with full access; change anyone's role or rate later under **Settings**.

To add your team, invite them the same way — **Authentication → Users**. A
profile row is created for each of them automatically.

---

## Opening the app

The app is plain files, so anything that serves a folder works:

```bash
cd path/to/this/repo
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. To put it on the web, drop the folder onto
Netlify, Vercel or GitHub Pages — there is no build step and no server code.

Serve it over `http://` rather than opening `index.html` straight off disk.
A `file://` page has no real origin, which upsets browser storage and CORS in
ways that vary by browser, and the password-reset link cannot come back to a
`file://` address at all. If sign-in behaves strangely, this is the first
thing to check.

---

## Who can see what

These rules live in the database, so they hold no matter what anyone does in
their browser's dev tools.

| | A sales account | The owner |
|---|---|---|
| Their own profile | read | read + edit anyone |
| Everyone else's profile | **not visible** | visible |
| Their own submissions and sales | read, upload, replace | visible |
| Everyone else's submissions | **not visible** | visible |
| Uploaded files in storage | own folder only | all folders |
| Periods and deadlines | read | read + edit, open/close |
| Their own role and commission rate | **cannot change** | can change |

A few rules worth knowing:

- **The server decides who and when.** The upload timestamp, the identity on a
  submission, and whether it counts as late are all set by the database from
  the period's deadline. The browser cannot influence any of them.
- **A closed period refuses uploads.** Closing a period freezes its numbers.
- **One live file per person per period.** Uploading again replaces the
  previous file, and the clock restarts — the new timestamp is what counts.
- **Sale rows inherit their owner** from the file they belong to, so rows
  cannot be planted in someone else's numbers.

## Commission

Commission is worked out per sale row:

- If the file has a **Commission Rate** column, that rate is used for the row.
- Otherwise the person's own rate from **Settings** is used.

Rates are stored as fractions (`0.05` = 5%); the settings screen shows them as
percentages. New accounts start at 5%.

## Periods

`schema.sql` seeds monthly periods from a year back to a year ahead, with the
current month open. Deadlines default to the 5th of the following month at
17:00 UTC — adjust any of them under **Settings**.

The app has no screen for *creating* periods. To add more, re-run the last
block of `schema.sql` with a wider date range.

## If something goes wrong

### Seeing what is already in the database

If the project has been set up before, this shows what is there now:

```sql
select table_name, string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;
```

`schema.sql` ends with a check that names any column the app needs and the
database does not have, so you get one clear message instead of a broken
screen later on.

To start over from nothing, move the old tables aside rather than deleting
them — you keep the data, and the script builds fresh alongside:

```sql
alter table public.sale_rows   rename to sale_rows_old;
alter table public.submissions rename to submissions_old;
alter table public.periods     rename to periods_old;
alter table public.profiles    rename to profiles_old;
```

| What you see | What it means |
|---|---|
| `syntax error at or near "const"` | JavaScript was pasted into the SQL editor. Only `schema.sql` goes there. |
| "Almost there" setup screen | Step 3 is not done — `js/core.js` still has placeholder values. |
| "Your account has no profile yet" | The signup trigger did not run for that user. Re-run `schema.sql`, then delete and re-invite the user. |
| Sign-in behaves oddly when opened from disk | Serve the folder over `http://` instead — see **Opening the app**. |
| An empty dashboard with no periods | The seed block near the end of `schema.sql` did not run. Run it on its own. |
| `cannot drop columns from view` | An older `commission_summary` view is in the way. Fixed — re-run the current `schema.sql`, which drops it first. |
| `already holds tables from an earlier setup` | Tables exist under these names with different columns. The message lists exactly which columns are missing; see **Seeing what is already in the database**. |
