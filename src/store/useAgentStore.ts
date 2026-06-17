import { create } from 'zustand';
import { AgentWebSocketClient, WebSocketStatus } from '@/lib/WebSocketClient';

// --- Types ---
export type ToolCallData = {
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  result?: unknown;
};

export type StreamChunk = 
  | { type: 'text'; content: string; seqStart?: number; seqEnd?: number }
  | { type: 'tool'; tool: ToolCallData };

export type StreamMessage = {
  id: string; // stream_id
  role: 'agent';
  chunks: StreamChunk[];
  isFinished: boolean;
  isFrozen: boolean; // true if a tool call is active and stream is paused
};

export type UserMessage = {
  id: string; // custom id like 'user_xxx'
  role: 'user';
  content: string;
};

export type ChatMessage = UserMessage | StreamMessage;

export type ContextSnapshot = {
  context_id: string;
  data: Record<string, unknown>;
  seq: number;
};

export type TimelineEvent = {
  id: string; 
  type: string;
  seq?: number;
  data: Record<string, unknown>;
  timestamp: number;
};

// --- Store State ---
interface AgentState {
  wsStatus: WebSocketStatus;
  wsClient: AgentWebSocketClient | null;
  lastProcessedSeq: number;
  buffer: Map<number, Record<string, unknown> & { seq: number; type: string; stream_id?: string; call_id?: string }>; 
  messages: ChatMessage[];
  timeline: TimelineEvent[];
  activeContexts: Record<string, ContextSnapshot[]>; 
  initWebSocket: (url: string) => void;
  disconnect: () => void;
  simulateDrop: () => void;
  sendUserMessage: (content: string) => void;
  sendToolAck: (call_id: string) => void;
  _handleWsEvent: (event: Record<string, unknown>) => void;
  _processBuffer: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  wsStatus: 'disconnected',
  wsClient: null,
  lastProcessedSeq: 0,
  buffer: new Map(),
  messages: [],
  timeline: [],
  activeContexts: {},

  initWebSocket: (url: string) => {
    const { wsClient, _handleWsEvent } = get();
    if (wsClient) {
      wsClient.disconnect();
    }
    const newClient = new AgentWebSocketClient({
      url,
      onEvent: _handleWsEvent,
      onStatusChange: (status) => set({ wsStatus: status }),
      getLastSeq: () => get().lastProcessedSeq,
    });
    set({ wsClient: newClient });
    newClient.connect();
  },

