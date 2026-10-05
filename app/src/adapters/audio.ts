// Reproduce clips grabados de antemano (public/audio/{quz,es}/<clip>.opus, con copia .m4a).
// Si falta un clip, se calla: el texto en pantalla sigue siendo la referencia.
//
// iPhone: Safari no siempre decodifica Ogg Opus, así que ahí se usa la copia AAC (.m4a).
// Y solo deja sonar un <audio> que arrancó con un toque: por eso hay un único elemento,
// que el primer clip desbloquea dentro del clic y los siguientes reutilizan.

import { AudioLang } from "../domain/message";

let element: HTMLAudioElement | null = null;
let finish: ((ok: boolean) => void) | null = null;
let playId = 0;

/** "opus" donde el navegador lo decodifica; "m4a" (AAC) en el resto, sobre todo iPhone y iPad. */
export function clipFormat(audio: Pick<HTMLAudioElement, "canPlayType">): "opus" | "m4a" {
  return audio.canPlayType('audio/ogg; codecs="opus"') ? "opus" : "m4a";
}

function playOne(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = (element ??= new Audio());
    finish = resolve;
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.src = url;
    audio.play().catch(() => resolve(false));
  });
}

export function stopAudio(): void {
  playId++;
  element?.pause();
  finish?.(false);
  finish = null;
}

/** Devuelve false si algún clip no existe o no se pudo reproducir. */
export async function playClips(lang: AudioLang, clips: string[]): Promise<boolean> {
  stopAudio();
  const id = playId;
  const format = clipFormat((element ??= new Audio()));
  for (const clip of clips) {
    // El primer play() ocurre sin await previo: sigue dentro del toque del usuario.
    const ok = await playOne(`audio/${lang}/${clip}.${format}`);
    // Otro clic lo cortó: no es un clip que falte.
    if (id !== playId) return true;
    if (!ok) return false;
  }
  return true;
}
