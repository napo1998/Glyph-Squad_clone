// Service worker: toda la app (código, modelo, wasm, audio) queda en caché al
// instalar, y después se sirve sin red. `vite build` rellena la lista y la versión.
const VERSION = "__SW_VERSION__";
const PRECACHE = /*__PRECACHE__*/ [];
const CACHE = `leaf-plate-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Respuesta 206 con el trozo que pide la cabecera Range, sacado del archivo en caché. */
async function partial(cached, request) {
  const body = await cached.arrayBuffer();
  const [, from, to] = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range")) ?? [];
  const start = from ? Number(from) : Math.max(0, body.byteLength - Number(to || 0));
  const end = from && to ? Math.min(Number(to), body.byteLength - 1) : body.byteLength - 1;
  if (!(start <= end)) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${body.byteLength}` } });
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${body.byteLength}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  // Safari pide el audio por trozos (Range) y no lo reproduce si recibe el archivo entero.
  if (request.headers.has("range")) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => (cached ? partial(cached, request) : fetch(request))),
    );
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).catch(() =>
          request.mode === "navigate" ? caches.match("./index.html") : Response.error(),
        ),
    ),
  );
});
