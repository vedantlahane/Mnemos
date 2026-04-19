# Frontend Refactoring Plan - Mnemos v3 API Alignment

## Phase 1: Remove Deprecated Types & Code (CURRENT)

### Types to Remove from types.ts
- [ ] `PageDocument` interface - Lines 205-213
- [ ] `PageBlock` interface - Lines 208-230
- [ ] `PageDocumentBundle` interface - Lines 232-237
- [ ] `BlockReference` interface - Lines 235-246
- [ ] `InlineEmbed` interface - Lines 248-261
- [ ] `BlockCreateRequest` type
- [ ] `BlockUpdateRequest` type
- [ ] `BlockMoveRequest` type
- [ ] `BlockReferenceCreateRequest` type
- [ ] `InlineEmbedCreateRequest` type
- [ ] `DocumentUpdateRequest` type
- [ ] All notebook-related types

### Code to Remove
- [ ] `useNotebookMode.ts` hook - entire file (not supported in backend)
- [ ] Notebook mode references in useCommands.ts
- [ ] Layout mode handling (canvas vs notebook) from pages
- [ ] Region/Cluster types and related code

### Client.ts Cleanup
- [ ] Remove unused imports related to document/block types from client.ts
- [ ] Remove compatibility layer for notebook operations (if any)

---

## Phase 2: Update API Usage in Hooks & Components

### useStream.ts Updates
- [ ] Update `saveConversation()` to use `chat.getHistory()` endpoint correctly
- [ ] Ensure chat messages are saved with proper format

### useCanvasChat.ts Updates
- [ ] Update to use new `canvasChat.stream()` properly from client
- [ ] Update response handling for new API format

### lib/canvasOps.ts Updates
- [ ] Refactor `streamCanvasOps()` to use new canvas-chat endpoint
- [ ] Update SSE event handling for new response format
- [ ] Update element placement logic

### useCommands.ts Updates
- [ ] Remove any deprecated command handlers
- [ ] Verify all `/diagram`, `/compose` commands use new API

---

## Phase 3: Components & Blocks

### Remove/Update Blocks
- [ ] Review all blocks in `frontend/src/blocks/` for deprecated API usage
- [ ] Remove any notebook-specific blocks
- [ ] Update WelcomeBlock to use new workspace.overview structure

### Canvas Components
- [ ] Update ExcalidrawCanvas.tsx to work with new scene API
- [ ] Verify CanvasOverlay.tsx uses new sync/events

---

## Phase 4: Types Cleanup

### Consolidate Types
- [ ] Move app-specific types to dedicated files
- [ ] Remove all notebook/document-related type definitions
- [ ] Ensure types match actual API responses

---

## Phase 5: Integration & Testing

### Testing
- [ ] Verify page creation/opening works
- [ ] Test note capture and processing
- [ ] Test canvas chat and AI diagram generation
- [ ] Test real-time sync with SSE events
- [ ] Test chat streaming

---

## Summary of Changes

**Files to Delete:**
- `frontend/src/hooks/useNotebookMode.ts`

**Files to Significantly Update:**
- `frontend/src/types.ts` (remove ~50+ lines of unused types)
- `frontend/src/api/client.ts` (imports cleanup)
- `frontend/src/hooks/useStream.ts` (chat history save)
- `frontend/src/lib/canvasOps.ts` (new SSE format)
- `frontend/src/canvas/canvasAI.ts` (canvas operations)

**Files to Minor Updates:**
- `frontend/src/hooks/useCanvasChat.ts` (response handling)
- `frontend/src/hooks/useCommands.ts` (verify commands work)

**No Changes Needed:**
- Most block components (they already use supported APIs)
- Most UI components (Stream, CommandBar, etc.)
- Canvas rendering (ExcalidrawCanvas)

---

## API Endpoints Used (Verified Compatible)
✓ POST /auth/google
✓ POST /auth/refresh  
✓ GET /auth/me
✓ GET /pages
✓ POST /pages
✓ GET /pages/{id}
✓ PUT /pages/{id}
✓ DELETE /pages/{id}
✓ GET /pages/{id}/scene
✓ PUT /pages/{id}/scene
✓ GET /pages/{id}/scene/version
✓ POST /pages/{id}/scene/rebuild
✓ POST /pages/{id}/sync
✓ GET /pages/{id}/sync/version
✓ GET /pages/{id}/sync/ops
✓ GET /pages/{id}/events (SSE)
✓ GET /notes
✓ GET /notes/tags
✓ GET /notes/{id}
✓ PUT /notes/{id}
✓ DELETE /notes/{id}
✓ POST /notes/{id}/move
✓ GET /pages/{id}/notes
✓ POST /capture
✓ POST /capture/batch
✓ POST /capture/context
✓ GET /capture/status/{id}
✓ POST /capture/retry/{id}
✓ POST /chat
✓ POST /chat/stream
✓ GET /chat/history
✓ GET /chat/{id}
✓ DELETE /chat/{id}
✓ POST /pages/{id}/canvas-chat
✓ POST /pages/{id}/canvas-chat/stream
✓ GET /graph
✓ GET /pages/{id}/graph
✓ POST /edges
✓ DELETE /edges/{id}
✓ GET /notes/{id}/related
✓ GET /search
✓ GET /search/tags
✓ GET /workspace/overview
✓ GET /workspace/stats
✓ POST /workspace/health-check
✓ GET /settings
✓ PUT /settings
✓ GET /settings/models
✓ POST /pages/{id}/ai/diagram
✓ POST /pages/{id}/ai/compose
✓ POST /pages/{id}/ai/compose/stream
✓ POST /pages/{id}/ai/sticky
✓ POST /pages/{id}/ai/background
✓ GET /ai/curator/scan
✓ POST /ai/curator/action
✓ GET /pages/{id}/ai/analyze
✓ GET /health
