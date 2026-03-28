# Luminia Hub

Luminia Hub is a combined website and Discord bot for issuing access keys, tracking key expiry, and handling moderation commands from a single codebase.

## What is included

- Public website for generating normal user keys
- SQLite database for keys, users, blacklists, and moderation history
- Discord bot with the required `!` commands
- 24-hour expiry for normal keys
- Premium keys that never expire
- Key format of `LUM_` followed by 15 characters

## Commands

- `!prem-gen {user} {robloxuser}`
- `!gen-key {user} {robloxuser}`
- `!reset_hwid`
- `!revoke_key {user} {key}`
- `!revoke_prem {user} {key}`
- `!blacklists {user}`
- `!unblacklist {user}`
- `!ban {user} {reason}`
- `!kick {user} {reason}`
- `!mute {user} {duration} {reason}`
- `!role {user} {role}`
- `!unban {user}`
- `!unmute {user}`
- `!commands`
- `!check-perms`

Also included:

- `!blacklist {user} {reason}`
- `!reset_hwid {user}` for admin convenience

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
   - `ADMIN_ROLE_IDS` if you want specific staff roles to control the bot

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open the site at `http://localhost:3000`

## Discord bot notes

- The bot uses prefix commands, not slash commands.
- Staff authorization is based on either `Administrator`, `Manage Server`, or role IDs listed in `ADMIN_ROLE_IDS`.
- For moderation actions, the bot still needs the matching Discord permissions and a role high enough in the server hierarchy.
- Required Discord permissions for full functionality are `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Kick Members`, `Ban Members`, `Moderate Members`, and `Manage Roles`.
- `!mute` accepts values like `30m`, `12h`, or `7d`.
- `!unban` works best with a user ID.
- Use `!commands` to show the current command list in Discord.
- Use `!check-perms` to confirm the bot's server permissions and get a role hierarchy reminder.

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

## Free hosting options

The easiest low-cost split is:

- Website/API: host on Render or Railway
- Bot worker: host on Railway, Render worker, or another always-on Node host
- Database: keep SQLite for a starter build, but move to Postgres later if you need horizontal scaling

I also included deployment notes in the final handoff so you can choose a provider based on what is free right now.
