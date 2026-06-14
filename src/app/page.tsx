"use client";

import { useEffect } from 'react';
import { useAgentStore } from '@/store/useAgentStore';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { TraceTimeline } from '@/components/timeline/TraceTimeline';
import { ContextInspector } from '@/components/context/ContextInspector';
import { Activity, Wifi, WifiOff } from 'lucide-react';

export default function Home() {
  const { initWebSocket, disconnect, wsStatus } = useAgentStore();

  useEffect(() => {
    // Mount: connect to ws
    initWebSocket('ws://localhost:4747/ws');
    return () => {
      disconnect();
    };
  }, [initWebSocket, disconnect]);

  return (
    <div className="flex h-screen w-full bg-zinc-950 overflow-hidden text-sm">
      {/* Left Panel: Context Inspector */}
      <aside className="w-1/4 min-w-[300px] border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
        <header className="h-12 border-b border-zinc-800 flex items-center px-4 font-semibold text-zinc-300 tracking-wide">
          Context Inspector
        </header>
        <div className="flex-1 overflow-auto">
          <ContextInspector />
        </div>
      </aside>

      {/* Middle Panel: Chat Interface */}
      <main className="flex-1 flex flex-col min-w-[400px]">
        <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950">
          <h1 className="font-semibold text-zinc-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            Agent Console
          </h1>
          <div className="flex items-center gap-2 text-xs">
            {wsStatus === 'connected' ? (
              <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md">
                <Wifi className="w-3.5 h-3.5" /> Connected
              </span>
            ) : wsStatus === 'reconnecting' ? (
              <span className="flex items-center gap-1.5 text-amber-400 bg-amber-400/10 px-2 py-1 rounded-md animate-pulse">
                <WifiOff className="w-3.5 h-3.5" /> Reconnecting...
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-zinc-500 bg-zinc-500/10 px-2 py-1 rounded-md">
                <WifiOff className="w-3.5 h-3.5" /> Disconnected
              </span>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-hidden relative">
          {/* Reconnecting overlay (non-blocking) */}
          {wsStatus === 'reconnecting' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-800/90 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-full shadow-lg text-xs flex items-center gap-2 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Connection interrupted. Retrying...
            </div>
          )}
          <ChatPanel />
        </div>
      </main>

      {/* Right Panel: Trace Timeline */}
      <aside className="w-1/4 min-w-[300px] border-l border-zinc-800 bg-zinc-900/50 flex flex-col">
        <header className="h-12 border-b border-zinc-800 flex items-center px-4 font-semibold text-zinc-300 tracking-wide">
          Trace Timeline
        </header>
        <div className="flex-1 overflow-auto">
          <TraceTimeline />
        </div>
      </aside>
    </div>
  );
}
