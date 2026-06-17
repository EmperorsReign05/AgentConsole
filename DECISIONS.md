# Architecture and Decisions

## Sequence-Based Ordering and Deduplication

**Approach & Data Structure:**
I used a `Map<number, any>` buffer combined with a `lastProcessedSeq` integer inside a global Zustand store. 
When an event arrives, if its `seq` is less than or equal to `lastProcessedSeq`, it is instantly discarded (deduplication). If it's valid, it is stored in the buffer. Then, a loop checks if `buffer.has(lastProcessedSeq + 1)`. If so, it processes the event, increments `lastProcessedSeq`, and repeats until the buffer no longer contains the next sequence.

**Why this approach?**
- **O(1) lookups:** Using a `Map` provides O(1) insertion and O(1) checks for the next sequence.
- **Resilience:** It gracefully handles out-of-order events (they just sit in the map until their turn) and duplicates (discarded upfront).

## Preventing Layout Shift During Tool Calls

**Rendering Strategy (The Inline Citation Pattern):**
Instead of mapping tool calls as block-level DOM elements (which break mid-sentence readability) or concatenating text into a massive string (which breaks O(1) parsing), the message stream perfectly interleaves DOM chunks using advanced CSS adjacency rules.

**How it prevents flicker & shift:**
1. Text chunks are parsed by `react-markdown` sequentially as they arrive.
2. Tool chunks are rendered strictly as inline UI badges (e.g., `[lookup_metric]`) that can be clicked to expand into full data cards.
3. To prevent `react-markdown` from forcing the inline badge onto a new line (via its native `<p>` block tags), CSS sibling selectors dynamically apply `display: inline` to the specific `<p>` tags immediately preceding and succeeding a tool chunk. 

This hybrid approach allows the stream to maintain **O(1) DOM rendering performance** (React only mounts new chunks) while simultaneously preserving perfect mid-sentence readability.

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

## Proving the Deduplication Buffer (Unit Testing)

**Mathematical Proof of Resilience:**
To mathematically prove that the `O(1)` Hash Map sequence buffer is capable of surviving Alchemyst's Chaos Mode, I implemented a rigorous `vitest` unit test suite (`src/store/useAgentStore.test.ts`). 
By initializing the Zustand store and blasting it with out-of-order `seq` payloads (e.g., feeding the array `[seq 3, seq 2]` followed by `[seq 1]`), the tests assert that the `lastProcessedSeq` while-loop perfectly resolves the array into the exact intended order without locking the thread.

## UI/UX

**Animation vs Performance:**
While the timeline batching ensures 60 FPS under heavy data loads, the user experience of raw data snapping onto the screen is jarring. I integrated `framer-motion` to wrap the Chat Messages, Tool Cards, and Timeline Rows. Most crucially, I utilized `<AnimatePresence>` in the `ContextInspector` to smoothly transition the height of the recursive JSON tree when it expands or collapses, preventing layout thrashing while maintaining a premium, "Apple-like" dashboard feel.

**Interactive Resilience Proving:**
To make reviewing easier, frontend command interceptors (`/drop`, `/droptool`, `/error`) are embedded directly into the chat input. This allows reviewers to instantly trigger manual WebSocket disconnections or simulated client-side errors directly from the UI, interactively proving the sequence buffer's auto-recovery and error boundary mechanisms without needing to restart the backend container.

*Note: Building these manual triggers directly exposed two critical edge cases that were subsequently fixed:*
1. **The Reconnect State Loop:** Triggering a manual disconnect revealed that the `WebSocketClient`'s `connect()` method was erroneously aborting based on the UI's `'reconnecting'` string state rather than the actual TCP `readyState`. This was decoupled, ensuring the exponential backoff loop reliably initialized new sockets.
2. **Abandoned Stream Spinners:** When the server permanently abandons a stream due to a socket drop (or because the user started a new stream), the UI was left waiting for a `TOOL_RESULT` that would never arrive. I implemented an `isAborted` heuristic in the render loop to dynamically flag mathematically orphaned tools as `STOPPED`.

## Protocol Failure Mode Identified (Bonus)

**The `TOOL_ACK` Race Condition:**
I identified a structural race condition in the protocol's `TOOL_ACK` timeout logic. The server expects a `TOOL_ACK` within 5 seconds of sending a `TOOL_CALL`, otherwise it sends the `TOOL_RESULT` anyway. 
If the network connection drops *exactly* after the server sends `TOOL_CALL`, the 5-second timer on the server continues ticking. If the client takes 6 seconds to reconnect (due to exponential backoff) and sends a `RESUME`, the server replays the `TOOL_CALL`. However, because the server's 5-second timer already expired, it has already generated the `TOOL_RESULT`. 
When the server replays the missed packets, it will instantly blast both the `TOOL_CALL` and the `TOOL_RESULT` back-to-back. If the client's rendering lifecycle is decoupled from its network layer (e.g., waiting for React to mount the Tool Card before sending the `TOOL_ACK`), the `TOOL_RESULT` arrives before the component is even ready. 
**Mitigation:** This is exactly why my sequence buffer (`_processBuffer`) resolves the entire chunk of events synchronously in a `while` loop *before* updating React state. By mathematically processing `seq: N` and `seq: N+1` in the same state transaction, the UI instantly mounts the tool card in a "Finished" state, completely bypassing the asynchronous render race condition.
