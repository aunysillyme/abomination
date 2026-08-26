import { DurableObject } from "cloudflare:workers";

const DECK = [
  { t: "Paper straws",              s: "the soggy ones" },
  { t: "Boneless wings",            s: "they are nuggets" },
  { t: "Pineapple on pizza",        s: "you know what you did" },
  { t: "Pumpkin spice coffee",      s: "seasonal crime" },
  { t: "Peanut butter and jelly",   s: "a texture problem" },
  { t: "Fries in a milkshake",      s: "salt meets dairy" },
  { t: "Well done steak",           s: "it was already dead" },
  { t: "Naps",                      s: "a nap is a small death" },
  { t: "Orange juice",              s: "pulp is not the issue" },
  { t: "Ketchup on eggs",           s: "breakfast has boundaries" },
  { t: "Clapping when the plane lands", s: "he is at work" },
  { t: "Replying k",                s: "one letter, whole war" }
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", ...CORS }
  });

const clean = (v, n) =>
  String(v == null ? "" : v).slice(0, n).replace(/[\x00-\x1f\x7f]/g, "").trim();

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get("s")) || {
        players: [], msgs: [], seq: 0, phase: "lobby", crime: 0
      };
    });
  }

  async save() {
    await this.ctx.storage.put("s", this.s);
  }

  push(from, body, kind) {
    const s = this.s;
    s.seq += 1;
    s.msgs.push({ i: s.seq, from, body, kind: kind || "say" });
    if (s.msgs.length > 300) s.msgs = s.msgs.slice(-300);
  }

  p(id) {
    return this.s.players.find((x) => x.id === id) || null;
  }

  tally(ci) {
    const ab = [], fi = [];
    for (const p of this.s.players) {
      const v = p.answers ? p.answers[ci] : undefined;
      if (v === 1) ab.push(p.name);
      else if (v === 0) fi.push(p.name);
    }
    return { ab, fi };
  }

  judgeOnReveal(ci) {
    const c = DECK[ci];
    const { ab, fi } = this.tally(ci);
    const n = ab.length + fi.length;
    if (!n) return;

    this.push("JUDGE", c.t + ". " + ab.length + " said abomination. " + fi.length + " said fine.", "judge");

    if (ab.length && fi.length === 0) {
      this.push("JUDGE", "Unanimous. This room agrees on something. Suspicious.", "judge");
      return;
    }
    if (fi.length && ab.length === 0) {
      this.push("JUDGE", "Nobody objects. " + c.t + " walks free. Disgraceful.", "judge");
      return;
    }
    if (fi.length === 1) {
      this.push("JUDGE", "@" + fi[0] + " stands alone. Explain yourself.", "judge");
      return;
    }
    if (ab.length === 1) {
      this.push("JUDGE", "@" + ab[0] + " is the only one bothered. Everyone else is fine with it.", "judge");
      return;
    }
    if (ab.length === fi.length) {
      this.push("JUDGE", "Dead split. " + ab.length + " to " + fi.length + ". This room is broken.", "judge");
      return;
    }
    const min = ab.length < fi.length ? ab : fi;
    const maj = Math.max(ab.length, fi.length);
    this.push("JUDGE", "Minority report: " + min.map((x) => "@" + x).join(", ") + ". Outnumbered " + maj + " to " + min.length + ".", "judge");
  }

  judgeOnConfess(p) {
    let ab = 0;
    for (let i = 0; i < DECK.length; i++) if (p.answers[i] === 1) ab += 1;
    const n = DECK.length;
    const at = "@" + p.name + " ";
    let verdict;
    if (ab === n) verdict = at + "called all twelve an abomination. Nothing on earth is safe from this person.";
    else if (ab === 0) verdict = at + "objected to nothing. Either a saint or has never tasted anything.";
    else if (ab >= n - 2) verdict = at + "objected to " + ab + " of " + n + ". A genuinely difficult person.";
    else if (ab >= 8) verdict = at + "objected to " + ab + ". Hostile, but has standards.";
    else if (ab >= 5) verdict = at + "objected to " + ab + " of " + n + ". Dangerously reasonable.";
    else if (ab >= 3) verdict = at + "only objected to " + ab + " things. Easygoing. Suspicious.";
    else verdict = at + "objected to " + ab + ". This person will eat literally anything.";
    this.push("JUDGE", verdict, "judge");

    const ready = this.s.players.filter((x) => x.done).length;
    if (ready === 1 && this.s.players.length < 2) {
      this.push("JUDGE", "Nobody else is here to be wrong at. Send them the room code.", "judge");
    } else if (ready >= 2 && this.s.players.every((x) => x.done)) {
      this.push("JUDGE", "That is everyone. Begin the trial when you are ready to lose friends.", "judge");
    }
  }

  judgeReply(asker, text) {
    const s = this.s;
    const low = text.toLowerCase();
    const line = (b) => this.push("JUDGE", b, "judge");

    if (s.phase === "lobby") {
      const waiting = s.players.filter((p) => !p.done).map((p) => p.name);
      const ready = s.players.filter((p) => p.done).length;
      if (ready < 2) {
        if (s.players.length < 2) {
          return line("You are alone in here. A trial needs someone to disagree with. Send them the code.");
        }
        if (waiting.length) {
          return line("Still confessing: " + waiting.map((x) => "@" + x).join(", ") + ". Nothing starts until they finish.");
        }
        return line("One confession is not a trial. Get one more in here.");
      }
      if (waiting.length) {
        return line("Still confessing: " + waiting.map((x) => "@" + x).join(", ") + ". Start without them if you are cruel.");
      }
      return line("Everyone has confessed. Someone press begin the trial.");
    }

    if (s.phase === "over") {
      return line("Court is closed. The verdict is on the paper. Take it up with @" + asker + ".");
    }

    const ci = s.crime;
    const c = DECK[ci];
    const { ab, fi } = this.tally(ci);

    if (/sentence|punish|verdict|guilty|penalt/.test(low)) {
      const min = ab.length && fi.length ? (ab.length < fi.length ? ab : fi) : [];
      if (min.length === 1) return line("@" + min[0] + " eats first. Alone. Next crime.");
      if (!min.length) return line("No sentence. You all agreed. Try harder.");
      return line(min.map((x) => "@" + x).join(" and ") + " share the shame. Split evenly.");
    }
    if (/who|split|count|score|tally/.test(low)) {
      return line(c.t + ": " + ab.length + " abomination, " + fi.length + " fine." + (ab.length ? " Abomination side: " + ab.join(", ") + "." : ""));
    }
    if (/why|explain|defend|reason/.test(low)) {
      return line(c.s + ". That is the whole argument. @" + asker + ", sit down.");
    }
    if (/wrong|unfair|bias|rigged|cheat/.test(low)) {
      return line("I read the votes. The votes read you. @" + asker + " is coping.");
    }
    const pool = [
      "@" + asker + " has been quiet this whole trial. Noted.",
      "Objection noted. Overruled. " + c.t + " stands.",
      "@" + asker + ", you voted on this one too. I have the record.",
      "The court does not take questions from the accused.",
      "Say that again with your whole chest, @" + asker + "."
    ];
    line(pool[(s.seq + asker.length) % pool.length]);
  }

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean);
    const act = path[path.length - 1];
    const s = this.s;

    if (req.method === "GET" && act === "state") {
      const since = Number(url.searchParams.get("since") || 0) || 0;
      return json({
        phase: s.phase,
        crime: s.crime,
        seq: s.seq,
        players: s.players.map((p) => {
          const o = { id: p.id, name: p.name, done: !!p.done, at: p.at || 0 };
          if (s.phase === "over") o.answers = p.answers || {};
          return o;
        }),
        msgs: s.msgs.filter((m) => m.i > since),
        reveal: s.phase === "trial" ? this.tally(s.crime) : null
      });
    }

    let b = {};
    try { b = await req.json(); } catch (e) { b = {}; }

    if (act === "join") {
      const name = clean(b.name, 14).toUpperCase().replace(/[^A-Z0-9 _-]/g, "");
      if (!name) return json({ error: "name required" }, 400);
      let p = s.players.find((x) => x.name === name);
      if (!p) {
        if (s.players.length >= 12) return json({ error: "room is full" }, 400);
        p = { id: crypto.randomUUID().slice(0, 8), name, answers: {}, done: false, at: 0 };
        s.players.push(p);
        this.push("SYS", name + " entered the room", "sys");
        if (s.players.length === 1) {
          this.push("JUDGE", "Court is in session. Confess in private. Nobody sees anyone else's answers until the reckoning.", "judge");
        }
      }
      await this.save();
      return json({ id: p.id, name: p.name, deck: DECK });
    }

    if (act === "confess") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const a = b.answers && typeof b.answers === "object" ? b.answers : {};
      const out = {};
      for (let i = 0; i < DECK.length; i++) if (a[i] === 0 || a[i] === 1) out[i] = a[i];
      p.answers = out;
      p.at = Object.keys(out).length;
      if (p.at >= DECK.length && !p.done) {
        p.done = true;
        this.push("SYS", p.name + " has confessed to all twelve", "sys");
        this.judgeOnConfess(p);
      }
      await this.save();
      return json({ ok: true, done: p.done });
    }

    if (act === "say") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const text = clean(b.text, 240);
      if (!text) return json({ error: "empty" }, 400);
      this.push(p.name, text, "say");
      if (/@judge\b/i.test(text)) this.judgeReply(p.name, text);
      await this.save();
      return json({ ok: true });
    }

    if (act === "begin") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      if (s.phase !== "lobby") return json({ ok: true });
      const confessed = s.players.filter((x) => x.done).length;
      if (confessed < 2) return json({ error: "need at least 2 confessions" }, 400);
      s.phase = "trial";
      s.crime = 0;
      this.push("JUDGE", "The confessions are sealed. " + confessed + " of you are about to find out about each other.", "judge");
      this.judgeOnReveal(0);
      await this.save();
      return json({ ok: true });
    }

    if (act === "advance") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      if (s.phase !== "trial") return json({ ok: true });
      if (s.crime >= DECK.length - 1) {
        s.phase = "over";
        this.push("JUDGE", "Twelve crimes. Court adjourned. Now go look at what you actually have in common.", "judge");
      } else {
        s.crime += 1;
        this.judgeOnReveal(s.crime);
      }
      await this.save();
      return json({ ok: true, phase: s.phase, crime: s.crime });
    }

    if (act === "reset") {
      this.s = { players: [], msgs: [], seq: 0, phase: "lobby", crime: 0 };
      await this.save();
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 404);
  }
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "deck") return json({ deck: DECK });

    if (parts[0] !== "r" || parts.length < 3) return json({ error: "not found" }, 404);
    const code = parts[1].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (!code) return json({ error: "bad room" }, 400);

    const id = env.ROOM.idFromName(code);
    return env.ROOM.get(id).fetch(req);
  }
};