  disconnect: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.disconnect();
    }
  },

  simulateDrop: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.simulateDrop();
    }
  },

  sendUserMessage: (content: string) => {
    const { wsClient, messages, timeline } = get();
    const msgId = 'user_' + Date.now();
    set({
      messages: [...messages, { id: msgId, role: 'user', content }],
      timeline: [...timeline, {
        id: msgId,
        type: 'USER_MESSAGE',
        data: { content },
        timestamp: Date.now(),
      }],
      lastProcessedSeq: 0,
      buffer: new Map()
    });
    wsClient?.send({ type: 'USER_MESSAGE', content });
  },

  sendToolAck: (call_id: string) => {
    const { wsClient, timeline } = get();
    wsClient?.send({ type: 'TOOL_ACK', call_id });
    set({
      timeline: [...timeline, {
        id: 'ack_' + call_id,
        type: 'CLIENT_TOOL_ACK',
        data: { call_id },
        timestamp: Date.now(),
      }]
    });
  },

  _handleWsEvent: (event: Record<string, unknown>) => {
    const { lastProcessedSeq, buffer, _processBuffer } = get();
    
    if (typeof event.seq !== 'number') return; 
    
    // Ignore duplicates or old events instantly
    if (event.seq <= lastProcessedSeq) return;

    const newBuffer = new Map(buffer);
    newBuffer.set(event.seq, event as Record<string, unknown> & { seq: number; type: string; stream_id?: string; call_id?: string });
    set({ buffer: newBuffer });
    
    _processBuffer();
  },

  _processBuffer: () => {
    const state = get();
    let { lastProcessedSeq, buffer, messages, timeline, activeContexts } = state;
    let seqToProcess = lastProcessedSeq + 1;
    let didProcess = false;
    
    while (buffer.has(seqToProcess)) {
      const event = buffer.get(seqToProcess)!;
      buffer.delete(seqToProcess); 
      
      timeline = [...timeline, {
        id: event.seq.toString(),
        type: event.type,
        seq: event.seq,
        data: event,
        timestamp: Date.now(),
      }];

      if (event.type === 'TOKEN') {
        const streamId = event.stream_id!;
        const text = event.text as string;
        const msgIndex = messages.findIndex(m => m.id === streamId);
        
        if (msgIndex >= 0) {
          const msg = messages[msgIndex] as StreamMessage;
          if (!msg.isFrozen) {
            const chunks = [...msg.chunks];
            const lastChunk = chunks[chunks.length - 1];
            if (lastChunk && lastChunk.type === 'text') {
              chunks[chunks.length - 1] = { ...lastChunk, content: lastChunk.content + text, seqEnd: event.seq };
            } else {
              chunks.push({ type: 'text', content: text, seqStart: event.seq, seqEnd: event.seq });
            }
            const updatedMsg = { ...msg, chunks };
            messages = [...messages.slice(0, msgIndex), updatedMsg, ...messages.slice(msgIndex + 1)];
          }
        } else {
          messages = [...messages, {
            id: streamId,
            role: 'agent',
            chunks: [{ type: 'text', content: text, seqStart: event.seq, seqEnd: event.seq }],
            isFinished: false,
            isFrozen: false,
          }];
        }
      } 
      else if (event.type === 'TOOL_CALL') {
        const streamId = event.stream_id!;
        const msgIndex = messages.findIndex(m => m.id === streamId);
        if (msgIndex >= 0) {
          const msg = messages[msgIndex] as StreamMessage;
          const chunks = [...msg.chunks, { 
            type: 'tool' as const, 
            tool: { call_id: event.call_id as string, tool_name: event.tool_name as string, args: event.args as Record<string, unknown> } 
          }];
          const updatedMsg = { ...msg, isFrozen: true, chunks };
          messages = [...messages.slice(0, msgIndex), updatedMsg, ...messages.slice(msgIndex + 1)];
        }
      }
      else if (event.type === 'TOOL_RESULT') {
        const streamId = event.stream_id!;
        const msgIndex = messages.findIndex(m => m.id === streamId);
        if (msgIndex >= 0) {
          const msg = messages[msgIndex] as StreamMessage;
          const chunks = msg.chunks.map(chunk => {
            if (chunk.type === 'tool' && chunk.tool.call_id === event.call_id) {
              return { ...chunk, tool: { ...chunk.tool, result: event.result } };
            }
            return chunk;
          });
          const updatedMsg = { ...msg, isFrozen: false, chunks };
          messages = [...messages.slice(0, msgIndex), updatedMsg, ...messages.slice(msgIndex + 1)];
        }
      }
      else if (event.type === 'CONTEXT_SNAPSHOT') {
        const cid = event.context_id as string;
        const history = activeContexts[cid] || [];
        activeContexts = {
          ...activeContexts,
          [cid]: [...history, { context_id: cid, data: event.data as Record<string, unknown>, seq: event.seq }]
        };
      }
      else if (event.type === 'STREAM_END') {
        const streamId = event.stream_id!;
        const msgIndex = messages.findIndex(m => m.id === streamId);
        if (msgIndex >= 0) {
          const msg = messages[msgIndex] as StreamMessage;
          messages = [...messages.slice(0, msgIndex), { ...msg, isFinished: true }, ...messages.slice(msgIndex + 1)];
        }
      }
      
      lastProcessedSeq = seqToProcess;
      seqToProcess++;
      didProcess = true;
    }
    
    if (didProcess) {
      set({ lastProcessedSeq, buffer, messages, timeline, activeContexts });
    }
  }
}));
