"use client";

import { useAgentStore, ContextSnapshot } from '@/store/useAgentStore';
import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Database } from 'lucide-react';
import clsx from 'clsx';

function isObject(val: any) {
  return val !== null && typeof val === 'object';
}

function JsonNode({ 
  name, 
  current, 
  previous, 
  initiallyExpanded = false 
}: { 
  name: string; 
  current: any; 
  previous: any; 
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
    if (current) Object.keys(current).forEach(key => k.add(key));
    if (previous) Object.keys(previous).forEach(key => k.add(key));
    return Array.from(k).sort();
  }, [current, previous, isParent]);

  // For very large payloads, collapsed by default helps prevent DOM explosion.
  
  if (!isParent) {
    return (
      <div className={clsx("flex font-mono text-[11px] py-0.5 px-1 rounded", bgColor)}>
        <span className="text-zinc-500 mr-2">{name}:</span>
        <span className={textColor}>
          {status === 'removed' ? JSON.stringify(previous) : JSON.stringify(current)}
        </span>
        {status === 'changed' && (
          <span className="text-zinc-500 ml-2 text-[10px]">
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
        className="flex items-center cursor-pointer hover:bg-zinc-800/30 py-0.5 px-1 rounded"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-zinc-500 mr-1 w-3">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="text-zinc-400">{name}</span>
        <span className="text-zinc-600 ml-2">
          {isArray ? `[${keys.length}]` : `{${keys.length}}`}
        </span>
      </div>
      
      {expanded && (
        <div className="ml-4 border-l border-zinc-800/50 pl-2 mt-0.5">
          {/* Virtualization would be ideal here, but lazy rendering (only rendering when expanded) handles the 500KB requirement sufficiently as long as the user doesn't expand massive arrays all at once. */}
          {keys.length > 500 && !expanded ? (
             <div className="text-zinc-600 italic py-1 text-[10px]">Too many items to render.</div>
          ) : (
            keys.map(key => (
              <JsonNode 
                key={key} 
                name={key} 
                current={current ? current[key] : undefined} 
                previous={previous ? previous[key] : undefined} 
                initiallyExpanded={false}
              />
            ))
          )}
        </div>
      )}
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-300">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold truncate max-w-[150px]">{activeId}</span>
          </div>
          <div className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
            Version {effectiveIndex + 1} of {history.length}
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
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
              <span>Oldest</span>
              <span>Latest</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Diff View */}
      <div className="flex-1 overflow-auto p-4">
        <JsonNode 
          name="root" 
          current={currentSnapshot.data} 
          previous={previousSnapshot?.data} 
          initiallyExpanded={true} 
        />
      </div>
    </div>
  );
}
