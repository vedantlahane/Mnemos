import { useCanvasStore } from '../../stores/canvasStore';

export function VisualContextBadge() {
  const { visualContext } = useCanvasStore();

  if (!visualContext) return null;

  return (
    <div className="absolute top-4 right-4 bg-black/80 border border-white/20 p-2 rounded-lg text-xs text-white z-50 pointer-events-none">
      <div className="font-bold text-accent mb-1">AI Context</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
         <span className="opacity-70">Pattern:</span><span>{visualContext.layout_pattern}</span>
         <span className="opacity-70">Density:</span><span>{visualContext.density}</span>
         <span className="opacity-70">Elements:</span><span>{visualContext.element_count}</span>
      </div>
    </div>
  );
}