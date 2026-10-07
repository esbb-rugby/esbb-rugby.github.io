// Mise a jour automatique du calendrier ESBB
// ------------------------------------------
// Une seule source, autorisee par le robots.txt de monclubhouse : la page de
// POULE de chaque competition.
//   - l'adresse racine ......... porte le classement complet
//   - .../calendrier-resultats . porte les journees et les scores
//   - .../classement ........... est remplie par le navigateur : elle ne contient rien
//   - la fiche club ............ ne donne que le nombre de points, sans le detail
//
// Principe de prudence : le script ne cree ni ne supprime jamais de rencontre
// dans le calendrier de l'ESBB. Il ne fait qu'ajouter des scores, corriger des
// dates et appliquer les renommages declares plus bas. En cas d'anomalie il
// s'arrete sans rien ecrire, et ce qui cloche part dans diagnostic.json.

import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(process.argv[2] || ".");
const FICHIER = path.join(RACINE, "index.html");
const DIAG = path.join(RACINE, "diagnostic.json");

const CLUB_FFR = "Entente Sp Bruges Blanquefort";
const SAISON = "2026-2027";

// Identifiants a revoir une fois par saison.
// Ils se lisent sur https://monclubhouse.ffr.fr/clubs/entente-sp-bruges-blanquefort/equipes
// (liens en qualification-XXXXX), et l'identifiant de poule apparait dans
// l'adresse de la page de la competition.
const COMPETITIONS = [
  {
    nom: "Régionale 3",
    poule: "https://monclubhouse.ffr.fr/regionales/nouvelle-aquitaine/nouvelle-aquitaine-regionale-3-championnat-territorial/qualification-50143/73076",
    attendu: { journees: 18, classement: 10 },
  },
  {
    nom: "Fédérale 1 Féminine",
    poule: "https://monclubhouse.ffr.fr/nationales/federale-1-feminine/qualification-50138/73056",
    attendu: { journees: 14, classement: 8 },
  },
  {
    // Entree en cours de saison : le calendrier de l'ESBB est absent du
    // fichier, « semer » autorise le programme a le creer une premiere fois
    // a partir de la poule. Ensuite il se comporte comme les autres.
    nom: "Fédérale 2 Féminine",
    poule: "https://monclubhouse.ffr.fr/regionales/nouvelle-aquitaine/nouvelle-aquitaine-federale-2-feminine-nouvelle-aquitaine/qualification-niveau-b-50334/73448",
    attendu: { journees: 14, classement: 7 }, // 7 clubs : le 8e est l'adversaire fictif
    semer: true,
  },
];

// Une poule a nombre impair d'equipes fait tourner un adversaire fictif :
// ces journees sont des exemptions, pas des rencontres.
const EXEMPT = /^club exempt/i;

// Stades manquants, a completer au fil de l'eau : une entree est ajoutee a
// index.html au prochain passage, et ignoree si l'adresse est vide ou si le
// club en a deja une. La FFR ne publie pas les terrains (les fiches match
// sont interdites par son robots.txt), d'ou cette saisie a la main.
const STADES_AJOUTS = [
  { club: "RC Cestadais", stade: "" },
  { club: "Ras Brejac Rugby La Brede Fed2 Feminines A XV", stade: "" },
  { club: "Rugby Club de La Pimpine", stade: "" },
  { club: "Ras Floirac Rive Droite Pays Du Libournais Libourne Fed2 Feminines A XV", stade: "" },
  { club: "Union Du Bassin Marmandais", stade: "" },
  { club: "Aytre Rugby", stade: "" },
];

// Logos manquants, a coller ici au format "data:image/webp;base64,...".
// Les images viennent des pages de la FFR, enregistrees a la main : son
// serveur d'images interdit les acces automatises (robots.txt).
const LOGOS_AJOUTS = [
  { club: "Rugby Club de La Pimpine", logo: "data:image/webp;base64,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" },
  { club: "Aytre Rugby", logo: "data:image/webp;base64,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" },
  { club: "RC Cestadais", logo: "data:image/webp;base64,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" },
  { club: "Ras Brejac Rugby La Brede Fed2 Feminines A XV", logo: "data:image/webp;base64,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" },
  { club: "Ras Floirac Rive Droite Pays Du Libournais Libourne Fed2 Feminines A XV", logo: "data:image/webp;base64,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" },
  { club: "Union Du Bassin Marmandais", logo: "data:image/webp;base64,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" },
];

