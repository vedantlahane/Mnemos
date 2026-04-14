# Frontend SSE Integration Guide

This document explains how to use the new Canvas Operations protocol for SSE streaming from the backend.

## Architecture Overview

```
Backend API                         Frontend
┌─────────────────────────┐        ┌──────────────────────────┐
│ /canvas/{page}/stream   │◄──────►│ streamCanvasOps()        │
│ (POST, SSE)             │   SSE  │ (lib/canvasOps.ts)       │
└─────────────────────────┘        └──────────────────────────┘
                                            │
                                            ▼
                                    ┌──────────────────────────┐
                                    │ useCanvasChat hook       │
                                    │ (hooks/useCanvasChat.ts) │
                                    └──────────────────────────┘
                                            │
                                            ▼
                                    ┌──────────────────────────┐
                                    │ CanvasApplier            │
                                    │ (lib/canvasApplier.ts)   │
                                    └──────────────────────────┘
                                            │
                                            ▼
                                    ┌──────────────────────────┐
                                    │ Excalidraw Canvas        │
                                    │ (Imperative API)         │
                                    └──────────────────────────┘
```

## Components

### 1. Stream Parser: `lib/canvasOps.ts`

**Purpose**: Parses SSE events from backend into typed operations.

**Key Types**:
- `OpType`: Union of all operation types (create_text, stream_start, etc.)
- `CanvasOp`: Operation with payload
- `Viewport`: Current canvas view (x, y, width, height, zoom)
- `StreamRequest`: Request sent to backend (message, viewport, history)
- `StreamCallbacks`: Handlers for intent/chat/op/sources/followups/error/done

**Key Function**: `streamCanvasOps(pageId, request, callbacks)` → AbortController
- Initiates SSE stream from `/api/canvas/{pageId}/stream`
- Parses `event:` and `data:` lines
- Dispatches to appropriate callbacks
- Returns AbortController for cancellation

### 2. Operation Applier: `lib/canvasApplier.ts`

**Purpose**: Applies CanvasOp to Excalidraw imperatively.

**Class**: `CanvasApplier(api)`
- Constructor takes Excalidraw API reference
- `apply(op)` routes operations to handlers:
  - **Canvas State**: set_background, set_theme, pan_to, zoom_to
  - **Streaming**: stream_start, stream_chunk, stream_end (live text)
  - **Creation**: create_text, create_diagram
  - **Manipulation**: move_element, delete_element
  - **Navigation**: info (navigate_to_page)
  - **Batch**: operations array for multi-op batches

**Example**:
```typescript
const applier = new CanvasApplier(excalidrawApi);
applier.apply({
  op: "create_text",
  x: 200,
  y: 300,
  text: "Hello World",
  style: "default"
});
```

### 3. Viewport Tracker: `hooks/useViewport.ts`

**Purpose**: Tracks Excalidraw viewport for context.

**Hook**: `useViewport(apiRef)` → `{ getViewport(), onScrollChange() }`
- `getViewport()`: Returns current viewport object
- `onScrollChange(x, y)`: Updates tracked scroll position

**Integration**: Call `onScrollChange` in your change handler to keep viewport current.

### 4. Canvas Chat Hook: `hooks/useCanvasChat.ts`

**Purpose**: Unified chat interface for canvas SSE operations.

**Hook**: `useCanvasChat(pageId, apiRef, getViewport)` → Chat interface
- Returns: `{ messages[], isLoading, currentIntent, sendMessage(), cancel() }`
- `sendMessage(text)` initiates SSE stream with viewport context
- Messages accumulate in array
- Intent shown during processing (compose/diagram/arrange/etc.)
- Operations applied automatically via CanvasApplier

**Example**:
```typescript
const { messages, sendMessage } = useCanvasChat(pageId, apiRef, getViewport);

// User types message
sendMessage("Write about Docker");

// Backend responds:
// 1. onIntent("compose")
// 2. stream_start (placeholder element)
// 3. stream_chunk events (live text)
// 4. stream_end (final element)
// 5. onChat (full content shown in chat)
```

## Integration Patterns

### Pattern 1: Stream operations directly from ExcalidrawCanvas

