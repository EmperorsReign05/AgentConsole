"use client";

import { useAgentStore, ToolCallData, StreamChunk } from '@/store/useAgentStore';
import { useEffect, useRef } from 'react';
import { Wrench, TerminalSquare, Send, CheckCircle2, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';

function ToolCard({ tool, onAck }: { tool: ToolCallData, onAck: () => void }) {
  useEffect(() => {
    if (!tool.result) {
      onAck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.call_id]);

  return (
    <div className="my-2 border border-zinc-700/50 rounded-lg overflow-hidden bg-zinc-900/80 shadow-sm max-w-2xl text-sm">
      <div className="px-3 py-2 bg-zinc-800/60 border-b border-zinc-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-4 h-4 text-emerald-500" />
          <span className="font-mono text-xs font-semibold text-zinc-200">
            {tool.tool_name}
          </span>
        </div>
        <div>
          {tool.result ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Finished
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <Loader2 className="w-4 h-4 animate-spin" /> Executing
            </span>
          )}
        </div>
      </div>
      <div className="px-3 py-2 text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap bg-zinc-900/50">
        <span className="text-zinc-500 select-none">args: </span>
        <span className="text-zinc-300">{JSON.stringify(tool.args)}</span>
      </div>
      {tool.result && (
        <div className="px-3 py-2 border-t border-zinc-700/50 text-xs font-mono overflow-x-auto whitespace-pre-wrap bg-zinc-950/50">
          <span className="text-zinc-500 select-none">result: </span>
          <span className="text-emerald-200/80">{JSON.stringify(tool.result)}</span>
        </div>
      )}
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
      sendUserMessage(text.trim());
      e.currentTarget.reset();
    }
  };

  return (
    <div className="flex flex-col h-full relative bg-zinc-950">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-zinc-600 italic">
            Connection active. Waiting for messages...
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
                <div className="bg-emerald-600 text-emerald-50 px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] whitespace-pre-wrap shadow-sm text-sm">
                  {msg.content}
                </div>
              </motion.div>
            );
          } else {
            return (
              <motion.div 
                key={msg.id} 
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex justify-start"
              >
                <div className="bg-zinc-900 text-zinc-200 px-4 py-3 rounded-2xl rounded-bl-sm max-w-[85%] border border-zinc-800 shadow-sm leading-relaxed min-w-[200px]">
                  {msg.chunks.map((chunk, cIdx) => {
                    if (chunk.type === 'text') {
                      return (
                        <div key={cIdx} className="text-sm prose-invert max-w-none break-words my-1">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    style={vscDarkPlus as any}
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
                        </div>
                      );
                    } else if (chunk.type === 'tool') {
                      return (
                        <motion.div
                          key={chunk.tool.call_id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                        >
                          <ToolCard 
                            tool={chunk.tool} 
                            onAck={() => sendToolAck(chunk.tool.call_id)} 
                          />
                        </motion.div>
                      );
                    }
                    return null;
                  })}
                  
                  {msg.isFrozen && (
                    <span className="inline-block w-2 h-4 ml-1 bg-zinc-500 animate-pulse align-middle rounded-sm" />
                  )}
                  {!msg.isFinished && !msg.isFrozen && (
                    <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse align-middle rounded-sm" />
                  )}
                </div>
              </motion.div>
            );
          }
        })}
        <div ref={bottomRef} className="h-4" />
      </div>

      <div className="p-4 bg-zinc-950 border-t border-zinc-800/80">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto">
          <input
            name="message"
            type="text"
            placeholder="Type your message..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm"
            autoComplete="off"
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl transition-all shadow-sm flex items-center justify-center w-12 h-12"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