/* Insere des entrees manquantes dans un objet de index.html (STADES, LOGOS). */
export function ajouterEntrees(html, nomObjet, ajouts, champ) {
  const ancre = html.indexOf(`const ${nomObjet} = {`);
  if (ancre < 0) return { html, ajoutes: [] };
  const ouvre = html.indexOf("{", ancre) + 1;
  const ajoutes = [];
  let bloc = "";
  for (const a of ajouts) {
    if (!a || !a.club || !a[champ]) continue;
    if (html.includes(JSON.stringify(a.club) + ":")) continue; // deja connu
    bloc += `\n  ${JSON.stringify(a.club)}: ${JSON.stringify(a[champ])},`;
    ajoutes.push(a.club);
  }
  if (!bloc) return { html, ajoutes: [] };
  return { html: html.slice(0, ouvre) + bloc + html.slice(ouvre), ajoutes };
}

// Clubs renommes par la FFR en cours de saison (ententes, fusions).
// Le renommage est applique une fois, partout dans index.html : calendrier,
// stades et logos suivent. Une fois le fichier a jour, la ligne ne fait plus
// rien ; on la garde comme memoire de ce qui s'est passe.
const RENOMMAGES = [
  { de: "SC Captieux", vers: "U R G - Union Rugby Gascon" },
  { de: "Stado Tarbes Pyrénées Rugby", vers: "Ras Stado Tpr-ibos" },
  { de: "JSE SP Villeneuve de Marsan", vers: "Ras Jsv-aa Avenir Aturin Fed 1 Feminine" },
];

/* ------------------------------------------------------------------ outils */

export const ajouterStades = (html, ajouts) => ajouterEntrees(html, "STADES", ajouts, "stade");
export const ajouterLogos = (html, ajouts) => ajouterEntrees(html, "LOGOS", ajouts, "logo");

export const sansAccent = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const log = (...a) => console.log(...a);

/* ------------------------------------------------- lecture d'une page FFR
   Les donnees arrivent dans des appels self.__next_f.push([1,"...."]) :
   on recolle les morceaux pour obtenir un flux ou lire du JSON. */

async function chargerFlux(url) {
  const rep = await fetch(url, {
    headers: {
      "User-Agent": "esbb-calendrier/2.0 (mise a jour hebdomadaire du calendrier du club)",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });
  if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
  const html = await rep.text();
  const morceaux = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\[\s\S])*")\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { morceaux.push(JSON.parse(m[1])); } catch { /* morceau illisible */ }
  }
  const flux = morceaux.join("");
  if (flux.length < 5000) throw new Error(`flux trop court (${flux.length} o)`);
  return flux;
}

/* --------------------------- extraction d'un objet JSON par equilibrage
   On avance depuis une accolade ouvrante en comptant les accolades, tout en
   sautant le contenu des chaines de caracteres. */

function balancer(flux, deb) {
  let prof = 0;
  for (let k = deb; k < flux.length; k++) {
    const c = flux[k];
    if (c === '"') {
      k++;
      while (k < flux.length && !(flux[k] === '"' && flux[k - 1] !== "\\")) k++;
      continue;
    }
    if (c === "{") prof++;
    else if (c === "}") {
      prof--;
      if (prof === 0) {
        try { return { obj: JSON.parse(flux.slice(deb, k + 1)), fin: k }; }
        catch { return { obj: null, fin: k }; }
      }
    }
  }
  return null;
}

/* On part d'une cle connue et on remonte d'accolade en accolade jusqu'a
   trouver l'objet qui contient reellement toutes les cles attendues.
   L'ordre des cles change d'une page a l'autre. */

function objetEnglobant(flux, position, cles) {
  let deb = position + 1;
  for (let essai = 0; essai < 40; essai++) {
    deb = flux.lastIndexOf("{", deb - 1);
    if (deb < 0) return null;
    const r = balancer(flux, deb);
    if (!r || r.fin <= position) continue; // objet referme avant la cle : trop court
    if (r.obj && cles.every((c) => c in r.obj)) return r;
  }
  return null;
}

