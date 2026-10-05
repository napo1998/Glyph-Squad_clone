import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Hace de <audio>: guarda cada src y cada play(); `finishClip` simula que el clip terminó o falló. */
class FakeAudio {
  static made: FakeAudio[] = [];
  static opus = "";
  src = "";
  played: string[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeAudio.made.push(this);
  }
  canPlayType(type: string) {
    return type.includes("opus") ? FakeAudio.opus : "maybe";
  }
  play() {
    this.played.push(this.src);
    return Promise.resolve();
  }
  pause() {}
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function finishClip(audio: FakeAudio, ok = true) {
  await tick();
  (ok ? audio.onended : audio.onerror)?.();
}

/** El módulo guarda su <audio>: cada prueba lo carga de nuevo. */
async function load(opus: string) {
  FakeAudio.made = [];
  FakeAudio.opus = opus;
  vi.stubGlobal("Audio", FakeAudio);
  vi.resetModules();
  return import("../../app/src/adapters/audio");
}

afterEach(() => vi.unstubAllGlobals());

describe("audio", () => {
  it("usa la copia AAC donde no se decodifica Opus (iPhone)", async () => {
    const { playClips } = await load("");
    const done = playClips("quz", ["M03", "n7"]);
    const [audio] = FakeAudio.made;
    expect(audio.played).toEqual(["audio/quz/M03.m4a"]);
    await finishClip(audio);
    await finishClip(audio);
    expect(await done).toBe(true);
    expect(audio.played).toEqual(["audio/quz/M03.m4a", "audio/quz/n7.m4a"]);
  });

  it("sigue con Opus donde se puede", async () => {
    const { playClips } = await load("probably");
    const done = playClips("es", ["M01"]);
    await finishClip(FakeAudio.made[0]);
    expect(await done).toBe(true);
    expect(FakeAudio.made[0].played).toEqual(["audio/es/M01.opus"]);
  });

  it("reutiliza un solo <audio>: iOS solo deja sonar el que arrancó con el toque", async () => {
    const { playClips } = await load("");
    const first = playClips("es", ["M01", "n3"]);
    await finishClip(FakeAudio.made[0]);
    await finishClip(FakeAudio.made[0]);
    await first;
    const second = playClips("es", ["M02"]);
    await finishClip(FakeAudio.made[0]);
    await second;
    expect(FakeAudio.made).toHaveLength(1);
  });

  it("el primer play() ocurre en el mismo turno del clic", async () => {
    const { playClips } = await load("");
    void playClips("es", ["M01"]);
    expect(FakeAudio.made[0].played).toHaveLength(1);
  });

  it("un clip que falla devuelve false; uno cortado por otro clic, no", async () => {
    const { playClips } = await load("");
    const missing = playClips("es", ["M09"]);
    await finishClip(FakeAudio.made[0], false);
    expect(await missing).toBe(false);

    const cut = playClips("es", ["M01", "n1"]);
    const next = playClips("es", ["M02"]);
    expect(await cut).toBe(true);
    await finishClip(FakeAudio.made[0]);
    expect(await next).toBe(true);
  });

  it("cada clip Opus tiene su copia .m4a", () => {
    for (const lang of ["es", "quz"]) {
      const dir = join(__dirname, "../../app/public/audio", lang);
      const clips = readdirSync(dir).filter((name) => name.endsWith(".opus"));
      expect(clips.length).toBeGreaterThan(0);
      for (const clip of clips) expect(existsSync(join(dir, clip.replace(/\.opus$/, ".m4a"))), clip).toBe(true);
    }
  });
});
