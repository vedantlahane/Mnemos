import { useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import { useCanvasStore } from '../../stores/canvasStore';

// Mock utility for debouncing
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    if (timeout) clearTimeout(timeout);
    return new Promise(resolve => {
      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
  };
}

interface Props {
  pageId: string;
}

export function CanvasContainer({ pageId }: Props) {
  const {
    sceneData,
    openCanvasPage,
    saveScene,
    saveViewport,
    visualContext,
    setSelectedElements
  } = useCanvasStore();

  const excRef = useRef<any>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    openCanvasPage(pageId).then(() => setInitialLoaded(true));
  }, [pageId, openCanvasPage]);

  // Debounced save functions
  const debouncedSaveScene = useCallback(
    debounce((elements: any[], appState: any, files: any) => {
      // Exclude some UI state
      const { selectedElementIds, viewBackgroundColor, ...restAppState } = appState;
      saveScene(pageId, { elements, appState: restAppState, files });
    }, 2000),
    [pageId, saveScene]
  );

  const debouncedSaveViewport = useCallback(
    debounce((x: number, y: number, zoom: number) => {
      saveViewport(pageId, x, y, zoom);
    }, 1000),
    [pageId, saveViewport]
  );

  const onChange = (elements: readonly any[], appState: any, files: any) => {
    if (!initialLoaded) return;
    
    // Save elements & app state
    debouncedSaveScene([...elements], appState, files);
    
    // Save viewport
    debouncedSaveViewport(appState.scrollX, appState.scrollY, appState.zoom.value);
    
    // Manage selected elements
    const selectedIds = Object.keys(appState.selectedElementIds || {}).filter(
      k => appState.selectedElementIds[k]
    );
    setSelectedElements(selectedIds);
  };

  if (!initialLoaded) return <div>Loading...</div>;

  return (
    <div className="w-full h-full relative" style={{ width: '100%', height: '100%' }}>
      <Excalidraw
        ref={excRef}
        initialData={{
          elements: sceneData?.elements || [],
          appState: { ...sceneData?.appState } || {},
          files: sceneData?.files || {}
        }}
        onChange={onChange}
      >
        <MainMenu>
           <MainMenu.DefaultItems.ClearReset />
           <MainMenu.DefaultItems.SaveAsImage />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}