/* --------------------------------- toutes les rencontres de la poule
   La page de poule livre un objet par journee :
   { listTitle:"Journee N", listData:[ { dateEffective, scores, equipes } ] } */

export function extraireJournees(flux) {
  const brut = [];
  let p = 0;
  while (true) {
    const i = flux.indexOf('"listTitle":"Journ', p);
    if (i < 0) break;
    const r = objetEnglobant(flux, i, ["listTitle", "listData"]);
    p = Math.max(r ? r.fin : 0, i + 1);
    const o = r && r.obj;
    if (!o) continue;
    const num = String(o.listTitle || "").match(/(\d+)/);
    if (!num) continue;
    const matchs = (o.listData || [])
      .map((x) => {
        const loc = x.competitionEquipeLocaleId || {};
        const vis = x.competitionEquipeVisiteuseId || {};
        const sl = x.rencontreResultatLocaleFdmd;
        const sv = x.rencontreResultatVisiteuseFdmd;
        return [
          String(x.dateEffective || x.dateOfficielle || "").slice(0, 16),
          loc.nomEdito || "",
          vis.nomEdito || "",
          typeof sl === "number" ? sl : null,
          typeof sv === "number" ? sv : null,
        ];
      })
      .filter((m) => m[0] && m[1] && m[2]);
    if (matchs.length) brut.push({ j: "J" + num[1], matchs });
  }
  // une journee peut apparaitre plusieurs fois dans le flux : on garde la plus fournie
  const parJ = new Map();
  for (const x of brut) {
    const a = parJ.get(x.j);
    if (!a || x.matchs.length > a.matchs.length) parJ.set(x.j, x);
  }
  return [...parJ.values()].sort((a, b) => +a.j.slice(1) - +b.j.slice(1));
}

/* -------------------------------------------------- lecture d'un score
   Deux habitudes de la FFR, relevees sur des matchs reellement joues :
     - une equipe qui ne marque pas est publiee a `null`, pas a 0
       (J1 2026 : Saint-Aubin 59 - null, et le classement donne bien 0 a l'ESBB) ;
     - un match a venir, ou un forfait, peut etre publie 0-0.
   D'ou la regle : un seul cote renseigne sur un match deja joue vaut 0 de
   l'autre cote ; un 0-0 n'est jamais recopie, il est signale. */

export function lireScore(sd, se, jour, aujourdhui) {
  const passe = !jour || jour <= aujourdhui;
  if (sd == null && se == null) return { etat: "aucun" };
  if (!passe) return { etat: "aVenir" };
  if (sd === 0 && se === 0) return { etat: "zeroZero" };
  if (sd == null) return { etat: "ok", sd: 0, se, complete: true };
  if (se == null) return { etat: "ok", sd, se: 0, complete: true };
  return { etat: "ok", sd, se };
}

/* ------------------------------------------------ extraction du classement */

/* Noms de champs relevés sur une saison réellement jouée :
     pointTerrain, joues, gagnes, nuls, perdus,
     pointsDeMarqueAcquis, pointsDeMarqueConcedes, bonusOffensif, bonusDefensif
   Les autres noms sont gardés en secours au cas où la FFR change sa structure. */
const CLES = {
  points: ["pointTerrain", "points", "total"],
  joues: ["joues", "nbMatchs", "rencontresJouees", "matchsJoues"],
  gagnes: ["gagnes", "victoires", "nbVictoires"],
  nuls: ["nuls", "nbNuls", "egalites"],
  perdus: ["perdus", "defaites", "nbDefaites"],
  pour: ["pointsDeMarqueAcquis", "pointsMarques", "pointsPour"],
  contre: ["pointsDeMarqueConcedes", "pointsConcedes", "pointsEncaisses", "pointsContre"],
};
const valeur = (o, noms) => {
  for (const n of noms) if (typeof o[n] === "number") return o[n];
  return 0;
};

