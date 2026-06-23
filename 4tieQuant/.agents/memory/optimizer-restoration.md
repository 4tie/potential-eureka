---
name: Optimizer Restoration
description: Optimizer backend deleted in one session, restored from git commit d531b7f in next. Key wiring points and gotchas.
---

## Rule
When restoring deleted optimizer files, use `git show d531b7f:<path>` — that is the last commit before the deletion commit `18c6411`.

**Why:** The optimizer was intentionally deleted in `18c6411`, so HEAD~1 of the wrong commit was tried first and failed.

## Wiring checklist (everything needed for the optimizer to start cleanly)
1. `backend/models/__init__.py` — add `from .optimizer import *`
2. `backend/api/models.py` — add `OptimizerApiRequest` Pydantic model
3. `backend/app_services.py` — import `OptimizerStore` + `StrategyOptimizerService`; instantiate both in `reload()` after `backtest_runner`
4. `backend/api/routers/optimizer.py` — included in app + has GET `/search-spaces/{strategy_name}` and GET `/session/{optimizer_session_id}` endpoints added manually
5. `backend/api/app.py` — import `optimizer` router and call `app.include_router(optimizer.router)`
6. `backend/api/log_broadcaster.py` — `services.strategy_optimizer.set_log_callback(broadcaster.write)`

## set_log_callback fix
`StrategyOptimizerService` stores `self._log_callback` internally but had **no public `set_log_callback` method**.  
Added one manually at line ~82 of `strategy_optimizer.py`:
```python
def set_log_callback(self, callback):
    self._log_callback = callback
```

**How to apply:** Any time the optimizer service is restored or rebuilt, check whether `set_log_callback` exists before wiring it in `log_broadcaster.py`.
