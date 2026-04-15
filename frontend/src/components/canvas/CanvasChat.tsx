import { useState, useRef, useEffect, useCallback } from 'react';
import { canvasChat, type CanvasOp } from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';

interface Props {
  pageId: string;
}

export function CanvasChat({ pageId }: Props) {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState('');
  const { openCanvasPage } = useCanvasStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSend = () => {
    if (!input.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');
    setMessages(prev => [...prev, { role: 'assistant', content: '...' }]);

    // Disconnect old connection if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    try {
      abortControllerRef.current = canvasChat(pageId, {
        onMessage: (msg) => {
          setMessages(prev => {
            const arr = [...prev];
            const last = arr[arr.length - 1];
            if (last && last.role === 'assistant') {
               // Assuming the message replaces or appends - simple append here
               if (last.content === '...') last.content = '';
               last.content += msg + '\n';
            }
            return arr;
          });
        },
        onOp: (op: CanvasOp) => {
           console.log('Received canvas op', op);
        },
        onError: (err) => console.error(err),
        onClose: () => {
           openCanvasPage(pageId); // Reload scene on complete to ensure final state
        }
      });
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <div className="absolute right-4 bottom-4 bg-black/80 border border-white/20 rounded-lg text-sm text-white z-50 w-80 h-96 flex flex-col pointer-events-auto">
      <div className="p-3 border-b border-white/20 font-semibold bg-white/5 rounded-t-lg">Canvas Chat</div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-blue-300' : 'text-gray-300'}>
            <strong>{m.role}: </strong>
            <span className="whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-white/20 flex gap-2">
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          className="flex-1 bg-white/10 px-2 py-1 rounded border border-white/20 text-white"
          placeholder="Ask AI..."
        />
        <button onClick={handleSend} className="bg-blue-600 px-3 py-1 rounded">Send</button>
      </div>
    </div>
  );
}