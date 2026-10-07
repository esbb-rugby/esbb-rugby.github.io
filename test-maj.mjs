// Essais hors ligne du programme de mise a jour.
// Lancement : node test-maj.mjs

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { lireScore, renommer, extraireJournees, extraireClassement, sansAccent, ajouterStades, ajouterLogos, lireBloc, evaluerBloc } from "./maj.mjs";

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

/* --- ajout d'un stade dans index.html ------------------------------------ */
{
  const html = `const STADES = {\n  "SC Saint Aubin": "Stade de Paloque",\n};\n`;
  const r1 = ajouterStades(html, [{ club: "RC Cestadais", stade: "Stade de Cestas" }]);
  verifie("stade ajouté", /"RC Cestadais": "Stade de Cestas"/.test(r1.html), true);
  verifie("stade ajouté : signalé", r1.ajoutes, ["RC Cestadais"]);
  verifie("stade déjà connu : rien n'est touché",
    ajouterStades(r1.html, [{ club: "RC Cestadais", stade: "Autre adresse" }]).html, r1.html);
  verifie("adresse vide : rien n'est touché",
    ajouterStades(html, [{ club: "Aytre Rugby", stade: "" }]).html, html);
  verifie("l'objet reste lisible",
    new Function("return (" + r1.html.slice(r1.html.indexOf("{"), r1.html.lastIndexOf("}") + 1) + ")")()["RC Cestadais"],
    "Stade de Cestas");
}

/* --- ajout d'un logo ----------------------------------------------------- */
{
  const html = `const LOGOS = {"SC Saint Aubin": "data:image/webp;base64,AAA"};\n`;
  const r = ajouterLogos(html, [{ club: "RC Cestadais", logo: "data:image/webp;base64,BBB" }]);
  verifie("logo ajouté", /"RC Cestadais": "data:image\/webp;base64,BBB"/.test(r.html), true);
  verifie("logo : l'objet reste lisible",
    Object.keys(new Function("return (" + r.html.slice(r.html.indexOf("{"), r.html.lastIndexOf("}") + 1) + ")")()).length, 2);
  verifie("logo déjà présent : rien n'est touché",
    ajouterLogos(r.html, [{ club: "SC Saint Aubin", logo: "data:image/webp;base64,CCC" }]).html, r.html);
}

