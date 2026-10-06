// Essais hors ligne du programme de mise a jour.
// Lancement : node test-maj.mjs

import { lireScore, renommer, extraireJournees, extraireClassement, sansAccent } from "./maj.mjs";

let echecs = 0;
const verifie = (nom, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(`${ok ? "ok  " : "ECHEC"} ${nom}${ok ? "" : `\n      obtenu  ${JSON.stringify(obtenu)}\n      attendu ${JSON.stringify(attendu)}`}`);
};

const AUJ = "2026-10-01";

/* --- lecture d'un score -------------------------------------------------- */

verifie("match à venir, rien de publié",
  lireScore(null, null, "2026-12-06", AUJ), { etat: "aucun" });
verifie("match joué, score normal",
  lireScore(6, 34, "2026-09-27", AUJ), { etat: "ok", sd: 6, se: 34 });
verifie("J1 réelle : 59 - vide, le vide vaut 0",
  lireScore(59, null, "2026-09-20", AUJ), { etat: "ok", sd: 59, se: 0, complete: true });
verifie("l'autre côté vide vaut 0 aussi",
  lireScore(null, 28, "2026-01-11", AUJ), { etat: "ok", sd: 0, se: 28, complete: true });
verifie("0-0 publié : jamais recopié",
  lireScore(0, 0, "2026-09-20", AUJ), { etat: "zeroZero" });
verifie("0-0 sur un match futur : traité comme à venir",
  lireScore(0, 0, "2026-12-06", AUJ), { etat: "aVenir" });
verifie("score publié d'avance sur un match futur : ignoré",
  lireScore(25, 0, "2026-12-06", AUJ), { etat: "aVenir" });
verifie("match du jour : compté comme joué",
  lireScore(12, 10, AUJ, AUJ), { etat: "ok", sd: 12, se: 10 });

/* --- renommage d'un club ------------------------------------------------- */
{
  const html = `const STADES = {\n  "SC Captieux": "Stade municipal — Captieux",\n};\n` +
    `const LOGOS = {"SC Captieux": "data:image/webp;base64,AAA"};\n` +
    `  {c:"Régionale 3", j:"J8", date:"2026-11-22", time:"15:00", lieu:"ext", adv:"SC Captieux"}\n` +
    `  {c:"Régionale 3", j:"J17", date:"2027-03-14", time:"15:00", lieu:"dom", adv:"SC Captieux"}\n`;
  const apres = renommer(html, "SC Captieux", "U R G - Union Rugby Gascon");
  verifie("renommage : plus aucune trace de l'ancien nom", /SC Captieux/.test(apres), false);
  verifie("renommage : 4 occurrences remplacées",
    (apres.match(/U R G - Union Rugby Gascon/g) || []).length, 4);
  verifie("renommage : rien d'autre n'a bougé",
    apres.includes('"Stade municipal — Captieux"'), true);
  verifie("renommage : idempotent",
    renommer(apres, "SC Captieux", "U R G - Union Rugby Gascon"), apres);
}

/* --- lecture d'une page de poule ---------------------------------------- */
{
  const r = (d, a, b, sa, sb) =>
    `{"dateEffective":"${d}","competitionEquipeLocaleId":{"nomEdito":"${a}"},` +
    `"competitionEquipeVisiteuseId":{"nomEdito":"${b}"},` +
    `"rencontreResultatLocaleFdmd":${sa},"rencontreResultatVisiteuseFdmd":${sb}}`;
  const flux =
    `{"listTitle":"Journée 1","listData":[${r("2026-09-20T15:00", "SC Saint Aubin", "Entente Sp Bruges Blanquefort", 59, null)}]}` +
    `{"listTitle":"Journée 2","listData":[${r("2026-09-27T15:00", "Entente Sp Bruges Blanquefort", "RC Cubzaguais", 6, 34)}]}`;
  const j = extraireJournees(flux);
  verifie("poule : deux journées", j.map((x) => x.j), ["J1", "J2"]);
  verifie("poule : J1 telle que la FFR la publie",
    j[0].matchs[0], ["2026-09-20T15:00", "SC Saint Aubin", "Entente Sp Bruges Blanquefort", 59, null]);
}

/* --- lecture d'un classement -------------------------------------------- */
{
  const st = { pointTerrain: 0, joues: 2, gagnes: 0, nuls: 0, perdus: 2, pointsDeMarqueAcquis: 6, pointsDeMarqueConcedes: 93 };
  const flux = `{"position":9,"classementId":${JSON.stringify(st)},` +
    `"competitionEquipeId":{"nomEdito":"Entente Sp Bruges Blanquefort"}}`;
  const { lignes } = extraireClassement(flux);
  verifie("classement : ligne ESBB réelle",
    [lignes[0].points, lignes[0].joues, lignes[0].pour, lignes[0].contre], [0, 2, 6, 93]);
}

verifie("accents ignorés pour comparer les noms",
  sansAccent("Lons Section Paloise Rugby Féminin") === sansAccent("Lons Section Paloise Rugby Feminin"), true);

console.log(echecs ? `\n${echecs} echec(s)` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
