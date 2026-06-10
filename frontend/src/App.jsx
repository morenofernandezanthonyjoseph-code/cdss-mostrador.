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
  const [evalResult, setEvalResult] = useState({ verdict: "green", alerts: [], food_alerts: [], drug_flags: [] });
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
    if (!cart.length) { setEvalResult({ verdict: "green", alerts: [], food_alerts: [], drug_flags: [] }); return; }
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
                  <FDABlock title="Interacciones (texto oficial FDA)" body={detail.fda.data.interactions || "La etiqueta no incluye seccion de interacciones."} />
                  <FDABlock title="Indicaciones aprobadas" body={detail.fda.data.indications || "No disponible."} />
                  <FDABlock title="Advertencias y precauciones" body={detail.fda.data.warnings || "No disponible."} />
                  <FDABlock title="Contraindicaciones" body={detail.fda.data.contraindications || "No disponible."} />
                  <CimaBlock inn={detail.inn} name={detail.name} />
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
function Field({ title, body, color, strong, mono }) {
  return (<div className="pt-2">
    <div style={{ fontSize: 10.5, color: color || C.sub }} className="font-mono uppercase">{title}</div>
    <div style={{ fontSize: 13.5, fontWeight: strong ? 600 : 400 }} className={mono ? "font-mono" : ""}>{body}</div>
  </div>);
}
function FDABlock({ title, body, danger }) {
  return (<div style={{ border: `1px solid ${danger ? C.redLine : C.line}`, background: danger ? C.redBg : C.surface, borderRadius: 10 }} className="p-3">
    <div style={{ fontSize: 11, color: danger ? C.red : C.fda }} className="font-mono uppercase font-semibold">{title}</div>
    <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>{body}</div>
  </div>);
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
