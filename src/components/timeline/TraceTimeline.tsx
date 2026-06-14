"use client";

import { useAgentStore, TimelineEvent } from '@/store/useAgentStore';
import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Activity, Clock, Server, ArrowRight, Zap, Database } from 'lucide-react';
import clsx from 'clsx';

type GroupedEvent = 
  | { type: 'single'; event: TimelineEvent }
  | { type: 'token_batch'; stream_id: string; events: TimelineEvent[]; count: number; duration: number; text: string; seqStart: number; seqEnd: number };

function EventRow({ item, onScrollTo }: { item: GroupedEvent, onScrollTo: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  if (item.type === 'token_batch') {
    return (
      <div className="border-b border-zinc-800/50 py-2 px-3 hover:bg-zinc-800/20 transition-colors">
        <div 
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <button className="text-zinc-500 group-hover:text-zinc-300">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <span className="text-xs font-semibold text-zinc-400">TOKENS</span>
            <span className="text-xs text-zinc-500">
              {item.count} tokens ({item.duration}ms)
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">
            seq {item.seqStart}-{item.seqEnd}
          </span>
        </div>
        {expanded && (
          <div className="ml-6 mt-2 p-2 bg-zinc-900/50 rounded border border-zinc-800/50 text-xs font-mono text-zinc-400 max-h-32 overflow-y-auto">
            {item.text}
          </div>
        )}
      </div>
    );
  }

  const { event } = item;
  let Icon = Activity;
  let colorClass = 'text-zinc-400';
  let title = event.type;
  let summary = '';

  switch (event.type) {
    case 'PING':
    case 'PONG':
      Icon = Clock;
      colorClass = 'text-zinc-500';
      summary = event.data.challenge || event.data.echo || '';
      break;
    case 'TOOL_CALL':
      Icon = Zap;
      colorClass = 'text-amber-400';
      summary = `${event.data.tool_name}(...)`;
      break;
    case 'TOOL_RESULT':
      Icon = Zap;
      colorClass = 'text-emerald-400';
      summary = `result for ${event.data.call_id}`;
      break;
    case 'CONTEXT_SNAPSHOT':
      Icon = Database;
      colorClass = 'text-purple-400';
      summary = `ctx: ${event.data.context_id}`;
      break;
    case 'STREAM_END':
    case 'USER_MESSAGE':
    case 'CLIENT_TOOL_ACK':
    case 'ERROR':
      Icon = Server;
      colorClass = event.type === 'ERROR' ? 'text-red-400' : 'text-blue-400';
      break;
  }

  const handleRowClick = () => {
    if (event.type === 'TOOL_CALL' || event.type === 'TOOL_RESULT') {
      onScrollTo(`tool-${event.data.call_id}`);
    }
    setExpanded(!expanded);
  };

  return (
    <div className="border-b border-zinc-800/50 py-2 px-3 hover:bg-zinc-800/20 transition-colors" id={`timeline-${event.type === 'TOOL_CALL' ? event.data.call_id : event.id}`}>
      <div 
        className="flex items-center justify-between cursor-pointer group"
        onClick={handleRowClick}
      >
        <div className="flex items-center gap-2">
          <Icon className={clsx("w-4 h-4", colorClass)} />
          <span className={clsx("text-xs font-semibold", colorClass)}>{title}</span>
          <span className="text-xs text-zinc-500 truncate max-w-[120px]">{summary}</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">
          {event.seq !== undefined ? `seq ${event.seq}` : ''}
        </span>
      </div>
      {expanded && (
        <div className="mt-2 p-2 bg-zinc-900/50 rounded border border-zinc-800/50 text-xs font-mono text-zinc-400 overflow-x-auto">
          <pre>{JSON.stringify(event.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export function TraceTimeline() {
  const timeline = useAgentStore((state) => state.timeline);
  const [filter, setFilter] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Group consecutive TOKENS
  const groupedEvents = useMemo(() => {
    const groups: GroupedEvent[] = [];
    let currentBatch: TimelineEvent[] = [];

    const pushBatch = () => {
      if (currentBatch.length > 0) {
        if (currentBatch.length === 1) {
          groups.push({ type: 'single', event: currentBatch[0] });
        } else {
          const first = currentBatch[0];
          const last = currentBatch[currentBatch.length - 1];
          groups.push({
            type: 'token_batch',
            stream_id: first.data.stream_id,
            events: currentBatch,
            count: currentBatch.length,
            duration: last.timestamp - first.timestamp,
            text: currentBatch.map(e => e.data.text).join(''),
            seqStart: first.seq!,
            seqEnd: last.seq!,
          });
        }
        currentBatch = [];
      }
    };

    for (const ev of timeline) {
      // Apply basic filter
      if (filter && !ev.type.toLowerCase().includes(filter.toLowerCase()) && !JSON.stringify(ev.data).toLowerCase().includes(filter.toLowerCase())) {
        continue;
      }

      if (ev.type === 'TOKEN' && !filter) {
        // If we are filtering, we probably shouldn't batch because we might miss things, or we batch anyway. Let's batch only if no filter to keep it simple, or batch tokens if they match. 
        // Tokens don't usually match filters unless the text does.
        currentBatch.push(ev);
      } else {
        pushBatch();
        groups.push({ type: 'single', event: ev });
      }
    }
    pushBatch();
    return groups;
  }, [timeline, filter]);

  useEffect(() => {
    if (endRef.current && !filter) {
      endRef.current.scrollIntoView();
    }
  }, [groupedEvents, filter]);

  const scrollToChatElement = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-emerald-500', 'transition-all');
      setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-500'), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950/50">
      <div className="p-2 border-b border-zinc-800">
        <input
          type="text"
          placeholder="Filter events..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {groupedEvents.map((group, i) => (
          <EventRow 
            key={group.type === 'single' ? group.event.id + i : `batch-${group.seqStart}`} 
            item={group} 
            onScrollTo={scrollToChatElement}
          />
        ))}
        <div ref={endRef} className="h-1" />
      </div>
    </div>
  );
}
