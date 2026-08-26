# Abomination

An icebreaker that starts with an argument.

Everyone joins a room on their own phone and confesses twelve food crimes in
private. Then a bot reads the room out loud, names who stood alone, and the
whole group argues about it in a live chat. It ends by telling you the one
thing you actually agree on.

**Play:** https://aunysillyme.github.io/abomination/

## How it works

- `index.html` is the whole frontend. One self-contained file, no build step.
- `worker/` is a Cloudflare Worker plus one Durable Object. The DO *is* the
  room: it holds the roster, the sealed confessions, the message log, and the
  bot. Rooms are addressed by name, so `idFromName("ROT13")` is the entire
  room system.
- The bot is not a separate service and not a language model. It is a function
  inside the room that reads the real tally and speaks. That is why it can say
  "@SAM stands alone" and be right.

## Endpoints

| Method | Path | Does |
|---|---|---|
| POST | `/r/:code/join` | join by name, returns your id and the deck |
| POST | `/r/:code/confess` | store your answers, privately |
| POST | `/r/:code/begin` | start the trial (needs 2 confessions) |
| POST | `/r/:code/advance` | next crime |
| POST | `/r/:code/say` | chat; `@judge` wakes the bot |
| GET | `/r/:code/state?since=N` | roster, phase, current split, new messages |

Clients poll `state` every 1.4s. No WebSockets, deliberately.

## Design

Three of my own art specs, layered so the medium performs the arc:

- **Negative Space** is the ground: a pure void, form drawn only by luminous contour.
- **Schitzo** is the reckoning: the points of light open into eyes that follow your cursor.
- **Sketchy** is the verdict: the screen flips to bright paper, hand-scrawled.

Cold void, then being seen, then warm paper.

Built live in 30 minutes.
