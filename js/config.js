/* =====================================================================
   Configuration de démonstration de Bento New Tab.

   Pour personnaliser SANS toucher à ce fichier :
     1. copier ce fichier en  js/config.local.js  (ignoré par Git) ;
     2. modifier la copie : elle remplace cette configuration au chargement.
   ===================================================================== */
'use strict';
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

  // Jours fériés en France (fixes + calculés à partir de Pâques)
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  function holidaysFR(y) {
    const e = easter(y);
    const plus = (n) => { const d = new Date(e); d.setDate(d.getDate() + n); return iso(d); };
    return [`${y}-01-01`, plus(1), `${y}-05-01`, `${y}-05-08`, plus(39), plus(50),
      `${y}-07-14`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`];
  }

  // Exemple d'alternance : une semaine d'école toutes les 3 semaines
  const monday = new Date(today); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 21);
  const schoolWeeks = Array.from({ length: 17 }, (_, i) => {
    const s = new Date(monday); s.setDate(s.getDate() + i * 21);
    const e = new Date(s); e.setDate(e.getDate() + 4);
    return { start: iso(s), end: iso(e), label: `Module ${i + 1}` };
  });

  window.CONFIG = {
    // ---------- Raccourcis ----------
    // icon : fichier dans img/sites/ ; favicon : adresse d'une icône ; sinon l'icône du site
    // est chargée en direct (voir « favicons » plus bas), ou une pastille avec l'initiale.
    groups: [
      { name: 'Quotidien', links: [
        { name: 'Gmail', url: 'https://mail.google.com/' },
        { name: 'Agenda', url: 'https://calendar.google.com/' },
        { name: 'Drive', url: 'https://drive.google.com/' },
        { name: 'Notion', url: 'https://www.notion.so/' },
        { name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
      ] },
      { name: 'Dev', links: [
        { name: 'GitHub', url: 'https://github.com/' },
        { name: 'Stack Overflow', url: 'https://stackoverflow.com/' },
        { name: 'MDN', url: 'https://developer.mozilla.org/fr/' },
        { name: 'Docker Hub', url: 'https://hub.docker.com/' },
        { name: 'Excalidraw', url: 'https://excalidraw.com/' },
      ] },
      { name: 'Cyber', links: [
        { name: 'CyberChef', url: 'https://gchq.github.io/CyberChef/', color: '#3f6fb5' },
        { name: 'VirusTotal', url: 'https://www.virustotal.com/' },
        { name: 'ATT&CK', url: 'https://attack.mitre.org/', color: '#b5232b' },
        { name: 'NVD', url: 'https://nvd.nist.gov/' },
        { name: 'CERT-FR', url: 'https://cert.cyber.gouv.fr/', color: '#000091' },
        { name: 'OWASP', url: 'https://owasp.org/' },
        { name: 'crt.sh', url: 'https://crt.sh/', color: '#4b5563' },
      ] },
      { name: 'IA', links: [
        { name: 'Hugging Face', url: 'https://huggingface.co/' },
        { name: 'ChatGPT', url: 'https://chatgpt.com/' },
        { name: 'Gemini', url: 'https://gemini.google.com/' },
        { name: 'Le Chat', url: 'https://chat.mistral.ai/' },
        { name: 'Perplexity', url: 'https://www.perplexity.ai/' },
      ] },
      { name: 'Apprendre', links: [
        { name: 'PortSwigger', url: 'https://portswigger.net/web-security' },
        { name: 'SecNum', title: 'SecNumacadémie (ANSSI)', url: 'https://secnumacademie.gouv.fr/', color: '#000091' },
        { name: 'OpenClassrooms', url: 'https://openclassrooms.com/' },
        { name: 'Coursera', url: 'https://www.coursera.org/' },
        { name: 'Kubernetes', url: 'https://kubernetes.io/docs/' },
      ] },
      { name: 'Veille & outils', links: [
        { name: 'LinkedIn', url: 'https://www.linkedin.com/' },
        { name: 'Hacker News', url: 'https://news.ycombinator.com/' },
        { name: 'Wikipédia', url: 'https://fr.wikipedia.org/' },
        { name: 'DeepL', url: 'https://www.deepl.com/translator' },
        { name: 'Regex101', url: 'https://regex101.com/' },
        { name: 'Can I use', url: 'https://caniuse.com/' },
      ] },
    ],
    // true : icônes chargées depuis chaque site (/apple-touch-icon.png puis /favicon.ico).
    // false : aucune requête vers les sites, pastilles avec l'initiale (ou icônes locales).
    favicons: true,

    // ---------- Recherche : « yt lofi », « cve log4j », « gh terraform »… ----------
    search: 'https://www.google.com/search?q=%s',
    bangs: {
      yt: { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
      gh: { label: 'GitHub', url: 'https://github.com/search?q=%s&type=repositories' },
      cve: { label: 'NVD (CVE)', url: 'https://nvd.nist.gov/vuln/search/results?form_type=Basic&results_type=overview&query=%s' },
      ex: { label: 'Exploit-DB', url: 'https://www.exploit-db.com/search?q=%s' },
      w: { label: 'Wikipédia', url: 'https://fr.wikipedia.org/w/index.php?search=%s' },
      tr: { label: 'DeepL', url: 'https://www.deepl.com/translator#en/fr/%s' },
    },

    // ---------- Météo (Open-Meteo, sans clé) ----------
    weatherDefault: { name: 'Paris', admin: 'Île-de-France', lat: 48.85341, lon: 2.3488 },

    // ---------- Actus (adresses finales des flux, domaines déclarés dans manifest.json) ----------
    feeds: {
      cyber: [
        { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', lang: 'en' },
        { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', lang: 'en' },
        { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', lang: 'en' },
        { name: 'IT-Connect', url: 'https://www.it-connect.fr/feed/', lang: 'fr' },
        { name: 'ZATAZ', url: 'https://www.zataz.com/feed/', lang: 'fr' },
        { name: 'Le Monde Informatique', url: 'https://www.lemondeinformatique.fr/flux/cybersecurite-conformite.xml', lang: 'fr' },
        { name: 'Cybermalveillance', url: 'https://www.cybermalveillance.gouv.fr/feed/atom-flux-actualites', lang: 'fr' },
      ],
      devops: [
        { name: 'The New Stack', url: 'https://thenewstack.io/feed/', lang: 'en' },
        { name: 'DevOps.com', url: 'https://devops.com/feed', lang: 'en' },
        { name: 'GitHub Blog', url: 'https://github.blog/feed/', lang: 'en' },
        { name: 'Docker', url: 'https://www.docker.com/feed/', lang: 'en' },
        { name: 'HashiCorp', url: 'https://www.hashicorp.com/blog/feed.xml', lang: 'en' },
      ],
    },
    certfr: [
      { kind: 'Alerte', url: 'https://cert.cyber.gouv.fr/alerte/feed/' },
      { kind: 'Avis', url: 'https://cert.cyber.gouv.fr/avis/feed/' },
    ],
    kev: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',

    // ---------- Titres modifiables ----------
    labels: { deadlines: 'Échéances', progress: 'Progression de l’année' },

    // ---------- Échéances (exemples calculés à partir d'aujourd'hui) ----------
    deadlines: [
      { date: inDays(3), title: 'Exemple : rendu du TP réseau', where: 'Moodle', tag: 'Rendu' },
      { date: inDays(12), title: 'Exemple : partiel de cryptographie', tag: 'Examen' },
      { date: inDays(19), title: 'Exemple : soutenance du projet', tag: 'Oral', unsure: true, note: 'Date à confirmer avec l’intervenant.' },
      { date: inDays(33), title: 'Exemple : entretien de mi-parcours', tag: 'Alternance' },
      { date: inDays(60), end: inDays(64), title: 'Exemple : semaine de CTF', tag: 'Examen' },
    ],

    // ---------- Alternance (facultatif : laisser [] pour masquer la semaine et la progression) ----------
    company: 'Mon entreprise',
    schoolWeeks,
    holidays: [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].flatMap(holidaysFR),
  };
})();