export function extraireClassement(flux) {
  const lignes = [];
  const brut = [];
  const vus = new Set();
  let p = 0;
  while (true) {
    const i = flux.indexOf('"classementId":{', p);
    if (i < 0) break;
    const r = objetEnglobant(flux, i, ["classementId", "competitionEquipeId"]);
    p = Math.max(r ? r.fin : 0, i + 1);
    const o = r && r.obj;
    if (!o) continue;
    const club = (o.competitionEquipeId || {}).nomEdito;
    if (!club || vus.has(club)) continue;
    vus.add(club);
    const st = o.classementId || {};
    brut.push({ club, position: o.position ?? null, stats: st });
    lignes.push({
      club,
      position: o.position ?? 0,
      points: Math.round(valeur(st, CLES.points)),
      joues: valeur(st, CLES.joues),
      gagnes: valeur(st, CLES.gagnes),
      nuls: valeur(st, CLES.nuls),
      perdus: valeur(st, CLES.perdus),
      pour: valeur(st, CLES.pour),
      contre: valeur(st, CLES.contre),
    });
  }
  return { lignes, brut };
}

/* --------------------------------------------- lecture du fichier existant */

const MARQUE_DEB = "/* @@DONNEES-DEBUT@@";
const MARQUE_FIN = "/* @@DONNEES-FIN@@ */";

export function lireBloc(html) {
  const d = html.indexOf(MARQUE_DEB);
  const f = html.indexOf(MARQUE_FIN);
  if (d < 0 || f < 0) throw new Error("marqueurs @@DONNEES@@ introuvables");
  return { debut: d, fin: f + MARQUE_FIN.length, bloc: html.slice(d, f) };
}

export function evaluerBloc(bloc, constantes) {
  const nettoye = constantes + "\n" + bloc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*const\s+/gm, "var ");
  const fn = new Function(
    `${nettoye}; return {
       OFFICIEL: typeof OFFICIEL!=="undefined"?OFFICIEL:null,
       CLASSEMENTS: typeof CLASSEMENTS!=="undefined"?CLASSEMENTS:null,
       JOURNEES: typeof JOURNEES!=="undefined"?JOURNEES:{} };`
  );
  return fn();
}

/* ---------------------------------------- renommage d'un club dans tout le
   fichier : la cle du stade et celle du logo suivent le calendrier. */

export function renommer(texte, de, vers) {
  const avant = JSON.stringify(de);
  const apres = JSON.stringify(vers);
  return texte.split(avant).join(apres);
}

/* ----------------------------------------------------- ecriture du fichier */

export function ecrireBloc(officiel, journees, classements) {
  const saisons = (o) => Object.keys(o).sort().reverse();

  const unMatch = (x) =>
    `    {c:${JSON.stringify(x.c)}, j:${JSON.stringify(x.j)}, date:${JSON.stringify(x.date)}, ` +
    `time:${JSON.stringify(x.time)}, lieu:${JSON.stringify(x.lieu)}, adv:${JSON.stringify(x.adv)}` +
    (x.sp != null ? `, sp:${x.sp}, sc:${x.sc}` : "") + `}`;

  let s = MARQUE_DEB + "  bloc réécrit automatiquement chaque lundi — ne pas éditer à la main */\n";

  s += "const OFFICIEL = {\n";
  s += saisons(officiel)
    .map((sa) => `  ${JSON.stringify(sa)}: [\n` + officiel[sa].map(unMatch).join(",\n") + "\n  ]")
    .join(",\n");
  s += "\n};\n\n";

  s += "/* Résultats de toute la poule, journée par journée (rempli chaque lundi) */\n";
  s += "const JOURNEES = {\n";
  s += saisons(journees)
    .map((sa) => {
      const comps = journees[sa];
      return `  ${JSON.stringify(sa)}: {\n` + Object.keys(comps).map((c) => {
        const o = comps[c];
        return `    ${JSON.stringify(c)}: { maj:${JSON.stringify(o.maj)}, journees:[\n` +
          o.journees.map((x) =>
            `      {j:${JSON.stringify(x.j)}, matchs:[` +
            x.matchs.map((m) => JSON.stringify(m)).join(",") + `]}`).join(",\n") +
          "\n    ]}";
      }).join(",\n") + "\n  }";
    })
    .join(",\n");
  s += "\n};\n\n";

  s += "const CLASSEMENTS = {\n";
  s += saisons(classements)
    .map((sa) => {
      const comps = classements[sa];
      return `  ${JSON.stringify(sa)}: {\n` + Object.keys(comps).map((c) => {
        const o = comps[c];
        return `    ${JSON.stringify(c)}: { maj:${JSON.stringify(o.maj)}, debut:${JSON.stringify(o.debut)}, lignes:[\n` +
          o.lignes.map((l) => "      " + JSON.stringify(l)).join(",\n") + "\n    ]}";
      }).join(",\n") + "\n  }";
    })
    .join(",\n");
  s += "\n};\n" + MARQUE_FIN;
  return s;
}