```typescript
const applier = useRef<CanvasApplier | null>(null);

// Initialize applier when API is ready
useEffect(() => {
  if (excalidrawRef.current) {
    applier.current = new CanvasApplier(excalidrawRef.current);
  }
}, [excalidrawRef.current]);

// Apply operations from backend command
function handleCanvasOp(op: CanvasOp) {
  applier.current?.apply(op);
}
```

### Pattern 2: Use useCanvasChat for full chat experience

```typescript
const { messages, isLoading, sendMessage } =
  useCanvasChat(pageId, excalidrawRef, getViewport);

// In your chat UI
function handleSendMessage(text: string) {
  sendMessage(text);
}

// Render messages
messages.forEach(msg => {
  console.log(`${msg.role}: ${msg.content}`);
  if (msg.sources) console.log("Sources:", msg.sources);
});
```

### Pattern 3: Send viewport with capture

```typescript
const { getViewport } = useViewport(excalidrawRef);

// When capturing a note
api.capture({
  text: "My note",
  viewport: getViewport(),
});
```

## Next Steps

### For Chat Integration
1. Add chat input to FloatingPanel in Stream component when on canvas page
2. Use `useCanvasChat` hook instead of current message handler
3. Buttons to send predefined prompts (e.g., "Organize", "Summarize")

### For Command Integration
1. Hook canvas operations into command system
2. Send commands like `/arrange`, `/diagram` to backend
3. Backend streams back operations

### For Auto-Formatting
1. AI generates initial structure
2. Backend streams text in chunks (stream_start → stream_chunk × n → stream_end)
3. User sees live text appearing on canvas

### For Diagram Generation
1. User says "Draw flowchart of auth"
2. Backend generates topology JSON
3. Frontend creates connected elements with proper layout

## Type Safety Notes

- All CanvasOp operations are typed via OpType union
- Callbacks have specific signatures (onChat, onCanvasOp, etc.)
- Viewport is a strict object shape
- StreamRequest matches backend expectations

## Performance Considerations

- SSE streams are processed line-by-line (not buffered)
- Operations applied directly to Excalidraw (no intermediate state)
- Large operations split via `batch` type
- Auto-resize on text creation to fit content

## Error Handling

```typescript
const callbacks = {
  onError: (message: string) => {
    console.error("Stream error:", message);
    // Show error toast, disable input, etc.
  },
  onDone: () => {
    console.log("Stream complete");
    // Re-enable UI, scroll to result, etc.
  }
};
```

## Testing

### Manual Test Scenario
1. Open canvas page
2. Type: "Write about Docker container networking"
3. Watch:
   - Intent badge shows "Writing…"
   - Placeholder element appears
   - Text streams in word by word
   - Element resizes to fit
   - Chat panel shows full message

### SSE Event Sequence
```
event: intent
data: {"intent":"compose","topic":"Docker","metadata":{}}

event: canvas_op
data: {"op":"stream_start","element_id":"abc123","x":200,"y":300,"style":"compose"}

event: canvas_op
data: {"op":"stream_chunk","text":"Docker is a ","element_id":"abc123"}

event: canvas_op
data: {"op":"stream_chunk","text":"containerization platform...","element_id":"abc123"}

event: chat
data: {"content":"[full text about Docker]"}

event: canvas_op
data: {"op":"stream_end","element_id":"abc123"}

event: follow_ups
data: {"follow_ups":["Tell me more","Draw architecture","Related concepts"]}

event: done
data: {}
```

## API Reference

### streamCanvasOps()
```typescript
streamCanvasOps(
  pageId: string,
  request: StreamRequest,
  callbacks: StreamCallbacks,
  apiBase?: string
) → AbortController
```

### CanvasApplier
```typescript
class CanvasApplier {
  constructor(api: any)
  apply(op: CanvasOp): void
}
```

### useViewport()
```typescript
useViewport(apiRef) → {
  getViewport: () => Viewport,
  onScrollChange: (x: number, y: number) => void,
  lastViewport: MutableRefObject<Viewport>
}
```

### useCanvasChat()
```typescript
useCanvasChat(pageId, excalidrawApiRef, getViewport) → {
  messages: ChatMessage[],
  isLoading: boolean,
  currentIntent: string | null,
  sendMessage: (text: string) => void,
  cancel: () => void,
  clearHistory: () => void
}
```
