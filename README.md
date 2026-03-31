# Amethyst Hub

Amethyst Hub is a combined website and Discord bot for issuing access keys, tracking key expiry, and handling moderation commands from a single codebase.

## What is included

- Public website for generating normal user keys
- Dark landing page with a public access portal and service status
- Public script library with searchable game cards and one-click loader copies
- Admin dashboard for script uploads, library metadata, and raw script links
- SQLite database for keys, users, blacklists, and moderation history
- Discord bot with the required `~` commands
- 24-hour expiry for normal keys
- Premium keys that never expire
- Key format of `AME_` followed by 15 characters

## Commands

- `~prem-gen {user} {robloxuser}`
- `~gen-key {user} {robloxuser}`
- `~reset_hwid`
- `~revoke_key {user} {key}`
- `~revoke_prem {user} {key}`
- `~blacklists {user}`
- `~unblacklist {user}`
- `~ban {user} {reason}`
- `~kick {user} {reason}`
- `~mute {user} {duration} {reason}`
- `~role {user} {role}`
- `~unban {user}`
- `~unmute {user}`
- `~commands`
- `~check-perms`

Also included:

- `~blacklist {user} {reason}`
- `~reset_hwid {user}` for admin convenience

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Fill in the Discord values inside `.env`:

   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `COMMAND_PREFIX` if you want to override the default `~`
- `ADMIN_ROLE_IDS` if you want specific staff roles to control the bot
   - `ADMIN_USERS` for dashboard logins in the format `howard:password,xuno:password`
   - `ADMIN_SESSION_SECRET` as a long random secret for signing the admin cookie

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the site at `http://localhost:3000`
6. Open the public script library at `http://localhost:3000/scripts`
7. Open the admin panel at `http://localhost:3000/admin`

## Discord bot notes

- The bot uses prefix commands, not slash commands.
- Staff authorization is based on either `Administrator`, `Manage Server`, or role IDs listed in `ADMIN_ROLE_IDS`.
- For moderation actions, the bot still needs the matching Discord permissions and a role high enough in the server hierarchy.
- Required Discord permissions for full functionality are `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Kick Members`, `Ban Members`, `Moderate Members`, and `Manage Roles`.
- `~mute` accepts values like `30m`, `12h`, or `7d`.
- `~unban` works best with a user ID.
- Use `~commands` to show the current command list in Discord.
- Use `~check-perms` to confirm the bot's server permissions and get a role hierarchy reminder.

## Roblox integration

- The versioned Roblox key GUI scripts live in `integrations/roblox/`.
- They currently point to the live Railway deployment at `https://luminia-hub-production.up.railway.app`.
- If your production domain changes later, update `SITE_URL` near the bottom of the Lua file you are using.
- The shared unscoped loader is now `integrations/roblox/amethyst.lua`.

## Remaining external rename steps

- The live Railway URL still contains `luminia` because generated Railway domains follow the current service name.
- If you rename the Railway service or switch fully to a custom domain like `amethyst-hub.is-a.dev`, update `SITE_URL` in Railway and in the Roblox Lua files.
- If you want the GitHub URL to match too, rename the repository from `luminia-hub` to `amethyst-hub` in GitHub settings.

## Admin dashboard

- Visit `/admin` to sign in and manage uploadable scripts.
- Admin accounts come from `ADMIN_USERS`, which is a comma-separated list of `username:password` pairs.
- Library entries support title, slug, place ID, status label, cover image URL, feature tags, description, and script content.
- Saved scripts are exposed as raw URLs at `/api/scripts/{slug}/raw`.
- The public `/scripts` page lets users search the library and copy a ready-to-run loadstring for each script.
- Script uploads are stored in the same SQLite database as the rest of the platform, so use persistent storage in production.

## API

### `POST /api/keys/generate`

Creates or reuses an active normal key.

Request body:

```json
{
  "discordUserId": "123456789012345678",
  "discordTag": "user#0001",
  "robloxUser": "RobloxName"
}
```

### `GET /api/keys/status?discordUserId=123456789012345678`

Returns all keys stored for that Discord user.

### `POST /api/admin/login`

Signs an admin in and sets the dashboard session cookie.

### `GET /api/admin/scripts`

Returns every uploaded script for an authenticated admin session.

### `POST /api/admin/scripts`

Creates or updates a script by slug for an authenticated admin session.

### `GET /api/scripts`

Returns the public script library metadata used by the `/scripts` page.

### `GET /api/scripts/{slug}/raw`

Returns the raw script content as plain text.

## Free hosting options

The easiest low-cost split is:

- Website/API: host on Render or Railway
- Bot worker: host on Railway, Render worker, or another always-on Node host
- Database: keep SQLite for a starter build, but move to Postgres later if you need horizontal scaling

I also included deployment notes in the final handoff so you can choose a provider based on what is free right now.
