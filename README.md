# Curbside — Valet Request App

A real, deployable valet pickup app: guests request their car, staff manage a live pickup queue, and admins manage staff accounts. Backed by a database (Prisma), with login/sessions for three roles: `GUEST`, `STAFF`, `ADMIN`.

## Stack
- **Next.js 14** (App Router) — frontend + API routes in one project
- **Prisma** — database ORM. Ships configured for **SQLite** locally; switch one line for **Postgres** in production.
- **JWT in an HTTP-only cookie** — simple session auth, no third-party auth service required
- **bcryptjs** — password hashing

## 1. Local setup

```bash
npm install
cp .env.example .env
npx prisma db push      # creates the SQLite database from the schema
npm run db:seed         # creates demo admin, staff, and guest accounts
npm run dev
```

Visit `http://localhost:3000`. Demo logins (created by the seed script):

| Role  | Email                 | Password   |
|-------|------------------------|-----------|
| Admin | admin@curbside.app     | admin123  |
| Staff | staff@curbside.app     | staff123  |
| Guest | guest@curbside.app     | guest123  |

The guest account already has a sample car on ticket `#042`.

## 2. How it works

- **Guests** sign up, add their vehicle (ticket number, make/model/plate), and tap **Request**. They see a live status stub that updates as staff act on it.
- **Staff** see a shared **Pickup queue** across all guests and move each request through `Waiting → Pulling → Ready → Completed`.
- **Admins** get an extra **Users** tab to create staff and admin accounts (self-service signup always creates a `GUEST` account — staff/admin accounts must be created by an admin, which keeps the valet team's access controlled).

The dashboard polls the API every 3 seconds, so updates show up across devices/phones automatically — no extra setup needed.

## 3. Deploying to Vercel (or any Node host)

SQLite works locally but **won't persist on Vercel's serverless functions** (the filesystem resets). For production:

1. Create a free Postgres database — easiest options are [Neon](https://neon.tech), [Vercel Postgres](https://vercel.com/storage/postgres), or [Supabase](https://supabase.com).
2. In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   to:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. In Vercel's project settings, add environment variables:
   - `DATABASE_URL` — your Postgres connection string
   - `JWT_SECRET` — a long random string (e.g. generate with `openssl rand -hex 32`)
4. Push to GitHub and import the repo in Vercel, or run `vercel` from this folder.
5. After the first deploy, run the schema push and seed against the production database once:
   ```bash
   npx prisma db push
   npm run db:seed   # optional — creates demo accounts; skip or edit for real staff
   ```

## 4. Customizing

- **Remove demo accounts**: edit or delete `prisma/seed.js`, or just create real staff/admin accounts via the admin Users tab and delete the seeded ones directly in the database.
- **Add fields** (e.g. phone number, notes, photo of the car): add columns to the `Vehicle` or `Request` model in `prisma/schema.prisma`, run `npx prisma db push`, then wire the new fields into the forms in `app/dashboard/page.js` and the matching API routes in `app/api/`.
- **Notifications**: the queue currently updates via polling. For instant push-style updates, you could add a WebSocket service (e.g. Pusher, Ably) or Server-Sent Events — ask if you'd like this added.

## Project structure

```
app/
  api/
    auth/{login,register,logout,me}/route.js
    vehicles/route.js
    requests/route.js
    requests/[id]/route.js
    admin/users/route.js
  login/page.js
  register/page.js
  dashboard/page.js        # role-aware: guest / staff / admin views
  layout.js, globals.css
lib/
  db.js                    # Prisma client
  auth.js                  # session signing/verification
prisma/
  schema.prisma            # User, Vehicle, Request models
  seed.js                  # demo data
```
