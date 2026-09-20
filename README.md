# discord-music-bot

A radio for Discord voice channels. Search YouTube by name or paste a link, queue it up, and control playback with either slash commands or text commands.

- **Play anything** — song names, YouTube links, or whole playlists
- **Full queue control** — skip, remove, move, shuffle, clear, loop a track or the whole queue
- **Live controls** — volume with no gap in playback, seek, pause/resume, a now-playing panel with buttons
- **Autoplay** — keeps the music going with related tracks when the queue runs dry
- **Saved playlists** — name a queue and reload it later; survives restarts
- **Runs in Docker** — ffmpeg and yt-dlp are baked into the image, so there's nothing to install on the host

Every command works two ways: `/play` or `!play`. The prefix is configurable per server, and mentioning the bot always works if someone forgets it.

---

## Setup

### 1. Create the Discord application

1. Go to the [Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **Bot**, click *Reset Token* and copy it. This is `DISCORD_TOKEN`.
3. Still under **Bot**, enable the **Message Content Intent** under *Privileged Gateway Intents*. Without it, text commands see empty messages and the bot fails to log in.
4. Copy the **Application ID** from *General Information*. This is `DISCORD_CLIENT_ID`.
5. In Discord, enable Developer Mode (*Settings → Advanced*), right-click your server, and *Copy Server ID*. This is `DISCORD_GUILD_ID`.

### 2. Invite the bot

Use this URL with your client ID substituted in:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3214336&scope=bot%20applications.commands
```

That permission integer covers Connect, Speak, Send Messages, Embed Links, Read Message History, and Use Application Commands.

### 3. Configure

```bash
cp .env.example .env
# then fill in DISCORD_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID
```

### 4. Run

```bash
docker compose build
docker compose run --rm bot node scripts/deploy-commands.js   # register slash commands
docker compose up
```

Slash commands registered to a guild appear instantly. You only need to re-run `deploy-commands` when you add, remove, or change a command's options — not on every start.

---

## Development

`docker compose up` picks up `docker-compose.override.yml` automatically, which bind-mounts `./src` and runs nodemon. Edit a file on the host and the bot restarts inside the container.

```bash
docker compose up              # dev, with hot reload
docker compose logs -f         # follow logs
npm test                       # unit tests (queue logic, parsing) — runs on the host
```

### Why `node_modules` isn't bind-mounted

`better-sqlite3`, `sodium-native` and `@discordjs/opus` compile to native binaries. A Windows or macOS `npm install` produces binaries the Linux container can't load (`invalid ELF header`). Only `./src` and `./scripts` are mounted, so the image's Linux-built `node_modules` is never shadowed.

The practical consequence: after adding a dependency, run `npm install <pkg>` on the host to update the lockfile, then `docker compose build` to actually get it. Running `npm install` on the host will likely fail to compile the native modules — that's expected and harmless.

---

## Commands

Everything below works as `/command` or `!command`.

### Playback
| Command | Aliases | What it does |
|---|---|---|
| `play <query>` | `p` | Play a song by name or link. Playlist links queue the whole playlist. |
| `search <query>` | `find` | Show the top 5 results and pick one from a menu |
| `skip [amount]` | `s`, `next` | Skip the current track, or several |
| `pause` / `resume` | `unpause` | Pause and resume |
| `stop` | `dc`, `leave` | Stop, clear the queue and leave |
| `join` | `summon` | Bring the bot into your channel |
| `volume [0-200]` | `vol`, `v` | Show or set volume. Takes effect instantly. |
| `seek <position>` | | Jump to `1:30`, `90`, or `1m30s` |
| `forward [secs]` / `rewind [secs]` | `ff` / `rw` | Jump by 10 seconds, or a given amount |
| `nowplaying` | `np` | Live panel with a progress bar and buttons |

### Queue
| Command | Aliases | What it does |
|---|---|---|
| `queue [page]` | `q` | Paginated queue view |
| `remove <index>` | `rm` | Remove one track |
| `move <from> <to>` | `mv` | Reorder |
| `shuffle` | `sh` | Shuffle everything upcoming |
| `clear` | `empty` | Empty the queue, keep playing the current track |
| `loop [mode]` | `repeat`, `l` | `off`, `track` or `queue`. Omit to cycle. |
| `autoplay [on\|off]` | `ap` | Keep playing related tracks when the queue empties |

### Saved playlists
| Command | What it does |
|---|---|
| `playlist save <name> [me\|server]` | Save the current queue |
| `playlist load <name> [append\|replace]` | Queue a saved playlist |
| `playlist list [mine\|server]` | List what's saved |
| `playlist show <name>` | See a playlist's tracks |
| `playlist delete <name>` | Delete one |

Playlists saved with `server` scope are shared and require Manage Server; the default is private to you.

### Settings
| Command | What it does |
|---|---|
| `prefix [value]` | Show or change the text prefix (Manage Server to change) |
| `defaultvolume [0-200]` | Volume new sessions start at |
| `settings [key] [value]` | View settings, or change idle timeout / DJ role / announcements |
| `help [command]` | Command list, or details on one |

Setting a **DJ role** in `/settings` restricts playback commands to members with that role (Manage Server always bypasses it).

---

## Deploying to EC2

Build the image somewhere with memory to spare and let the instance pull it — compiling native modules on a t3.micro will run out of RAM. A t3.small handles a handful of servers comfortably.

On the instance:

```bash
git clone <your-repo> && cd discord-music-bot
cp .env.example .env    # fill it in, then: chmod 600 .env
./scripts/ec2-deploy.sh
```

The deploy script uses `-f docker-compose.yml -f docker-compose.prod.yml`, which deliberately suppresses the dev override — no bind mounts, restart policy on, logs rotated at 10MB × 3.

For a tidier secret story, put the token in AWS SSM Parameter Store as a `SecureString` and have the deploy script write an ephemeral `.env` from it, with an instance role granting `ssm:GetParametersByPath` and `kms:Decrypt`. Never pass the token as a Docker build arg — it would persist in the image layers.

### Data

Saved playlists and per-server settings live in SQLite on the `botdata` named volume. `docker compose down` preserves it; `docker compose down -v` deletes it. To back up:

```bash
docker compose cp bot:/app/data/bot.db ./backup.db
```

---

## Keeping YouTube playback working

This is the part that breaks in production, so it's worth understanding up front.

**yt-dlp goes stale.** YouTube changes its extractors every few weeks, and an out-of-date yt-dlp fails *every* request. The version is pinned in the Dockerfile as `YTDLP_VERSION`. When playback starts failing across the board, bump it and rebuild:

```bash
docker compose build --build-arg YTDLP_VERSION=2025.10.01
```

Worth doing on a schedule — a weekly cron running `ec2-deploy.sh` keeps you ahead of it.

**Bot detection.** Datacenter IPs get challenged far more aggressively than home connections, so a bot that works fine locally may hit "Sign in to confirm you're not a bot" on EC2. The bot already rotates player clients to dodge most of this. If it isn't enough:

1. Export cookies from a browser in Netscape format (a "Get cookies.txt" extension works).
2. **Use a throwaway Google account** — yt-dlp traffic can get an account flagged.
3. Copy the file onto the data volume and point `YTDLP_COOKIES_FILE` at it:
   ```bash
   docker compose cp ./cookies.txt bot:/app/data/cookies.txt
   ```
4. Set `YTDLP_COOKIES_FILE=/app/data/cookies.txt` in `.env` and restart.

Keeping cookies on the volume rather than in the image means refreshing them doesn't need a rebuild. Note that yt-dlp rotates the cookie file as it uses it, and cookies from a session you stay logged into elsewhere tend to get invalidated within days.

`YTDLP_PROXY` is available as a last resort if the host IP is blocked outright.

**Diagnosing failures.** Error messages distinguish between causes — a private video, an age-restricted one, a stale extractor, and rate limiting all say different things. Check `docker compose logs` for the underlying yt-dlp stderr.

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | *required* | Bot token |
| `DISCORD_CLIENT_ID` | *required* | Application ID, for command registration |
| `DISCORD_GUILD_ID` | — | Register commands to this server. Empty registers globally (slow to propagate). |
| `DEFAULT_PREFIX` | `!` | Fallback prefix for new servers |
| `OWNER_IDS` | — | Comma-separated user IDs |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `DB_PATH` | `/app/data/bot.db` | SQLite location |
| `FFMPEG_PATH` / `YTDLP_PATH` | container paths | Binary locations |
| `IDLE_TIMEOUT_SECONDS` | `300` | Seconds alone or idle before disconnecting |
| `DEFAULT_VOLUME` | `50` | Starting volume for new servers |
| `MAX_QUEUE_SIZE` | `1000` | Queue cap |
| `MAX_PLAYLIST_IMPORT` | `200` | Cap when queueing a YouTube playlist |
| `YTDLP_COOKIES_FILE` | — | Netscape cookie file, for bot-detection workarounds |
| `YTDLP_PROXY` | — | Proxy for yt-dlp |

---

## Troubleshooting

**"Used disallowed intents" on startup** — the Message Content Intent isn't enabled in the Developer Portal.

**Slash commands don't appear** — run `docker compose run --rm bot node scripts/deploy-commands.js` and confirm `DISCORD_GUILD_ID` is set. If you previously registered globally, clear those with `node scripts/clear-commands.js --global` or you'll see duplicates.

**Bot joins but there's no sound** — check the logs for yt-dlp errors. Test the pipeline directly:
```bash
docker compose run --rm bot sh -c "yt-dlp 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' -o - | ffmpeg -i pipe:0 -f s16le -ar 48000 -ac 2 -t 5 pipe:1 | wc -c"
```
Roughly 960000 bytes means the audio path is fine and the problem is in voice, not extraction.

**`SQLITE_CANTOPEN`** — the data volume has wrong ownership. `docker compose down -v` and rebuild.

**Container exits with `invalid ELF header`** — a host `node_modules` got mounted in. Make sure you haven't added a `.:/app` bind mount to the compose files.
