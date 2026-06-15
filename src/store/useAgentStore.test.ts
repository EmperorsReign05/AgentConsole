import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from './useAgentStore';

describe('useAgentStore - Sequence Deduplication Buffer', () => {
  beforeEach(() => {
    // Reset the store state before each test
    useAgentStore.setState({
      lastProcessedSeq: 0,
      buffer: new Map(),
      messages: [],
      timeline: [],
      activeContexts: {}
    });
  });

  it('should completely ignore events with seq <= lastProcessedSeq', () => {
    const store = useAgentStore.getState();
    
    // lastProcessedSeq is 0, so sending seq 0 should be ignored (deduplicated)
    store._handleWsEvent({ type: 'TOKEN', seq: 0, text: 'Ignored', stream_id: 'test' });
    
    const newState = useAgentStore.getState();
    expect(newState.lastProcessedSeq).toBe(0);
    expect(newState.buffer.size).toBe(0);
    expect(newState.timeline.length).toBe(0);
  });

  it('should buffer out-of-order events and process them exactly in sequence when the missing packet arrives', () => {
    const store = useAgentStore.getState();
    
    // Simulate chaos mode drops: receive seq 3 and seq 2 BEFORE seq 1
    store._handleWsEvent({ type: 'TOKEN', seq: 3, text: 'C', stream_id: 'msg-1' });
    store._handleWsEvent({ type: 'TOKEN', seq: 2, text: 'B', stream_id: 'msg-1' });
    
    let currentState = useAgentStore.getState();
    // Prove that nothing was processed because seq 1 is missing
    expect(currentState.lastProcessedSeq).toBe(0); 
    // Prove that the events are sitting safely in the O(1) Map buffer
    expect(currentState.buffer.size).toBe(2); 
    expect(currentState.messages.length).toBe(0);
    
    // Finally, the delayed seq 1 arrives
    store._handleWsEvent({ type: 'TOKEN', seq: 1, text: 'A', stream_id: 'msg-1' });
    
    currentState = useAgentStore.getState();
    // Prove that the while-loop perfectly resolved 1, then 2, then 3 sequentially
    expect(currentState.lastProcessedSeq).toBe(3); 
    // Prove that the buffer is entirely drained
    expect(currentState.buffer.size).toBe(0); 
    
    // Prove that the text was concatenated in the perfect mathematical order (A + B + C)
    // even though the packets arrived in C -> B -> A order.
    const msg = currentState.messages[0] as any;
    expect(msg.chunks[0].content).toBe('ABC');
  });

  it('should pause the stream logic when a TOOL_CALL arrives', () => {
    const store = useAgentStore.getState();
    
    store._handleWsEvent({ type: 'TOKEN', seq: 1, text: 'Hello', stream_id: 'msg-2' });
    store._handleWsEvent({ type: 'TOOL_CALL', seq: 2, call_id: 't-1', tool_name: 'test', args: {}, stream_id: 'msg-2' });
    
    const currentState = useAgentStore.getState();
    const msg = currentState.messages[0] as any;
    
    expect(msg.isFrozen).toBe(true);
    expect(msg.chunks.length).toBe(2); // text chunk, then tool chunk
    expect(msg.chunks[1].type).toBe('tool');
  });
});
