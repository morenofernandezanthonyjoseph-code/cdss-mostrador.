"""Busqueda fonetica anti-balbuceo para espanol. Espejo del algoritmo del frontend
para que cliente y servidor coincidan."""
import re
import unicodedata


def normalize(s: str) -> str:
    s = (s or "").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-zñ ]", "", s)
    return s.strip()


def phonetic_key(s: str) -> str:
    w = normalize(s).replace(" ", "")
    w = re.sub(r"qu", "k", w)
    w = re.sub(r"c([ei])", r"s\1", w)   # ce/ci -> se/si (seseo)
    w = re.sub(r"c", "k", w)             # resto c -> k
    w = re.sub(r"z", "s", w)             # seseo
    w = re.sub(r"v", "b", w)             # b == v
    w = re.sub(r"h", "", w)              # h muda
    w = re.sub(r"g([ei])", r"j\1", w)    # ge/gi -> je/ji
    w = re.sub(r"gu([ei])", r"g\1", w)
    w = re.sub(r"ll", "y", w)            # yeismo
    w = re.sub(r"x", "ks", w)
    w = re.sub(r"ph", "f", w)
    w = re.sub(r"(.)\1+", r"\1", w)      # colapsar dobles
    return w


def levenshtein(a: str, b: str) -> int:
    m, n = len(a), len(b)
    if not m:
        return n
    if not n:
        return m
    dp = list(range(m + 1))
    for j in range(1, n + 1):
        prev = dp[0]
        dp[0] = j
        for i in range(1, m + 1):
            tmp = dp[i]
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i] = min(dp[i] + 1, dp[i - 1] + 1, prev + cost)
            prev = tmp
    return dp[m]


def sim(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    return 1 - levenshtein(a, b) / max(len(a), len(b))


def score_drug(query: str, drug: dict) -> int:
    nq = normalize(query)
    pq = phonetic_key(query)
    best = 0.0
    for cand in [drug["name"], *drug.get("syn", [])]:
        nc = normalize(cand)
        ortho = sim(nc, nq)
        phon = sim(phonetic_key(cand), pq)
        start_bonus = 0.12 if nc.startswith(nq) else 0.0
        score = min(1.0, max(ortho, 0.96 * phon) + start_bonus)
        best = max(best, score)
    return round(best * 100)


def search(query: str, drugs: list[dict], threshold: int = 48, limit: int = 8) -> list[dict]:
    if len(normalize(query)) < 2:
        return []
    scored = [{**d, "score": score_drug(query, d)} for d in drugs]
    scored = [d for d in scored if d["score"] >= threshold]
    scored.sort(key=lambda d: d["score"], reverse=True)
    return scored[:limit]
