# Architecture and Decisions

## Sequence-Based Ordering and Deduplication

**Approach & Data Structure:**
I used a `Map<number, any>` buffer combined with a `lastProcessedSeq` integer inside a global Zustand store. 
When an event arrives, if its `seq` is less than or equal to `lastProcessedSeq`, it is instantly discarded (deduplication). If it's valid, it is stored in the buffer. Then, a loop checks if `buffer.has(lastProcessedSeq + 1)`. If so, it processes the event, increments `lastProcessedSeq`, and repeats until the buffer no longer contains the next sequence.

**Why this approach?**
- **O(1) lookups:** Using a `Map` provides O(1) insertion and O(1) checks for the next sequence.
- **Resilience:** It gracefully handles out-of-order events (they just sit in the map until their turn) and duplicates (discarded upfront).

## Preventing Layout Shift During Tool Calls

**Rendering Strategy:**
Instead of treating a message as a single string `content` and appending tool calls at the end, I restructured the message state into an array of `StreamChunk` objects: `Array<{ type: 'text', content: string } | { type: 'tool', tool: ToolCallData }>`.

**How it prevents flicker & shift:**
When a `TOOL_CALL` event arrives, the stream is marked `isFrozen: true`, and a `tool` chunk is appended to the chunks array. Subsequent `TOKEN` events are buffered or added to a *new* text chunk following the tool card. Because the chunks are rendered linearly as flex/block items inline, the previous text is left completely unmodified (frozen), the tool card mounts exactly below it, and new text resumes flowing naturally below the tool card without rewriting or replacing the original DOM nodes. 

## Reconnection State Recovery

**Tracking Consumption vs. Reception:**
The key to robust state recovery is distinguishing between what the WebSocket *received* and what the UI state machine *processed*. 

- **Reception:** Managed by `WebSocketClient.ts`, which knows nothing about sequence state other than querying the store for `getLastSeq()` upon reconnection.
- **Consumption:** The `lastProcessedSeq` in the Zustand store represents only the events that have been fully successfully integrated into the UI state (`messages`, `timeline`, `activeContexts`). 

When a disconnect happens mid-stream, `lastProcessedSeq` stops incrementing. When the socket reconnects, it queries the store and sends `{ type: 'RESUME', last_seq: lastProcessedSeq }`. The server replays from that point, and because our deduplication logic ignores anything `\<= lastProcessedSeq`, we safely resume injecting chunks into the exact state we left off in, avoiding duplicated text or ghost tool cards.

## Scaling to 50 Concurrent Streams

**Operations Dashboard Scenario:**
If we had 50 concurrent agents streaming 30 tokens/second:
1. **React Rendering Bottleneck:** 1500 state updates per second would thrash React if mapped directly to `setState` or Zustand. I would implement a **RequestAnimationFrame (rAF) flush batching mechanism**. Tokens would accumulate in a mutable buffer and flush to the React state every 16ms (60fps) or 50ms, drastically reducing re-renders.
2. **Virtualization:** The Chat Panel and Timeline would need strict virtualization (e.g., `react-virtuoso` or `@tanstack/react-virtual`) so DOM nodes for off-screen streams are completely unmounted.
3. **Web Worker:** The `seq` ordering, diff engine, and JSON parsing would be offloaded to a Web Worker to prevent main-thread blockage, only posting ready-to-render state patches back to the main thread.

## Scaling to 100x Longer Responses

**Full Document Generation Scenario:**
If agent responses generated thousands of paragraphs (megabytes of text):
1. **DOM Explosion:** Rendering a 100,000-word response in a single flex container would cause severe layout calculation lag.
2. **Solution:** We would need to partition the single message chunk into discrete paragraph nodes or use a virtualized text renderer. Instead of `content: string` accumulating forever, it would push to a new array element whenever a newline `\n\n` is encountered, and we would virtualize those paragraph blocks.
3. **Markdown Parsing:** Parsing a massive markdown document on every token tick is O(N^2) over time. We would need an incremental parsing tree (like Tree-sitter) that only re-parses the most recent delta chunk rather than the entire document string.
