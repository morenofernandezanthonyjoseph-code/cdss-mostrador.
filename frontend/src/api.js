// Cliente del backend CDSS. La base se configura con VITE_API_BASE.
const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function getJSON(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch { /* noop */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  searchDrugs: (q) => getJSON(`/api/drugs/search?q=${encodeURIComponent(q)}`),
  label: (inn) => getJSON(`/api/label/${encodeURIComponent(inn)}`),
  cima: (name) => getJSON(`/api/cima/${encodeURIComponent(name)}`),
  rxnorm: (name) => getJSON(`/api/rxnorm/${encodeURIComponent(name)}`),
  interactions: (cart) =>
    getJSON(`/api/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart }),
    }),
  recommend: (q) => getJSON(`/api/recommend?q=${encodeURIComponent(q)}`),
  rules: () => getJSON(`/api/rules`),
  attributions: () => getJSON(`/api/attributions`),
  sources: () => getJSON(`/api/sources`),
  health: () => getJSON(`/health`),
};
