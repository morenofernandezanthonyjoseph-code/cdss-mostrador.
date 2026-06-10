"""Cache TTL en memoria, sin dependencias. Suficiente para un solo proceso.
Para multi-worker en produccion, sustituir por Redis (misma interfaz get/set)."""
import time
import threading
from typing import Any, Optional

_store: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def get(key: str) -> Optional[Any]:
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        expires_at, value = item
        if time.time() > expires_at:
            _store.pop(key, None)
            return None
        return value


def set(key: str, value: Any, ttl: int) -> None:
    with _lock:
        _store[key] = (time.time() + ttl, value)


def stats() -> dict:
    with _lock:
        now = time.time()
        live = sum(1 for exp, _ in _store.values() if exp > now)
        return {"entries": len(_store), "live": live}