/* --- répétition générale : une compétition qui arrive en cours de saison -- */
{
  const TMP = "/tmp/esbb-semis";
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const ESBB_FFR = "Entente Sp Bruges Blanquefort";
  const rencontre = (d, a, b, sa, sb) =>
    `{"dateEffective":"${d}","competitionEquipeLocaleId":{"nomEdito":${JSON.stringify(a)}},` +
    `"competitionEquipeVisiteuseId":{"nomEdito":${JSON.stringify(b)}},` +
    `"rencontreResultatLocaleFdmd":${sa},"rencontreResultatVisiteuseFdmd":${sb}}`;
  const page = (charge) => {
    const c = Math.floor(charge.length / 2);
    return "<html><body><script>" +
      [charge.slice(0, c), charge.slice(c)].map((m) => `self.__next_f.push([1,${JSON.stringify(m)}])`).join(";") +
      "</script></body></html>";
  };
  const ligne = (pos, club, st) =>
    `{"position":${pos},"classementId":${JSON.stringify(st)},"competitionEquipeId":{"nomEdito":${JSON.stringify(club)}}}`;
  const st = () => ({ pointTerrain: 0, joues: 0, gagnes: 0, nuls: 0, perdus: 0, pointsDeMarqueAcquis: 0, pointsDeMarqueConcedes: 0 });

  /* la vraie poule de F2 : 7 clubs + un adversaire fictif */
  const ADV = ["RC Cestadais", "Club Exempt 1", "Ras Brejac Rugby La Brede Fed2 Feminines A XV",
    "Rugby Club de La Pimpine", "Ras Floirac Rive Droite Pays Du Libournais Libourne Fed2 Feminines A XV",
    "Union Du Bassin Marmandais", "Aytre Rugby"];
  const journeesF2 = [];
  for (let i = 0; i < 14; i++) {
    const adv = ADV[i % 7];
    const dom = i % 2 === 1;
    const d = `2026-10-${String(11 + i).padStart(2, "0")}T15:00`;
    const autres = ADV.filter((c) => c !== adv).slice(0, 2);
    journeesF2.push(`{"listTitle":"Journée ${i + 1}","listData":[` +
      (dom ? rencontre(d, ESBB_FFR, adv, null, null) : rencontre(d, adv, ESBB_FFR, null, null)) + "," +
      rencontre(d, autres[0], autres[1], null, null) + `]}`);
  }
  const PAGES = new Map([
    ["50334/73448/calendrier-resultats", page("2:" + journeesF2.join(",") + " x ".repeat(3000))],
    ["50334/73448", page("3:" + ADV.concat([ESBB_FFR]).map((c, i) => ligne(i + 1, c, st())).join(",") + " x ".repeat(3000))],
  ]);

  const html = [
    'const CLUB = "Entente SP Bruges Blanquefort";',
    'const R3 = "Régionale 3";', 'const F1F = "Fédérale 1 Féminine";', 'const F2F = "Fédérale 2 Féminine";',
    'const STADE_DEF = "Stade Albert Galinier — Bruges";',
    'const STADES = {\n  "SC Saint Aubin": "Stade de Paloque",\n};',
    'const LOGOS = {"SC Saint Aubin": "data:image/webp;base64,AAA"};',
    "/* @@DONNEES-DEBUT@@ bloc */",
    'const OFFICIEL = {\n  "2026-2027": [\n' +
      '    {c:"Régionale 3", j:"J1", date:"2026-09-20", time:"15:00", lieu:"ext", adv:"SC Saint Aubin", sp:0, sc:59},\n' +
      '    {c:"Régionale 3", j:"J2", date:"2026-09-27", time:"15:00", lieu:"dom", adv:"RC Cubzaguais", sp:6, sc:34},\n' +
      '    {c:"Régionale 3", j:"J3", date:"2026-10-04", time:"15:00", lieu:"ext", adv:"Amicale Sportive Eymetoise", sp:5, sc:47},\n' +
      '    {c:"Régionale 3", j:"J4", date:"2026-10-18", time:"15:00", lieu:"ext", adv:"US Roquentin Laroque Timbaut"},\n' +
      '    {c:"Régionale 3", j:"J5", date:"2026-10-25", time:"15:00", lieu:"dom", adv:"4 C XV"},\n' +
      '    {c:"Régionale 3", j:"J6", date:"2026-11-08", time:"15:00", lieu:"ext", adv:"La Brede Rugby"}\n  ]\n};',
    "const JOURNEES = {};",
    'const CLASSEMENTS = {"2026-2027": {}};',
    "/* @@DONNEES-FIN@@ */",
    "// " + "remplissage ".repeat(2000),
  ].join("\n");
  fs.writeFileSync(path.join(TMP, "index.html"), html);
  fs.writeFileSync(path.join(TMP, "stub.mjs"), `
globalThis.fetch = async (url) => {
  const table = new Map(${JSON.stringify([...PAGES])});
  for (const [motif, corps] of table)
    if (String(url).includes(motif)) return { ok: true, status: 200, text: async () => corps };
  return { ok: false, status: 404, text: async () => "" };
};`);

  const passage = () => execFileSync(process.execPath,
    ["--import", path.join(TMP, "stub.mjs"), "maj.mjs", TMP], { encoding: "utf8", timeout: 60000 });
  passage();

  const apres = fs.readFileSync(path.join(TMP, "index.html"), "utf8");
  const constantes = (apres.match(/^const (?:CLUB|R3|F1F|F2F|STADE_DEF)\s*=.*$/gm) || [])
    .join("\n").replace(/^const /gm, "var ");
  const { OFFICIEL, JOURNEES } = evaluerBloc(lireBloc(apres).bloc, constantes);
  const f2 = OFFICIEL["2026-2027"].filter((m) => m.c === "Fédérale 2 Féminine");

  verifie("F2 : 12 rencontres créées (14 journées moins 2 exemptions)", f2.length, 12);
  verifie("F2 : aucune rencontre contre le club fictif",
    f2.some((m) => /exempt/i.test(m.adv)), false);
  verifie("F2 : domicile et extérieur répartis",
    [f2.filter((m) => m.lieu === "dom").length, f2.filter((m) => m.lieu === "ext").length], [6, 6]);
  verifie("F2 : les rencontres portent un numéro de journée",
    f2.every((m) => /^J\d+$/.test(m.j)), true);
  verifie("les matchs de Régionale 3 sont intacts",
    OFFICIEL["2026-2027"].filter((m) => m.c === "Régionale 3").length, 6);
  verifie("vue Journée : le club fictif est écarté",
    JSON.stringify(JOURNEES["2026-2027"]["Fédérale 2 Féminine"]).includes("Exempt"), false);

  const taille = fs.statSync(path.join(TMP, "index.html")).size;
  verifie("2e passage : rien de neuf", /Rien de neuf/.test(passage()), true);
  verifie("2e passage : fichier intact", fs.statSync(path.join(TMP, "index.html")).size, taille);
}

console.log(echecs ? `\n${echecs} echec(s)` : "\nTout est bon.");
process.exit(echecs ? 1 : 0);
