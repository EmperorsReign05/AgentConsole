"use client";

import { useAgentStore, TimelineEvent } from '@/store/useAgentStore';
import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Activity, Clock, Server, ArrowRight, Zap, Database } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

type GroupedEvent = 
  | { type: 'single'; event: TimelineEvent }
  | { type: 'token_batch'; stream_id: string; events: TimelineEvent[]; count: number; duration: number; text: string; seqStart: number; seqEnd: number };

function EventRow({ item, onScrollTo }: { item: GroupedEvent, onScrollTo: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  if (item.type === 'token_batch') {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="border-b border-zinc-800/50 py-2 px-3 hover:bg-zinc-800/20 transition-colors"
      >
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
      </motion.div>
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
      colorClass = 'text-zinc-600';
      summary = (event.data.challenge as string) || (event.data.echo as string) || '';
      break;
    case 'TOOL_CALL':
      Icon = Zap;
      colorClass = 'text-amber-500';
      summary = `${event.data.tool_name}(...)`;
      break;
    case 'TOOL_RESULT':
      Icon = Zap;
      colorClass = 'text-zinc-300';
      summary = `result for ${event.data.call_id}`;
      break;
    case 'CONTEXT_SNAPSHOT':
      Icon = Database;
      colorClass = 'text-indigo-400';
      summary = `ctx: ${event.data.context_id}`;
      break;
    case 'STREAM_END':
    case 'USER_MESSAGE':
    case 'CLIENT_TOOL_ACK':
    case 'ERROR':
      Icon = Server;
      colorClass = event.type === 'ERROR' ? 'text-red-500' : 'text-zinc-400';
      break;
  }

  const handleRowClick = () => {
    if (event.type === 'TOOL_CALL' || event.type === 'TOOL_RESULT') {
      onScrollTo(`tool-${event.data.call_id}`);
    }
    setExpanded(!expanded);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative pl-6 py-2.5 hover:bg-zinc-800/40 transition-colors group" 
      id={`timeline-${event.type === 'TOOL_CALL' ? event.data.call_id : event.id}`}
    >
      {/* Vertical Tracking Line */}
      <div className="absolute left-3 top-0 bottom-0 w-[1px] bg-zinc-800/80 group-last:bg-gradient-to-b group-last:from-zinc-800/80 group-last:to-transparent" />
      {/* Node Dot */}
      <div className="absolute left-[5px] top-[9px] bg-[#09090b] p-0.5 rounded-full border border-zinc-800 shadow-sm z-10 flex items-center justify-center">
         <Icon className={clsx("w-3 h-3", colorClass)} />
      </div>

      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={handleRowClick}
      >
        <div className="flex items-center gap-2">
          <span className={clsx("text-[11px] font-semibold tracking-wide", colorClass)}>{title}</span>
          <span className="text-xs text-zinc-500 truncate max-w-[150px]">{summary}</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">
          {event.seq !== undefined ? `seq ${event.seq}` : ''}
        </span>
      </div>
      {expanded && (
        <div className="mt-2.5 p-2.5 bg-[#101012] rounded-md border border-zinc-800/80 text-[11px] font-mono text-zinc-400 overflow-x-auto shadow-sm">
          <pre>{JSON.stringify(event.data, null, 2)}</pre>
        </div>
      )}
    </motion.div>
  );
}

const FILTERABLE_TYPES = ['PING', 'USER_MESSAGE', 'TOOL_CALL', 'TOOL_RESULT', 'CONTEXT_SNAPSHOT'];

export function TraceTimeline() {
  const timeline = useAgentStore((state) => state.timeline);
  const [filter, setFilter] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(['PING']));
  const endRef = useRef<HTMLDivElement>(null);

  const toggleType = (type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Group consecutive TOKENS
  const groupedEvents = useMemo(() => {
    const visibleTimeline = timeline.filter(event => {
      if (hiddenTypes.has(event.type)) return false;
      if (event.type === 'PONG' && hiddenTypes.has('PING')) return false; // Hide PONGs with PINGs
      return true;
    });

    const filtered = filter 
      ? visibleTimeline.filter(ev => ev.type.toLowerCase().includes(filter.toLowerCase()) || JSON.stringify(ev.data).toLowerCase().includes(filter.toLowerCase()))
      : visibleTimeline;

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
            stream_id: first.data.stream_id as string,
            events: currentBatch,
            count: currentBatch.length,
            duration: last.timestamp - first.timestamp,
            text: currentBatch.map(e => e.data.text as string).join(''),
            seqStart: first.seq!,
            seqEnd: last.seq!,
          });
        }
        currentBatch = [];
      }
    };

    for (const ev of filtered) {
      if (ev.type === 'TOKEN' && !filter) {
        currentBatch.push(ev);
      } else {
        pushBatch();
        groups.push({ type: 'single', event: ev });
      }
    }
    pushBatch();
    return groups;
  }, [timeline, filter, hiddenTypes]);

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
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-3 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-20 space-y-3">
        <input
          type="text"
          placeholder="Filter events..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-[#121214] border border-zinc-800 rounded-md px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors shadow-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERABLE_TYPES.map(type => {
            const isHidden = hiddenTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={clsx(
                  "text-[10px] font-mono px-2 py-0.5 rounded border transition-colors",
                  isHidden 
                    ? "bg-transparent border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400" 
                    : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                )}
              >
                {type}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {groupedEvents.map((group, i) => (
          <EventRow 
            key={group.type === 'single' ? group.event.id + '-' + i : `batch-${group.seqStart}-${i}`} 
            item={group} 
            onScrollTo={scrollToChatElement}
          />
        ))}
        <div ref={endRef} className="h-1" />
      </div>
    </div>
  );
}
