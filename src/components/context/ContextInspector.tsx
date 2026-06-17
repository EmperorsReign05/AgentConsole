"use client";

import { useAgentStore, ContextSnapshot } from '@/store/useAgentStore';
import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Database } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function JsonNode({ 
  name, 
  current, 
  previous, 
  initiallyExpanded = false 
}: { 
  name: string; 
  current: unknown; 
  previous: unknown; 
  initiallyExpanded?: boolean 
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const status = useMemo(() => {
    if (current === undefined && previous !== undefined) return 'removed';
    if (current !== undefined && previous === undefined) return 'added';
    if (!isObject(current) && !isObject(previous) && current !== previous) return 'changed';
    return 'unchanged';
  }, [current, previous]);

  const isParent = isObject(current) || isObject(previous);

  let bgColor = 'bg-transparent';
  let textColor = 'text-zinc-400';
  
  if (status === 'added') {
    bgColor = 'bg-emerald-500/10';
    textColor = 'text-emerald-400';
  } else if (status === 'removed') {
    bgColor = 'bg-red-500/10';
    textColor = 'text-red-400 line-through';
  } else if (status === 'changed') {
    bgColor = 'bg-amber-500/10';
    textColor = 'text-amber-400';
  }

  // If it's an object, we need to gather all keys from current and previous
  const keys = useMemo(() => {
    if (!isParent) return [];
    const k = new Set<string>();
    if (current && typeof current === 'object') Object.keys(current).forEach(key => k.add(key));
    if (previous && typeof previous === 'object') Object.keys(previous).forEach(key => k.add(key));
    return Array.from(k).sort();
  }, [current, previous, isParent]);

  // For very large payloads, collapsed by default helps prevent DOM explosion.
  
  if (!isParent) {
    return (
      <div className={clsx("flex font-mono text-[11px] py-0.5 px-1 rounded items-start", bgColor)}>
        <span className="text-zinc-500 mr-2 shrink-0">{name}:</span>
        <span className={clsx("break-all whitespace-pre-wrap", textColor)}>
          {status === 'removed' ? JSON.stringify(previous) : JSON.stringify(current)}
        </span>
        {status === 'changed' && (
          <span className="text-zinc-500 ml-2 text-[10px] break-all whitespace-pre-wrap">
            (was: {JSON.stringify(previous)})
          </span>
        )}
      </div>
    );
  }

  const isArray = Array.isArray(current) || Array.isArray(previous);

  return (
    <div className={clsx("font-mono text-[11px] rounded", bgColor)}>
      <div 
        className={clsx(
          "flex items-start gap-1 py-0.5 font-mono text-[11px] cursor-pointer hover:bg-zinc-800/40 rounded px-1 -ml-1 transition-colors",
          status === 'added' ? 'bg-emerald-950/30 text-emerald-400' :
          status === 'removed' ? 'bg-red-950/30 text-red-400 line-through opacity-60' :
          status === 'changed' ? 'bg-amber-950/30 text-amber-400' : 'text-zinc-300'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-zinc-500 w-3 flex-shrink-0 mt-0.5">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="text-zinc-400">{name}</span>
        <span className="text-zinc-600 ml-2">
          {isArray ? `[${keys.length}]` : `{${keys.length}}`}
        </span>
      </div>
      <AnimatePresence>
      {expanded && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="ml-4 border-l border-zinc-800/50 pl-2 mt-0.5 overflow-hidden"
        >
          {/* Virtualization would be ideal here, but lazy rendering (only rendering when expanded) handles the 500KB requirement sufficiently as long as the user doesn't expand massive arrays all at once. */}
          {keys.length > 500 && !expanded ? (
             <div className="text-zinc-600 italic py-1 text-[10px]">Too many items to render.</div>
          ) : (
            keys.map(key => (
              <JsonNode 
                key={key} 
                name={key} 
                current={current ? (current as Record<string, unknown>)[key] : undefined} 
                previous={previous ? (previous as Record<string, unknown>)[key] : undefined} 
                initiallyExpanded={false}
              />
            ))
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

export function ContextInspector() {
  const activeContexts = useAgentStore(state => state.activeContexts);
  
  // We'll just display the first active context for now, or allow selecting one.
  const contextIds = Object.keys(activeContexts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Default to the most recently updated context
  const activeId = selectedId || (contextIds.length > 0 ? contextIds[contextIds.length - 1] : null);
  
  const history = activeId ? activeContexts[activeId] : [];
  
  const [scrubberIndex, setScrubberIndex] = useState<number>(-1);
  
  // If scrubberIndex is -1, it means 'latest'
  const effectiveIndex = scrubberIndex === -1 ? history.length - 1 : scrubberIndex;
  const currentSnapshot = history[effectiveIndex];
  const previousSnapshot = effectiveIndex > 0 ? history[effectiveIndex - 1] : undefined;

  // Sync scrubber if history grows
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setScrubberIndex(val);
  };

  if (!activeId || !currentSnapshot) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 italic text-xs p-4 text-center">
        No context snapshots received yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950/30">
      {/* Header & Scrubber */}
      <div className="p-4 border-b border-zinc-800/50 space-y-4">
        
        {/* Context Selector Tabs */}
        {contextIds.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {contextIds.map(id => (
              <button
                key={id}
                onClick={() => { setSelectedId(id); setScrubberIndex(-1); }}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-[10px] font-mono whitespace-nowrap transition-colors",
                  activeId === id ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800"
                )}
              >
                {id}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-300">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold truncate max-w-[150px]">{activeId}</span>
          </div>
          <div className="text-[10px] border border-zinc-700/50 bg-[#141417] text-zinc-400 px-1.5 py-0.5 rounded-sm font-mono shadow-sm">
            v{effectiveIndex + 1}/{history.length}
          </div>
        </div>
        
        {history.length > 1 && (
          <div className="space-y-1">
            <input 
              type="range" 
              min={0} 
              max={history.length - 1} 
              value={effectiveIndex}
              onChange={handleScrubberChange}
              className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
              <span>Oldest</span>
              <span>Latest</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Diff View */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded-md p-3 shadow-sm">
          <JsonNode 
            name="root" 
            current={currentSnapshot.data} 
            previous={previousSnapshot?.data} 
            initiallyExpanded={true} 
          />
        </div>
      </div>
    </div>
  );
}
