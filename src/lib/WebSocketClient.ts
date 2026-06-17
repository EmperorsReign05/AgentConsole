export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WebSocketConfig {
  url: string;
  onEvent: (event: Record<string, unknown>) => void;
  onStatusChange: (status: WebSocketStatus) => void;
  getLastSeq: () => number; // So we know what seq to send on RESUME
}

export class AgentWebSocketClient {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5; // e.g. 500ms, 1s, 2s, 4s, 10s
  private status: WebSocketStatus = 'disconnected';
  private intentionalDisconnect = false;

  constructor(config: WebSocketConfig) {
    this.config = config;
  }

  public connect() {
    this.intentionalDisconnect = false;
    if (this.ws?.readyState === WebSocket.OPEN || this.status === 'connecting' || this.status === 'reconnecting') {
      return;
    }

    this.setStatus(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
    this.ws = new WebSocket(this.config.url);

    this.ws.onopen = this.handleOpen;
    this.ws.onmessage = this.handleMessage;
    this.ws.onclose = this.handleClose;
    this.ws.onerror = this.handleError;
  }

  public disconnect() {
    this.intentionalDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
    this.reconnectAttempts = 0;
  }

  public send(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('Cannot send message, WebSocket is not open.');
    }
  }

  private handleOpen = () => {
    this.setStatus('connected');
    this.reconnectAttempts = 0;
    
    // On reconnect, if we have processed messages before, send RESUME
    const lastSeq = this.config.getLastSeq();
    if (lastSeq > 0) {
      this.send({ type: 'RESUME', last_seq: lastSeq });
    }
  };

  private handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle PING automatically
      if (data.type === 'PING') {
        // Send PONG echoing challenge, but don't crash if challenge is empty
        this.send({ type: 'PONG', echo: data.challenge || '' });
        // Emit the ping/pong so we can show it in timeline, though not strictly required
        // But the store will track it.
      }
      
      this.config.onEvent(data);
    } catch (err) {
      console.error('Failed to parse incoming WebSocket message', err);
    }
  };

  private handleClose = (event: CloseEvent) => {
    this.ws = null;
    if (this.intentionalDisconnect) return;
    
    this.scheduleReconnect();
  };

  private handleError = (event: Event) => {
    // Error will be followed by a close event usually.
    console.error('WebSocket error', event);
  };

  private scheduleReconnect = () => {
    this.setStatus('reconnecting');
    const baseDelay = 500;
    // Exponential backoff: 500, 1000, 2000, 4000, 10000 (cap at 10s)
    let delay = baseDelay * Math.pow(2, this.reconnectAttempts);
    if (delay > 10000) delay = 10000;
    
    this.reconnectAttempts++;
    
    setTimeout(() => {
      this.connect();
    }, delay);
  };

  private setStatus(status: WebSocketStatus) {
    if (this.status !== status) {
      this.status = status;
      this.config.onStatusChange(status);
    }
  }
}
