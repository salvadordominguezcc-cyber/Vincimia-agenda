// Service worker mínimo para la PWA: no guarda caché agresivo,
// solo deja que el navegador ofrezca "Instalar app". Si un día
// quieres trabajo sin internet, aquí es donde se agrega.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", () => {
  self.clients.claim();
});
self.addEventListener("fetch", () => {
  // Sin interceptar: la app siempre pide los datos frescos al servidor.
});
