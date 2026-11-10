/* Applique le thème avant l'affichage (évite un flash clair/sombre).
   Choix enregistré par le bouton, sinon réglage de Windows. */
'use strict';
(() => {
  let t = null;
  try { t = localStorage.getItem('theme'); } catch (e) { /* stockage indisponible */ }
  if (t !== 'light' && t !== 'dark') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
})();
