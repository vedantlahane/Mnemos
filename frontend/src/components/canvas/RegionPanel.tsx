import { useState, useEffect } from 'react';
import { canvas as canvasApi } from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';

interface Props {
  pageId: string;
}

export function RegionPanel({ pageId }: Props) {
  const { pageRegions, refreshRegions } = useCanvasStore();
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    refreshRegions(pageId);
  }, [pageId, refreshRegions]);

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    await canvasApi.createRegion(pageId, {
      label: newLabel,
      region_type: 'cluster',
      layout_hint: 'grid'
    });
    setNewLabel('');
    refreshRegions(pageId);
  };

  const handleDelete = async (id: string) => {
    await canvasApi.deleteRegion(pageId, id);
    refreshRegions(pageId);
  };

  return (
    <div className="absolute left-4 top-4 bg-black/80 border border-white/20 p-3 rounded-lg text-sm text-white z-50 w-64 pointer-events-auto max-h-96 overflow-y-auto">
      <h3 className="font-semibold mb-2">Regions ({pageRegions.length})</h3>
      <div className="flex gap-2 mb-3">
        <input 
          value={newLabel} 
          onChange={(e) => setNewLabel(e.target.value)} 
          className="bg-white/10 px-2 py-1 rounded w-full border border-white/20 text-white"
          placeholder="New Region..."
        />
        <button onClick={handleCreate} className="bg-blue-600 px-2 py-1 rounded">Add</button>
      </div>
      <div className="space-y-2">
        {pageRegions.map(r => (
          <div key={r.id} className="flex justify-between items-center bg-white/5 p-2 rounded border border-white/10">
            <div>
              <div className="font-medium">{r.label || 'Unnamed'}</div>
              <div className="text-xs opacity-50">{r.region_type} • {r.element_count || 0} items</div>
            </div>
            <button onClick={() => handleDelete(r.id)} className="text-red-400 opacity-60 hover:opacity-100">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}