"use client";

import { useAgentStore, ToolCallData, StreamChunk } from '@/store/useAgentStore';
import { useEffect, useRef, useState } from 'react';
import { Wrench, TerminalSquare, Send, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';

function ToolCard({ tool, onAck, isAborted }: { tool: ToolCallData, onAck: () => void, isAborted: boolean }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!tool.result) {
      onAck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.call_id]);

  if (!expanded) {
    return (
      <span 
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 bg-[#1a1a1e] hover:bg-[#202024] border border-zinc-700/50 text-zinc-300 px-2 py-0.5 rounded-md text-xs font-mono cursor-pointer transition-colors align-middle mx-1 shadow-sm"
        title="Click to view tool execution details"
      >
        {tool.result ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        ) : isAborted ? (
          <XCircle className="w-3 h-3 text-red-500" />
        ) : (
          <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
        )}
        {tool.tool_name}
      </span>
    );
  }

  return (
    <div className="block my-2 w-full">
      <div className="border border-zinc-800/80 rounded-md overflow-hidden bg-[#0c0c0e] shadow-sm max-w-2xl text-sm font-sans relative">
        <button 
          onClick={() => setExpanded(false)}
          className="absolute top-2.5 right-3 text-zinc-500 hover:text-zinc-300 z-10"
          title="Collapse"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="px-3 py-2 bg-[#141417] border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TerminalSquare className="w-3.5 h-3.5 text-zinc-400" />
            <span className="font-mono text-xs font-semibold text-zinc-200 tracking-wide">{tool.tool_name}</span>
          </div>
          <div className="mr-6">
            {tool.result ? (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-500 font-medium tracking-wide">
                <CheckCircle2 className="w-3 h-3" />
                COMPLETED
              </span>
            ) : isAborted ? (
              <span className="flex items-center gap-1.5 text-[11px] text-red-500 font-medium tracking-wide">
                <XCircle className="w-3 h-3" />
                STOPPED
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium tracking-wide animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                EXECUTING
              </span>
            )}
          </div>
        </div>
        <div className="p-3 bg-zinc-950 text-zinc-300 font-mono text-xs overflow-x-auto space-y-3">
          <div>
            <div className="text-[10px] uppercase text-zinc-600 mb-1 font-semibold tracking-wider">Args</div>
            <div className="text-zinc-400">{JSON.stringify(tool.args)}</div>
          </div>
          {tool.result !== undefined && tool.result !== null && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              <div className="text-[10px] uppercase text-zinc-600 mb-1 font-semibold tracking-wider">Result</div>
              <div className="text-emerald-400/90">{typeof tool.result === 'object' ? JSON.stringify(tool.result) : String(tool.result)}</div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { messages, sendUserMessage, sendToolAck } = useAgentStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = fd.get('message') as string;
    if (text && text.trim()) {
      const command = text.trim();
      
      if (command === '/drop' || command === '/droptool') {
        useAgentStore.getState().simulateDrop();
      } else if (command === '/error') {
        useAgentStore.setState(state => ({
          timeline: [...state.timeline, {
            id: `err_${Date.now()}`,
            type: 'ERROR',
            data: { message: 'Simulated client-side error via /error command' },
            timestamp: Date.now()
          }]
        }));
      } else {
        sendUserMessage(command);
      }
      
      e.currentTarget.reset();
      const textarea = e.currentTarget.querySelector('textarea');
      if (textarea) textarea.style.height = 'auto';
    }
  };

  return (
    <div className="flex flex-col h-full relative bg-zinc-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            Agent active. Awaiting instructions...
          </div>
        )}
        
        {messages.map((msg, idx) => {
          if (msg.role === 'user') {
            return (
              <motion.div 
                key={msg.id || idx} 
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex justify-end"
              >
                <div className="bg-emerald-600/90 text-emerald-50 px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] whitespace-pre-wrap border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-sm font-medium leading-relaxed">
                  {msg.content}
                </div>
              </motion.div>
            );
          } else {
            const isAborted = !msg.isFinished && idx !== messages.length - 1;

            return (
              <motion.div 
                key={msg.id} 
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex justify-start"
              >
                <div className="bg-[#121214] text-zinc-300 px-4 py-3 rounded-2xl rounded-bl-sm max-w-[85%] border border-zinc-800/80 shadow-sm leading-relaxed min-w-[200px]">
                  {msg.chunks.map((chunk, cIdx) => {
                    if (chunk.type === 'text') {
                      return (
                        <span 
                          key={cIdx} 
                          className={clsx(
                            "text-sm prose-invert max-w-none break-words",
                            cIdx < msg.chunks.length - 1 && msg.chunks[cIdx+1].type === 'tool' ? "[&>p:last-child]:inline" : "",
                            cIdx > 0 && msg.chunks[cIdx-1].type === 'tool' ? "[&>p:first-child]:inline [&>p:first-child]:mt-0" : "",
                            "[&>p]:my-2 [&>p:last-child]:mb-0 [&>p:first-child]:mt-0"
                          )}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: React.HTMLAttributes<HTMLElement> & { node?: unknown, inline?: boolean }) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    // @ts-expect-error - react-syntax-highlighter types are incompatible with its own themes
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    className="rounded-md border border-zinc-800 text-xs my-2"
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={clsx("bg-zinc-800/80 text-emerald-300 px-1.5 py-0.5 rounded text-xs", className)} {...props}>
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            {chunk.content}
                          </ReactMarkdown>
                        </span>
                      );
                    } else if (chunk.type === 'tool') {
                      return (
                        <ToolCard 
                          key={chunk.tool.call_id} 
                          tool={chunk.tool} 
                          onAck={() => sendToolAck(chunk.tool.call_id)} 
                          isAborted={isAborted}
                        />
                      );
                    }
                    return null;
                  })}
                  
                  {msg.isFrozen && !isAborted && (
                    <span className="inline-block w-2 h-4 ml-1 bg-zinc-500 animate-pulse align-middle rounded-sm" />
                  )}
                  {!msg.isFinished && !msg.isFrozen && !isAborted && (
                    <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse align-middle rounded-sm" />
                  )}
                </div>
              </motion.div>
            );
          }
        })}
        <div ref={bottomRef} className="h-4" />
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 pb-6 pt-2 shrink-0 z-10">
        <form onSubmit={handleSubmit} className="flex gap-2 relative shadow-[0_0_40px_rgba(0,0,0,0.8)] rounded-xl w-full">
          <textarea
            name="message"
            rows={1}
            placeholder="Ask anything..."
            className="flex-1 bg-[#18181b] border border-zinc-800/80 rounded-xl px-5 py-3.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 transition-all shadow-sm resize-none overflow-y-auto max-h-[200px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            onInput={(e) => {
               const target = e.target as HTMLTextAreaElement;
               target.style.height = 'auto';
               target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
            }}
          />
          <button type="submit" className="bg-zinc-200 hover:bg-white text-zinc-950 rounded-xl px-5 py-3.5 transition-colors flex items-center justify-center font-medium shadow-sm">
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-3 text-[10px] text-zinc-500 font-medium tracking-wide text-center">
          Enter to send <span className="text-zinc-700 mx-1">&middot;</span> Shift+Enter for newline <span className="text-zinc-700 mx-1">&middot;</span> /drop <span className="text-zinc-700 mx-1">&middot;</span> /droptool <span className="text-zinc-700 mx-1">&middot;</span> /error
        </div>
      </div>
    </div>
  );
}
