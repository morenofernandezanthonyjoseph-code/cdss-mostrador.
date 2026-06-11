import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { api } from "./api";

/* CDSS de Mostrador - frontend conectado al backend.
   Toda la informacion clinica viene del backend, que a su vez consulta
   openFDA / CIMA / RxNorm y aplica las reglas curadas. El frontend no
   inventa ni hardcodea datos clinicos. */

const C = {
  bg: "#FBFCFD", surface: "#FFFFFF", ink: "#0B1220", sub: "#56606E", line: "#DCE2E9",
  soft: "#F2F5F8", focus: "#1D4ED8", red: "#C8102E", redBg: "#FBE9EC", redLine: "#E7A9B2",
  amber: "#B45309", amberBg: "#FBF1E3", amberLine: "#E6C997", green: "#1B7A43",
  greenBg: "#E8F4EC", greenLine: "#A9D3B9", fda: "#0A4D8C", fdaBg: "#E7F0F8",
};
const SEV = {
  red: { color: C.red, bg: C.redBg, line: C.redLine, label: "CONTRAINDICADO" },
  amber: { color: C.amber, bg: C.amberBg, line: C.amberLine, label: "PRECAUCION" },
  green: { color: C.green, bg: C.greenBg, line: C.greenLine, label: "SIN ALERTAS CURADAS" },
};

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cart, setCart] = useState([]);            // {name,inn,atc,tags,rxcui,fda,cima}
  const [evalResult, setEvalResult] = useState({ verdict: "green", alerts: [], food_alerts: [], drug_flags: [], reconciliation: null });
  const [openAlert, setOpenAlert] = useState(null);
  const [detailAtc, setDetailAtc] = useState(null);
  const [indQuery, setIndQuery] = useState("");
  const [recommendation, setRecommendation] = useState(null);
  const [health, setHealth] = useState(null);
  const [attributions, setAttributions] = useState([]);
  const searchRef = useRef(null);

  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => { api.attributions().then((d) => setAttributions(d.attributions || [])).catch(() => {}); }, []);

  // Busqueda en el backend (debounce)
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.searchDrugs(query).then((d) => { setResults(d.results); setActiveIdx(0); }).catch(() => setResults([]));
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  // Reevaluar interacciones cada vez que cambia el carrito
  useEffect(() => {
    if (!cart.length) { setEvalResult({ verdict: "green", alerts: [], food_alerts: [], drug_flags: [], reconciliation: null }); return; }
    const payload = cart.map(({ name, inn, atc, tags }) => ({ name, inn, atc, tags }));
    api.interactions(payload).then(setEvalResult).catch(() => {});
  }, [cart]);

  // Recomendacion (debounce)
  useEffect(() => {
    if (indQuery.trim().length < 3) { setRecommendation(null); return; }
    const t = setTimeout(() => { api.recommend(indQuery).then((d) => setRecommendation(d.match || "none")).catch(() => setRecommendation(null)); }, 200);
    return () => clearTimeout(t);
  }, [indQuery]);

  const loadFicha = useCallback(async (atc, inn, name) => {
    setCart((c) => c.map((x) => x.atc === atc ? { ...x, fda: { status: "loading" } } : x));
    try {
      const r = await api.label(inn);
      setCart((c) => c.map((x) => x.atc === atc ? { ...x, fda: { status: "ok", data: r.data }, rxcui: r.data.rxcui || x.rxcui } : x));
    } catch (e) {
      setCart((c) => c.map((x) => x.atc === atc ? { ...x, fda: { status: "error", error: e.message } } : x));
    }
  }, []);

  const addDrug = useCallback((drug) => {
    if (cart.some((c) => c.atc === drug.atc)) return;
    setCart((c) => [...c, { name: drug.name, inn: drug.inn, atc: drug.atc, tags: drug.tags, rxcui: null, fda: { status: "idle" } }]);
    setQuery(""); setResults([]); setActiveIdx(0); searchRef.current?.focus();
    loadFicha(drug.atc, drug.inn, drug.name);
  }, [cart, loadFicha]);

  const removeDrug = (atc) => { setCart((c) => c.filter((x) => x.atc !== atc)); if (detailAtc === atc) setDetailAtc(null); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape" && detailAtc) setDetailAtc(null);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [detailAtc]);

  const onSearchKey = (e) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); addDrug(results[activeIdx]); }
    else if (e.key === "Escape") setQuery("");
  };

  const sv = SEV[evalResult.verdict] || SEV.green;
  const detail = cart.find((c) => c.atc === detailAtc);

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: "100vh", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
        .cf:focus-visible{outline:2px solid ${C.focus};outline-offset:2px;border-radius:6px}
        button:focus-visible{outline:2px solid ${C.focus};outline-offset:2px}
        kbd{background:#EEF1F5;border:1px solid #D5DBE2;border-radius:4px;padding:1px 5px;font-size:10px}
      `}</style>

      <header style={{ borderBottom: `1px solid ${C.line}`, background: C.surface }} className="px-5 py-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: C.sub }} className="font-mono uppercase">Soporte a la decision farmaceutica</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>CDSS de Mostrador</div>
        </div>
        <div style={{ fontSize: 11, color: health ? C.green : C.amber }} className="font-mono">
          {health ? `backend ok - reglas v${health.rules_version}` : "backend no conectado"}
        </div>
      </header>

      <div style={{ background: sv.bg, borderBottom: `1px solid ${sv.line}` }} className="px-5 py-3">
        <div style={{ fontSize: 12, letterSpacing: "0.14em", color: sv.color }} className="font-mono uppercase font-semibold">{sv.label}</div>
        <div style={{ fontSize: 15 }}>
          {evalResult.alerts.length === 0
            ? (cart.length ? "Sin alertas en las reglas curadas. Revisa el texto oficial de cada ficha." : "Agrega los farmacos del recipe para evaluar.")
            : `${evalResult.alerts.length} alerta(s) entre ${cart.length} farmacos (reglas curadas).`}
        </div>
      </div>

      {evalResult.drug_flags && evalResult.drug_flags.length > 0 && (
        <div style={{ background: C.redBg, borderBottom: `1px solid ${C.redLine}` }} className="px-5 py-2.5">
          <div style={{ fontSize: 11, color: C.red }} className="font-mono uppercase font-semibold">Banderas de paciente</div>
          {evalResult.drug_flags.map((f, i) => (
            <div key={i} style={{ fontSize: 13.5, color: C.ink }}>
              <strong>{f.drug}</strong> — {f.text}
            </div>
          ))}
        </div>
      )}

      <main className="p-5 grid gap-5" style={{ gridTemplateColumns: "minmax(240px,0.9fr) minmax(260px,1fr) minmax(280px,1.1fr)" }}>
        {/* Buscador */}
        <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-4">
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>01 - Buscador fonetico</h2>
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
            placeholder='ej: "asitromisina"' className="cf w-full mt-3"
            style={{ padding: "11px 12px", fontSize: 16, border: `1px solid ${C.line}`, borderRadius: 8 }} />
          <div style={{ fontSize: 11, color: C.sub }} className="font-mono mt-1.5"><kbd>/</kbd> buscar · <kbd>Enter</kbd> agregar</div>
          <div className="mt-3 flex flex-col gap-1.5">
            {results.map((r, i) => (
              <button key={r.atc} onClick={() => addDrug(r)} onMouseEnter={() => setActiveIdx(i)}
                className="cf text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg"
                style={{ border: `1px solid ${i === activeIdx ? C.focus : C.line}`, background: i === activeIdx ? "#F3F6FF" : C.surface }}>
                <div className="min-w-0">
                  <div style={{ fontSize: 15, fontWeight: 600 }} className="truncate">{r.name}</div>
                  <div style={{ fontSize: 11, color: C.sub }} className="font-mono">ATC {r.atc} · {r.inn}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.score >= 85 ? C.green : r.score >= 65 ? C.amber : C.sub, background: C.soft }} className="font-mono px-2 py-1 rounded">{r.score}%</span>
              </button>
            ))}
          </div>
        </section>

        {/* Carrito */}
        <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-4">
          <div className="flex items-center justify-between">
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>02 - Carrito del recipe</h2>
            {cart.length > 0 && <button onClick={() => setCart([])} className="cf" style={{ fontSize: 12, color: C.sub }}>Vaciar</button>}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {!cart.length && <Empty text="Busca un principio activo y agregalo. Se consulta openFDA al instante." />}
            {cart.map((d) => {
              const worst = evalResult.alerts.find((a) => a.pair.includes(d.name))?.severity || "green";
              const st = d.fda?.status;
              return (
                <div key={d.atc} className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${detailAtc === d.atc ? C.focus : C.line}` }}>
                  <div style={{ width: 5, background: SEV[worst].color }} />
                  <button onClick={() => setDetailAtc(d.atc)} className="cf flex-1 text-left px-3 py-2.5 min-w-0">
                    <div style={{ fontSize: 15, fontWeight: 600 }} className="truncate">{d.name}</div>
                    <div style={{ fontSize: 11, color: C.sub }} className="font-mono">
                      ATC {d.atc} · RxCUI {d.rxcui || "—"} · {st === "ok" ? "ficha FDA" : st === "loading" ? "consultando…" : st === "error" ? "sin ficha FDA" : ""}
                    </div>
                  </button>
                  <button onClick={() => removeDrug(d.atc)} className="cf px-3" style={{ color: C.sub }} aria-label={`Quitar ${d.name}`}>✕</button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Alertas */}
        <section className="flex flex-col gap-5">
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-4">
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>03 - Alertas de interaccion</h2>
            <div style={{ fontSize: 12, color: C.sub }}>Reglas por clase — curaduria propia</div>
            <div className="mt-3 flex flex-col gap-2">
              {!evalResult.alerts.length && cart.length > 1 && <div style={{ color: C.green, fontSize: 14 }}>Sin alertas en las reglas curadas.</div>}
              {!evalResult.alerts.length && cart.length <= 1 && <Empty text="Se necesitan >=2 farmacos." />}
              {evalResult.alerts.map((a, idx) => {
                const s = SEV[a.severity]; const open = openAlert === idx;
                return (
                  <div key={idx} style={{ border: `1px solid ${s.line}`, background: s.bg, borderRadius: 10 }}>
                    <button onClick={() => setOpenAlert(open ? null : idx)} className="cf w-full text-left px-3 py-2.5">
                      <div style={{ fontSize: 11, color: s.color }} className="font-mono uppercase font-semibold">
                        {s.label}{a.source && a.source !== "curaduria_propia" ? ` · ${a.source}` : ""}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{a.pair[0]} + {a.pair[1]}</div>
                    </button>
                    {open && (
                      <div className="px-3 pb-3" style={{ borderTop: `1px solid ${s.line}` }}>
                        <Field title="Mecanismo" body={a.mechanism} />
                        <Field title="Conducta en mostrador" body={a.conduct} color={s.color} strong />
                        <Field title="Base" body={`${a.cite} Verifica el texto oficial en la ficha FDA.`} mono />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-4">
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>04 - Interacciones alimentarias</h2>
            <div className="mt-3 flex flex-col gap-2">
              {!evalResult.food_alerts.length && <Empty text="Sin alertas alimentarias para el carrito actual." />}
              {evalResult.food_alerts.map((f, i) => (
                <div key={i} className="px-3 py-2.5 rounded-lg" style={{ background: C.soft, border: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.sub }} className="font-mono">{f.drug}</div>
                  <div style={{ fontSize: 13.5 }}>{f.text}</div>
                </div>
              ))}
            </div>
          </div>

          {evalResult.reconciliation && cart.length >= 2 && <Reconciliacion rec={evalResult.reconciliation} />}
        </section>
      </main>

      {/* Recomendacion */}
      <section className="px-5 pb-10">
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-4">
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>05 - Recomendacion terapeutica</h2>
          <div style={{ fontSize: 12, color: C.sub }}>Lineas segun guia citada — sin metricas inventadas</div>
          <input value={indQuery} onChange={(e) => setIndQuery(e.target.value)} placeholder='ej: "hipertension", "asma", "tos seca"'
            className="cf w-full mt-3" style={{ maxWidth: 420, padding: "11px 12px", fontSize: 15, border: `1px solid ${C.line}`, borderRadius: 8 }} />
          {recommendation === "none" && <div className="mt-3"><Empty text="No hay entrada de guia curada para ese termino. (No se inventan lineas.)" /></div>}
          {recommendation && recommendation !== "none" && (
            <div className="mt-4">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>{recommendation.title}</h3>
                <span style={{ fontSize: 12, color: C.sub }} className="font-mono">Fuente: {recommendation.guideline}</span>
              </div>
              <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
                {recommendation.lines.map((ln, i) => (
                  <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 10 }} className="overflow-hidden">
                    <div style={{ background: C.ink, color: "#fff", fontSize: 11 }} className="font-mono uppercase px-3 py-1.5">{ln.line}</div>
                    <div className="p-3 flex flex-col gap-2.5">
                      {ln.options.map((o, j) => (
                        <div key={j}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{o.drug}</div>
                          {o.note && o.note !== "-" && <div style={{ fontSize: 13, color: C.sub }}>{o.note}</div>}
                          {o.warn && <div style={{ fontSize: 12.5, color: C.amber, marginTop: 4 }}>⚠ {o.warn}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5"><Calculadoras /></div>

        <div className="mt-4 px-4 py-3 rounded-lg" style={{ background: C.fdaBg, border: `1px solid ${C.fda}33`, fontSize: 13, lineHeight: 1.5 }}>
          <strong>Procedencia.</strong> Ficha, interacciones, indicaciones y advertencias de cada farmaco vienen del backend, que consulta <strong>openFDA</strong> (CC0) y, cuando aplica, <strong>CIMA/AEMPS</strong>. Las alertas de color y las lineas de tratamiento son <strong>curaduria propia</strong> (reglas versionadas). Orientativo: no sustituye el criterio clinico.
          {attributions.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.fda}22`, fontSize: 12, color: C.sub }}>
              <strong>Fuentes:</strong> {attributions.map((a, i) => (
                <span key={i}>{i > 0 ? " · " : " "}{a.source}</span>
              ))}
              <div style={{ marginTop: 4 }}>{attributions.filter((a) => !a.always).map((a, i) => <div key={i}>{a.text}</div>)}</div>
            </div>
          )}
        </div>
      </section>

      {/* Panel ficha */}
      {detail && (
        <div onClick={() => setDetailAtc(null)} style={{ position: "fixed", inset: 0, background: "rgba(11,18,32,0.45)", zIndex: 50 }} className="flex justify-end">
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(520px,100%)", background: C.surface, height: "100%", overflowY: "auto" }}>
            <div style={{ borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: C.surface }} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div style={{ fontSize: 11, color: C.fda }} className="font-mono uppercase">Ficha oficial · openFDA</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{detail.name} <span style={{ fontWeight: 400, color: C.sub, fontSize: 14 }}>{detail.inn}</span></div>
              </div>
              <button onClick={() => setDetailAtc(null)} className="cf p-2" style={{ color: C.sub }}>✕</button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {detail.fda?.status === "loading" && <div style={{ color: C.fda }}>Consultando openFDA…</div>}
              {detail.fda?.status === "error" && (
                <div>
                  <div className="px-3 py-3 rounded-lg" style={{ background: C.amberBg, border: `1px solid ${C.amberLine}`, fontSize: 13.5 }}>
                    {detail.fda.error} Muchas fichas de openFDA son de medicamentos comercializados en EE. UU.
                  </div>
                  <button onClick={() => loadFicha(detail.atc, detail.inn, detail.name)} className="cf mt-3 px-3 py-2 rounded" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}>Reintentar</button>
                </div>
              )}
              {detail.fda?.status === "ok" && (
                <>
                  {detail.fda.data.pharm_class && <FDABlock title="Clase farmacologica (FDA)" body={detail.fda.data.pharm_class} />}
                  {detail.fda.data.boxed && <FDABlock title="Recuadro de advertencia" body={detail.fda.data.boxed} danger />}
                  {detail.fda.data.dosage && <FDABlock title="Posologia (texto oficial FDA)" body={detail.fda.data.dosage} />}
                  {detail.fda.data.specific_populations && <FDABlock title="Poblaciones especiales (renal/hepatico/embarazo)" body={detail.fda.data.specific_populations} />}
                  {detail.fda.data.pediatric && <FDABlock title="Uso pediatrico (FDA)" body={detail.fda.data.pediatric} />}
                  <FDABlock title="Interacciones (texto oficial FDA)" body={detail.fda.data.interactions || "La etiqueta no incluye seccion de interacciones."} />
                  <FDABlock title="Indicaciones aprobadas" body={detail.fda.data.indications || "No disponible."} />
                  <FDABlock title="Advertencias y precauciones" body={detail.fda.data.warnings || "No disponible."} />
                  <FDABlock title="Contraindicaciones" body={detail.fda.data.contraindications || "No disponible."} />
                  <CimaBlock inn={detail.inn} name={detail.name} />
                  <MismaClase inn={detail.inn} onPick={(picked) => { setDetailAtc(null); const found = cart.find((c) => c.inn === picked); if (found) setDetailAtc(found.atc); }} />
                  <div style={{ fontSize: 11, color: C.sub }} className="font-mono">Texto literal de la etiqueta FDA (CC0), en ingles. La ficha en espanol viene de CIMA (AEMPS) cuando esta disponible.</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ text }) { return <div style={{ fontSize: 13, color: C.sub, background: C.soft, border: `1px dashed ${C.line}`, borderRadius: 8 }} className="px-3 py-4 text-center">{text}</div>; }

function Reconciliacion({ rec }) {
  const ac = rec.anticholinergic || {};
  const acColor = ac.total >= 3 ? C.red : ac.total >= 1 ? C.amber : C.green;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>05 - Reconciliacion (bolsa del paciente)</h2>
        <span style={{ fontSize: 11, color: C.sub }} className="font-mono">{rec.n_drugs} productos</span>
      </div>

      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="px-3 py-2.5 rounded-lg" style={{ background: rec.polypharmacy ? C.amberBg : C.soft, border: `1px solid ${rec.polypharmacy ? C.amberLine : C.line}` }}>
          <div style={{ fontSize: 11, color: C.sub }} className="font-mono uppercase">Polifarmacia</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: rec.polypharmacy ? C.amber : C.ink }}>{rec.polypharmacy ? "Si (>=5 farmacos)" : "No"}</div>
        </div>
        <div className="px-3 py-2.5 rounded-lg" style={{ background: ac.total >= 3 ? C.redBg : ac.total >= 1 ? C.amberBg : C.soft, border: `1px solid ${ac.total >= 3 ? C.redLine : ac.total >= 1 ? C.amberLine : C.line}` }}>
          <div style={{ fontSize: 11, color: C.sub }} className="font-mono uppercase">Carga anticolinergica</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: acColor }}>{ac.total} · {ac.level}</div>
        </div>
      </div>

      {ac.breakdown && ac.breakdown.length > 0 && (
        <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: C.soft, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 11, color: C.sub }} className="font-mono">Aportan carga: {ac.breakdown.map((b, i) => <span key={i}>{i ? " · " : ""}{b.drug} ({b.score})</span>)}</div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3 }}>{ac.note} · Escala {ac.scale}.</div>
        </div>
      )}

      {rec.ingredient_duplications && rec.ingredient_duplications.length > 0 && (
        <div className="mt-2">
          <div style={{ fontSize: 11, color: C.red }} className="font-mono uppercase font-semibold">Duplicidad de principio activo</div>
          {rec.ingredient_duplications.map((d, i) => (
            <div key={i} className="px-3 py-2 rounded-lg mt-1" style={{ background: d.severity === "red" ? C.redBg : C.amberBg, border: `1px solid ${d.severity === "red" ? C.redLine : C.amberLine}` }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.ingredient}</div>
              <div style={{ fontSize: 12.5, color: C.sub }}>en: {d.drugs.join(", ")}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 8 }}>Vista pensada para revisar la "bolsa" del paciente polimedicado: detecta el mismo principio activo en varios productos y resume la carga anticolinergica total.</div>
    </div>
  );
}

function Calculadoras() {
  const [tab, setTab] = React.useState("ped");
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>06 - Calculadoras</h2>
        <span style={{ fontSize: 10, color: C.amber, background: C.amberBg, border: `1px solid ${C.amberLine}` }} className="font-mono uppercase px-2 py-1 rounded">La aritmetica es exacta · el dato mg/kg se verifica</span>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => setTab("ped")} className="cf px-3 py-1.5 rounded" style={{ fontSize: 13, fontWeight: 600, border: `1px solid ${tab === "ped" ? C.focus : C.line}`, background: tab === "ped" ? "#F3F6FF" : C.surface }}>Dosis pediatrica</button>
        <button onClick={() => setTab("crcl")} className="cf px-3 py-1.5 rounded" style={{ fontSize: 13, fontWeight: 600, border: `1px solid ${tab === "crcl" ? C.focus : C.line}`, background: tab === "crcl" ? "#F3F6FF" : C.surface }}>Funcion renal (CrCl)</button>
      </div>
      <div className="mt-4">{tab === "ped" ? <CalcPediatrica /> : <CalcRenal />}</div>
    </div>
  );
}

function CalcPediatrica() {
  const [drugs, setDrugs] = React.useState([]);
  const [inn, setInn] = React.useState("");
  const [weight, setWeight] = React.useState("");
  const [ageM, setAgeM] = React.useState("");
  const [res, setRes] = React.useState(null);
  const [err, setErr] = React.useState("");

  React.useEffect(() => { api.pediatricAvailable().then((d) => { setDrugs(d.drugs); if (d.drugs[0]) setInn(d.drugs[0].inn); }).catch(() => {}); }, []);

  const calc = async () => {
    setErr(""); setRes(null);
    const w = parseFloat(weight);
    if (!inn || !w || w <= 0) { setErr("Elegi un farmaco y un peso valido."); return; }
    try {
      const d = await api.pediatric(inn, w, ageM ? parseFloat(ageM) : undefined);
      if (!d.available) { setErr(d.msg); return; }
      setRes(d.result);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "1.4fr 1fr 1fr auto" }}>
        <select value={inn} onChange={(e) => setInn(e.target.value)} className="cf" style={{ padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }}>
          {drugs.length === 0 && <option>Sin tabla cargada</option>}
          {drugs.map((d) => <option key={d.inn} value={d.inn}>{d.name}</option>)}
        </select>
        <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso (kg)" inputMode="decimal" className="cf" style={{ padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }} />
        <input value={ageM} onChange={(e) => setAgeM(e.target.value)} placeholder="Edad (meses)" inputMode="decimal" className="cf" style={{ padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }} />
        <button onClick={calc} className="cf px-4 rounded" style={{ background: C.ink, color: "#fff", fontSize: 14, fontWeight: 600 }}>Calcular</button>
      </div>
      {err && <div style={{ fontSize: 13, color: C.amber, marginTop: 8 }}>{err}</div>}
      {res && (
        <div className="mt-3 p-3 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.soft }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{res.drug} · {res.weight_kg} kg</div>
          {res.per_dose && (
            <div style={{ fontSize: 14, marginTop: 6 }}>
              <strong>{res.per_dose.mg_por_toma} mg por toma</strong> cada {res.per_dose.frecuencia_horas} h
              <div style={{ fontSize: 12, color: C.sub }} className="font-mono">{res.per_dose.calculo}{res.per_dose.topeado ? ` (topeado al maximo ${res.per_dose.max_por_toma_mg} mg)` : ""}</div>
            </div>
          )}
          {res.per_day && (
            <div style={{ fontSize: 14, marginTop: 6 }}>
              <strong>{res.per_day.mg_por_dia} mg/dia</strong> en {res.per_day.tomas_por_dia} tomas ({res.per_day.mg_por_toma} mg c/u)
              <div style={{ fontSize: 12, color: C.sub }} className="font-mono">{res.per_day.calculo}</div>
            </div>
          )}
          {res.warnings && res.warnings.length > 0 && res.warnings.map((w, i) => <div key={i} style={{ fontSize: 13, color: C.red, marginTop: 4 }}>⚠ {w}</div>)}
          {res.note && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>{res.note}</div>}
          <div style={{ fontSize: 11, color: C.amber, marginTop: 8, fontWeight: 600 }}>Fuente del dato: {res.source} — VERIFICAR antes de administrar.</div>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 8 }}>La calculadora solo multiplica peso x mg/kg con topes. El valor mg/kg sale de la tabla curada (pediatric_doses.json); ampliala desde tu fuente oficial.</div>
    </div>
  );
}

function CalcRenal() {
  const [age, setAge] = React.useState("");
  const [weight, setWeight] = React.useState("");
  const [scr, setScr] = React.useState("");
  const [sex, setSex] = React.useState("m");
  const [res, setRes] = React.useState(null);
  const [err, setErr] = React.useState("");

  const calc = async () => {
    setErr(""); setRes(null);
    const a = parseFloat(age), w = parseFloat(weight), s = parseFloat(scr);
    if (!a || !w || !s) { setErr("Completa edad, peso y creatinina."); return; }
    try { const d = await api.crcl(a, w, s, sex); if (d.ok) setRes(d.result); else setErr("Datos invalidos."); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr auto" }}>
        <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Edad (anos)" inputMode="decimal" className="cf" style={{ padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }} />
        <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso (kg)" inputMode="decimal" className="cf" style={{ padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }} />
        <input value={scr} onChange={(e) => setScr(e.target.value)} placeholder="Creatinina (mg/dL)" inputMode="decimal" className="cf" style={{ padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }} />
        <select value={sex} onChange={(e) => setSex(e.target.value)} className="cf" style={{ padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 14 }}>
          <option value="m">Hombre</option>
          <option value="f">Mujer</option>
        </select>
        <button onClick={calc} className="cf px-4 rounded" style={{ background: C.ink, color: "#fff", fontSize: 14, fontWeight: 600 }}>Calcular</button>
      </div>
      {err && <div style={{ fontSize: 13, color: C.amber, marginTop: 8 }}>{err}</div>}
      {res && (
        <div className="mt-3 p-3 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.soft }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{res.crcl_ml_min} ml/min</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{res.categoria}</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{res.formula}. {res.aviso}</div>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 8 }}>Cockcroft-Gault. El ajuste de dosis de cada farmaco se consulta en su ficha tecnica; esta calculadora solo estima el aclaramiento.</div>
    </div>
  );
}
function Field({ title, body, color, strong, mono }) {
  return (<div className="pt-2">
    <div style={{ fontSize: 10.5, color: color || C.sub }} className="font-mono uppercase">{title}</div>
    <div style={{ fontSize: 13.5, fontWeight: strong ? 600 : 400 }} className={mono ? "font-mono" : ""}>{body}</div>
  </div>);
}
// Traduccion gratis al vuelo (endpoint publico de Google Translate, sin clave).
// Se usa SOLO como ayuda: el original en ingles queda siempre visible.
async function traducir(texto) {
  const trozo = texto.slice(0, 4500); // limite del endpoint
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(trozo)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo traducir");
  const data = await r.json();
  return (data[0] || []).map((seg) => seg[0]).join("");
}

function FDABlock({ title, body, danger }) {
  const [tr, setTr] = React.useState(null);     // texto traducido
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const traducible = typeof body === "string" && body.length > 3 && !body.startsWith("No disponible") && !body.startsWith("La etiqueta no");

  const doTraducir = async () => {
    if (tr) { setTr(null); return; }   // toggle: volver al ingles
    setLoading(true); setErr("");
    try { setTr(await traducir(body)); }
    catch { setErr("No se pudo traducir ahora. Queda el original en ingles."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ border: `1px solid ${danger ? C.redLine : C.line}`, background: danger ? C.redBg : C.surface, borderRadius: 10 }} className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div style={{ fontSize: 11, color: danger ? C.red : C.fda }} className="font-mono uppercase font-semibold">{title}</div>
        {traducible && (
          <button onClick={doTraducir} className="cf px-2 py-0.5 rounded shrink-0" style={{ fontSize: 11, border: `1px solid ${C.line}`, color: C.fda }}>
            {loading ? "..." : tr ? "Ver ingles" : "Traducir"}
          </button>
        )}
      </div>
      {err && <div style={{ fontSize: 12, color: C.amber, marginTop: 4 }}>{err}</div>}
      {tr ? (
        <div className="mt-1.5">
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 600 }} className="font-mono uppercase">Traduccion automatica — verificar contra el original</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }}>{tr}</div>
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 11, color: C.sub, cursor: "pointer" }}>Ver original en ingles (FDA)</summary>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 4, whiteSpace: "pre-wrap", color: C.sub, maxHeight: 180, overflowY: "auto" }}>{body}</div>
          </details>
        </div>
      ) : (
        <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>{body}</div>
      )}
    </div>
  );
}

function MismaClase({ inn }) {
  const [state, setState] = React.useState({ status: "idle" });
  const [openInn, setOpenInn] = React.useState(null);
  const [fichas, setFichas] = React.useState({});

  const load = async () => {
    setState({ status: "loading" });
    try { const r = await api.similar(inn); setState({ status: "ok", data: r }); }
    catch (e) { setState({ status: "error", error: e.message }); }
  };

  const verFicha = async (m) => {
    if (openInn === m.inn) { setOpenInn(null); return; }
    setOpenInn(m.inn);
    if (!fichas[m.inn]) {
      try { const r = await api.label(m.inn); setFichas((f) => ({ ...f, [m.inn]: r.data })); }
      catch { setFichas((f) => ({ ...f, [m.inn]: { _err: true } })); }
    }
  };

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-3">
      <div style={{ fontSize: 11, color: C.fda }} className="font-mono uppercase font-semibold">Misma clase terapeutica (ATC)</div>
      {state.status === "idle" && (
        <button onClick={load} className="cf mt-2 px-3 py-1.5 rounded" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}>Ver farmacos parecidos</button>
      )}
      {state.status === "loading" && <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>Buscando...</div>}
      {state.status === "error" && <div style={{ fontSize: 13, color: C.amber, marginTop: 6 }}>{state.error}</div>}
      {state.status === "ok" && (
        <div className="mt-2">
          {(!state.data.members || state.data.members.length === 0) ? (
            <div style={{ fontSize: 13, color: C.sub }}>No se encontraron otros de la misma clase en el catalogo cargado.</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Clase ATC {state.data.atc3}. Compara las fichas oficiales para ver las diferencias objetivas. La eleccion final es criterio del profesional.</div>
              {state.data.members.map((m, i) => (
                <div key={i} style={{ borderTop: i ? `1px solid ${C.line}` : "none", paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}>
                  <button onClick={() => verFicha(m)} className="cf w-full text-left flex items-center justify-between">
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: C.fda }} className="font-mono">{openInn === m.inn ? "ocultar" : "ver ficha"}</span>
                  </button>
                  {openInn === m.inn && (
                    <div className="mt-1" style={{ fontSize: 12.5, color: C.ink }}>
                      {!fichas[m.inn] && <span style={{ color: C.sub }}>Cargando ficha...</span>}
                      {fichas[m.inn] && fichas[m.inn]._err && <span style={{ color: C.amber }}>Sin ficha openFDA para este farmaco.</span>}
                      {fichas[m.inn] && !fichas[m.inn]._err && (
                        <div style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                          <strong>Indicacion (FDA):</strong> {fichas[m.inn].indications || "no disponible"}
                          {fichas[m.inn].dosage ? <div style={{ marginTop: 6 }}><strong>Posologia:</strong> {fichas[m.inn].dosage.slice(0, 400)}</div> : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CimaBlock({ inn, name }) {
  const [state, setState] = React.useState({ status: "idle" });
  const load = async () => {
    setState({ status: "loading" });
    try {
      // Probar primero por nombre en espanol; si no, por INN.
      let r;
      try { r = await api.cima(name); }
      catch { r = await api.cima(inn); }
      setState({ status: "ok", data: r });
    } catch (e) {
      setState({ status: "error", error: e.message });
    }
  };
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-3">
      <div style={{ fontSize: 11, color: C.green }} className="font-mono uppercase font-semibold">Ficha en espanol (CIMA / AEMPS)</div>
      {state.status === "idle" && (
        <button onClick={load} className="cf mt-2 px-3 py-1.5 rounded" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}>Buscar ficha en espanol</button>
      )}
      {state.status === "loading" && <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>Consultando CIMA...</div>}
      {state.status === "error" && <div style={{ fontSize: 13, color: C.amber, marginTop: 6 }}>{state.error} (CIMA cubre medicamentos registrados en Espana.)</div>}
      {state.status === "ok" && (
        <div className="mt-2 flex flex-col gap-2">
          {(state.data.resultados || []).length === 0 && <div style={{ fontSize: 13, color: C.sub }}>Sin coincidencias en CIMA.</div>}
          {(state.data.resultados || []).map((m, i) => (
            <div key={i} style={{ fontSize: 13, borderTop: i ? `1px solid ${C.line}` : "none", paddingTop: i ? 8 : 0 }}>
              <div style={{ fontWeight: 600 }}>{m.nombre}</div>
              <div style={{ color: C.sub }}>{m.labtitular}{m.receta ? " · con receta" : ""}</div>
              {(m.docs || []).map((d, k) => d.url && (
                <a key={k} href={d.url} target="_blank" rel="noreferrer" style={{ color: C.fda, fontSize: 12.5 }}>
                  {d.tipo === 1 ? "Ficha tecnica" : d.tipo === 2 ? "Prospecto" : "Documento"} ↗
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
