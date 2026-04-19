# Mnemos v4 Backend Deployment Guide

**Status:** ✅ Ready for Deployment  
**Date:** 2026-04-19  
**Version:** v4.0

## Quick Start

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start backend
uvicorn app.main:app --reload --port 8000
```

Backend will be available at: `http://localhost:8000/api`

## Prerequisites

- Python 3.14+
- Supabase account with v4 schema deployed
- API keys: Gemini, Groq (optional fallback)
- Redis (optional, for caching)

## Environment Setup

1. **Set environment variables** in `.env`:
```
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<optional-service-role>
GEMINI_API_KEY=<your-gemini-key>
GROQ_API_KEY=<your-groq-key>
AUTH_ENABLED=false
JWT_SECRET=dev-secret
BACKEND_PORT=8000
```

2. **Deploy database schema** (if new database):
   - Run `migrations/001_schema.sql` in Supabase SQL Editor
   - Enables 12-table v4 schema with vector search

## System Architecture

### Startup Sequence (Verified Working)
```
[OK] Settings loaded: BACKEND_PORT=8000
[OK] EventBus imported
[OK] Canvas SceneManager ready
[OK] Canvas renderer normalize_scene ready
[OK] Config settings loaded
[OK] V4 Backend startup sequence verified
```

### Canvas Module Stack (Verified Working)
- `app.canvas.renderer`: SceneManager (200+ lines, scene authority)
- `app.canvas.factory`: ElementFactory (30+ methods for element creation)
- `app.canvas.layout`: Diagram layout engine
- `app.canvas.text_measure`: Excalidraw text sizing
- `app.canvas.constants`: Schema definitions (EXCALIDRAW_VERSION=0.17.6)

All imports use correct v4 namespace: `app.canvas.*`, `app.core.*`

### Event-Driven Architecture
```
EventBus publishes:
  - ITEM_CREATED: New item captured
  - ITEM_UPDATED: Item properties changed
  - ITEM_READY: Item ready for placement
  - CANVAS_CHANGED: Canvas state updated
  - WORKSPACE_CREATED: New workspace initialized
```

Handlers in `app/services/capture.py` registered on startup.

### API Endpoints

**Chat/Commands:**
- `POST /api/chat` - Unified command endpoint
- Returns: `CommandResponse(text, intent, ui_action, data, canvas_update, error)`

**Canvas:**
- `PUT /api/canvas/sync` - Bidirectional canvas synchronization
- `GET /api/canvas/<workspace_id>` - Get workspace canvas

**Search:**
- `POST /api/search` - Semantic vector search
- Uses 768-dim embeddings, 0.65 similarity threshold

**Health:**
- `GET /api/health` - System health check

## Import Fixes (v3→v4 Migration)

### Fixed Files
- ✅ `app/services/curator.py`: `backend.app.canvas.*` → `app.canvas.*`
- ✅ `app/services/curator.py`: `backend.app.core.*` → `app.core.*`

### Verified Correct (Already v4)
- ✅ `app/canvas/__init__.py`: Correct v4 exports
- ✅ `app/canvas/renderer.py`: Correct v4 imports
- ✅ `app/canvas/layout.py`: Correct v4 imports
- ✅ `app/canvas/factory.py`: Correct v4 imports
- ✅ `app/canvas/text_measure.py`: Isolated utility
- ✅ `app/canvas/constants.py`: Pure data

### Runtime Verification
```
Exit Code: 0
All canvas modules import successfully
All core modules import successfully
Backend startup sequence verified
```

## Testing

### Unit Tests
```bash
pytest tests/
```

### Integration Tests
```bash
# Requires running backend + frontend
python eval/smoke_test.py
```

### Manual Testing

1. **Start backend:**
```bash
cd backend
uvicorn app.main:app --reload
```

2. **Test canvas imports:**
```bash
python -c "from app.canvas import SceneManager; print('OK')"
```

3. **Test API:**
```bash
curl http://localhost:8000/api/health
```

## Troubleshooting

**ModuleNotFoundError: No module named 'fastapi'**
- Run: `pip install -r requirements.txt`

**Supabase connection error**
- Check .env SUPABASE_URL and SUPABASE_KEY
- Verify schema is deployed (001_schema.sql)

**Canvas import errors**
- All fixed in this deployment
- Verify imports use `app.canvas.*` not `backend.app.*`

## Dependencies

**Core:**
- FastAPI 0.115+
- Uvicorn 0.30+
- Pydantic 2.0+

**Database:**
- Supabase 2.25.1
- PostgreSQL (via Supabase)

**LLM:**
- Google Generative AI 1.0+
- Groq 0.11+
- LangChain ecosystem

**Optional:**
- Redis 5.0+ (caching)

## Performance Tuning

- `SIMILARITY_THRESHOLD=0.65` - Vector search sensitivity
- `EMBEDDING_DIM=768` - Gemini embedding dimensions
- `CARD_W=360, CARD_H=240` - Canvas element sizing
- Redis cache: Enabled if `REDIS_URL` set

## Security

- `AUTH_ENABLED=false` for dev, `true` for production
- JWT_SECRET must be 64+ chars in production
- Service role key only used server-side
- CORS limited to localhost + extension

## Deployment Checklist

- [ ] Python 3.14+ installed
- [ ] `.env` configured with real credentials
- [ ] Supabase schema deployed
- [ ] `pip install -r requirements.txt` complete
- [ ] Backend starts: `uvicorn app.main:app --reload`
- [ ] Health check passes: `curl localhost:8000/api/health`
- [ ] Canvas imports work: Exit code 0 on import test
- [ ] Frontend configured to point to backend:8000
- [ ] Chrome extension configured for backend:8000

## Next Steps

1. Deploy database schema to Supabase
2. Set real credentials in .env
3. Start backend server
4. Configure frontend to connect
5. Run smoke tests
6. Deploy to production (ensure AUTH_ENABLED=true)

---

*Mnemos v4 Backend - Ready for Deployment*  
*All canvas imports migrated to v4 namespace*  
*Startup sequence verified: Exit Code 0*