/* ------------------------------------------------------------------- main */

const lanceDirectement =
  process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (lanceDirectement) await principal();

async function principal() {
  let html = fs.readFileSync(FICHIER, "utf8");

  /* ---------- 0. renommages declares (ententes, fusions) ---------- */
  let renommes = 0;
  for (const r of RENOMMAGES) {
    const apres = renommer(html, r.de, r.vers);
    if (apres !== html) {
      log(`Renommage : ${r.de} -> ${r.vers}`);
      html = apres;
      renommes++;
    }
  }

  /* ---------- 0 bis. stades ajoutes a la main ---------- */
  const stades = ajouterStades(html, STADES_AJOUTS);
  html = stades.html;
  if (stades.ajoutes.length) log(`Stades ajoutés : ${stades.ajoutes.join(", ")}`);

  const logos = ajouterLogos(html, LOGOS_AJOUTS);
  html = logos.html;
  if (logos.ajoutes.length) log(`Logos ajoutés : ${logos.ajoutes.join(", ")}`);

  const { debut, fin, bloc } = lireBloc(html);
  const constantes = (html.match(/^const (?:CLUB|R3|F1F|F2F|STADE_DEF)\s*=.*$/gm) || [])
    .join("\n").replace(/^const /gm, "var ");
  const { OFFICIEL, CLASSEMENTS, JOURNEES } = evaluerBloc(bloc, constantes);
  if (!OFFICIEL || !CLASSEMENTS) throw new Error("bloc de données illisible");

  const matchs = OFFICIEL[SAISON];
  if (!Array.isArray(matchs) || matchs.length < 5)
    throw new Error(`saison ${SAISON} absente ou trop courte`);

  // dictionnaire nom FFR (sans accents) -> nom utilise dans le fichier,
  // pour que logos et stades continuent de se rattacher
  const dico = new Map();
  for (const sa of Object.keys(OFFICIEL)) for (const m of OFFICIEL[sa]) dico.set(sansAccent(m.adv), m.adv);
  for (const sa of Object.keys(CLASSEMENTS))
    for (const c of Object.keys(CLASSEMENTS[sa]))
      for (const l of CLASSEMENTS[sa][c].lignes) dico.set(sansAccent(l[0]), l[0]);
  dico.set(sansAccent(CLUB_FFR), "Entente SP Bruges Blanquefort");
  const nomFichier = (ffr) => dico.get(sansAccent(ffr)) || ffr;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const diagnostic = { date: aujourdhui, competitions: {} };
  let scores = 0, dates = 0, classements = 0, poules = 0;

  for (const comp of COMPETITIONS) {
    log(`\n--- ${comp.nom}`);
    const info = {};
    diagnostic.competitions[comp.nom] = info;

    /* ---------- 1. la poule : toutes les rencontres ---------- */
    let journees = [];
    try {
      const flux = await chargerFlux(comp.poule + "/calendrier-resultats");
      journees = extraireJournees(flux).map((x) => ({
        j: x.j,
        matchs: x.matchs
          .filter((m) => !EXEMPT.test(m[1]) && !EXEMPT.test(m[2]))
          .map((m) => [m[0], nomFichier(m[1]), nomFichier(m[2]), m[3], m[4]]),
      })).filter((x) => x.matchs.length);
      info.journees = journees.length;
      info.rencontres = journees.reduce((a, x) => a + x.matchs.length, 0);
      info.joues = journees.reduce(
        (a, x) => a + x.matchs.filter((m) => m[3] != null || m[4] != null).length, 0);
      log(`  poule : ${info.journees} journées, ${info.rencontres} rencontres`);
    } catch (e) {
      info.erreurPoule = e.message;
      log(`  poule illisible : ${e.message}`);
    }

    if (journees.length >= 2) {
      const jn = (JOURNEES[SAISON] ||= {});
      const avant = JSON.stringify((jn[comp.nom] || {}).journees || []);
      jn[comp.nom] = { maj: aujourdhui, journees };
      if (JSON.stringify(journees) !== avant) poules++;

      const moi = sansAccent(CLUB_FFR);

      /* ---------- competition entrante : on seme le calendrier ---------- */
      if (comp.semer && !matchs.some((m) => m.c === comp.nom)) {
        const nouveaux = [];
        for (const x of journees) {
          for (const [iso, dom, ext] of x.matchs) {
            const estDom = sansAccent(dom) === moi;
            if (!estDom && sansAccent(ext) !== moi) continue;
            nouveaux.push({
              c: comp.nom, j: x.j,
              date: iso.slice(0, 10), time: iso.slice(11, 16) || "15:00",
              lieu: estDom ? "dom" : "ext", adv: estDom ? ext : dom,
            });
          }
        }
        if (nouveaux.length >= 5) {
          matchs.push(...nouveaux);
          matchs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          info.semes = nouveaux.length;
          log(`  calendrier créé : ${nouveaux.length} rencontres`);
          poules++;
        } else {
          info.semisRefuse = `${nouveaux.length} rencontre(s) seulement, trop peu pour créer le calendrier`;
        }
      }

      /* les scores de l'ESBB se lisent dans les memes donnees */
      const vus = new Set();
      info.scoresIgnores = [];
      for (const x of journees) {
        for (const [iso, dom, ext, sd, se] of x.matchs) {
          const estDom = sansAccent(dom) === moi;
          const estExt = sansAccent(ext) === moi;
          if (!estDom && !estExt) continue;
          const adv = estDom ? ext : dom;
          const cible = matchs.find(
            (m) => m.c === comp.nom && m.lieu === (estDom ? "dom" : "ext") &&
                   sansAccent(m.adv) === sansAccent(adv)
          );
          if (!cible) {
            info.scoresIgnores.push(`${x.j} ${estDom ? "🏠" : "✈️"} ${adv} : aucune rencontre correspondante dans le calendrier`);
            continue;
          }
          vus.add(cible);

          const jour = iso.slice(0, 10);
          const heure = iso.slice(11, 16);
          if (jour && jour !== cible.date) {
            log(`  date modifiée : ${cible.adv} ${cible.date} -> ${jour}`);
            cible.date = jour; dates++;
          }
          if (/^\d{2}:\d{2}$/.test(heure) && heure !== cible.time) cible.time = heure;
          if (!cible.j && x.j) cible.j = x.j;

          const lu = lireScore(sd, se, jour, aujourdhui);
          if (lu.etat === "ok") {
            const sp = estDom ? lu.sd : lu.se;
            const sc = estDom ? lu.se : lu.sd;
            if (cible.sp !== sp || cible.sc !== sc) {
              log(`  score : ${cible.adv} -> ${sp}-${sc}${lu.complete ? " (un côté publié à vide, lu 0)" : ""}`);
              cible.sp = sp; cible.sc = sc; scores++;
            }
          } else if (lu.etat === "zeroZero" || lu.etat === "aVenir") {
            if (lu.etat === "zeroZero")
              info.scoresIgnores.push(`${x.j} ${cible.adv} : publié 0-0 par la FFR, non recopié`);
            // un 0-0 deja recopie par une ancienne version est retire
            if (cible.sp === 0 && cible.sc === 0) {
              log(`  score 0-0 retiré : ${cible.adv}`);
              delete cible.sp; delete cible.sc; scores++;
            }
          }
        }
      }
      info.sansCorrespondance = matchs
        .filter((m) => m.c === comp.nom && !vus.has(m))
        .map((m) => `${m.j} ${m.lieu === "dom" ? "🏠" : "✈️"} ${m.adv}`);
    }

    /* ---------- 2. la page de poule : le classement ---------- */
    try {
      const flux = await chargerFlux(comp.poule);
      const tout = extraireClassement(flux);
      const brut = tout.brut;
      const lignes = tout.lignes.filter((l) => !EXEMPT.test(l.club)); // pas de club fictif au classement
      info.classement = lignes.length;
      info.classementBrut = brut.slice(0, 2);
      /* alerte si la FFR ne sert plus que les points, sans le detail */
      info.detailClassement = lignes.some((l) => l.joues > 0);
      log(`  classement : ${lignes.length} lignes${lignes.length && !info.detailClassement ? " (points seuls, sans détail)" : ""}`);
      if (lignes.length >= 4) {
        const cl = (CLASSEMENTS[SAISON] ||= {});
        const ancien = cl[comp.nom];
        const table = lignes.map((l) => [nomFichier(l.club), l.points, l.joues, l.gagnes, l.nuls, l.perdus, l.pour, l.contre]);
        const change = JSON.stringify((ancien || {}).lignes || []) !== JSON.stringify(table);
        cl[comp.nom] = {
          maj: change || !ancien ? aujourdhui : ancien.maj,
          debut: ancien ? ancien.debut : (matchs.find((m) => m.c === comp.nom) || {}).date || aujourdhui,
          lignes: table,
        };
        if (change) classements++;
      }
    } catch (e) {
      info.erreurClassement = e.message;
      log(`  classement illisible : ${e.message}`);
    }
  }

  /* ---------- 3. controle de vraisemblance ----------
     Ce qui est anormal part dans diagnostic.alertes. L'etape « Controle » du
     programme hebdomadaire lit ce champ et fait echouer le passage, ce qui
     declenche le mail d'alerte de GitHub. La publication, elle, a deja eu lieu. */
  const alertes = [];
  for (const comp of COMPETITIONS) {
    const i = diagnostic.competitions[comp.nom] || {};
    const a = comp.attendu || {};
    if (i.erreurPoule) alertes.push(`${comp.nom} : page de poule illisible (${i.erreurPoule})`);
    else if (a.journees && i.journees !== a.journees)
      alertes.push(`${comp.nom} : ${i.journees} journées lues, ${a.journees} attendues`);
    if (i.erreurClassement) alertes.push(`${comp.nom} : classement illisible (${i.erreurClassement})`);
    else if (a.classement && i.classement !== a.classement)
      alertes.push(`${comp.nom} : ${i.classement} lignes de classement, ${a.classement} attendues`);
    if (i.joues > 0 && i.detailClassement === false)
      alertes.push(`${comp.nom} : classement sans le détail alors que ${i.joues} rencontre(s) sont jouées — relire classementBrut et corriger CLES`);
    for (const x of i.sansCorrespondance || [])
      alertes.push(`${comp.nom} : ${x} — introuvable dans la poule (club renommé ? à déclarer dans RENOMMAGES)`);
    for (const x of i.scoresIgnores || [])
      alertes.push(`${comp.nom} : ${x}`);
  }
  diagnostic.alertes = alertes;
  diagnostic.renommages = renommes;
  diagnostic.stadesAjoutes = stades.ajoutes;
  diagnostic.logosAjoutes = logos.ajoutes;
  if (alertes.length) {
    log("\nÀ signaler :");
    for (const x of alertes) log("  - " + x);
  }

  fs.writeFileSync(DIAG, JSON.stringify(diagnostic, null, 2));

  if (!scores && !dates && !classements && !poules && !renommes && !stades.ajoutes.length && !logos.ajoutes.length) {
    log("\nRien de neuf, fichier inchangé.");
    return;
  }

  const nouveau = html.slice(0, debut) + ecrireBloc(OFFICIEL, JOURNEES, CLASSEMENTS) + html.slice(fin);
  if (nouveau.length < html.length * 0.9)
    throw new Error("le fichier réécrit est anormalement plus court, écriture annulée");

  fs.writeFileSync(FICHIER, nouveau);
  log(`\nÉcrit : ${scores} score(s), ${dates} date(s), ${classements} classement(s), ${poules} poule(s), ${renommes} renommage(s).`);
}
