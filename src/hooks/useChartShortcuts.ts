import { useEffect, MutableRefObject } from 'react';
import type { IChartApi } from 'lightweight-charts';

interface UseChartShortcutsParams {
  showIndicatorModal: boolean;
  setShowIndicatorModal: (v: boolean) => void;
  showDataAuthModal: boolean;
  setShowDataAuthModal: (v: boolean) => void;
  activeDrawToolRef: MutableRefObject<string | null>;
  setActiveDrawTool: (tool: string | null) => void;
  isExpanded: boolean;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  chartInstanceRef: MutableRefObject<IChartApi | null>;
  setAutoScale: (v: boolean) => void;
}

export function useChartShortcuts({
  showIndicatorModal,
  setShowIndicatorModal,
  showDataAuthModal,
  setShowDataAuthModal,
  activeDrawToolRef,
  setActiveDrawTool,
  isExpanded,
  setIsExpanded,
  chartInstanceRef,
  setAutoScale,
}: UseChartShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const targetTag = target?.tagName;
      if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;
      if (target?.isContentEditable) return;

      if (e.key === 'Escape') {
        if (showIndicatorModal) {
          setShowIndicatorModal(false);
          return;
        }
        if (showDataAuthModal) {
          setShowDataAuthModal(false);
          return;
        }
        if (activeDrawToolRef.current !== 'crosshair') {
          setActiveDrawTool('crosshair');
          return;
        }
        if (isExpanded) {
          setIsExpanded(false);
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        setIsExpanded((prev) => !prev);
      }

      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (chartInstanceRef.current) {
          chartInstanceRef.current.timeScale().fitContent();
          chartInstanceRef.current.priceScale('right').applyOptions({ autoScale: true });
          setAutoScale(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isExpanded,
    showIndicatorModal,
    showDataAuthModal,
    activeDrawToolRef,
    setActiveDrawTool,
    setShowIndicatorModal,
    setShowDataAuthModal,
    setIsExpanded,
    chartInstanceRef,
    setAutoScale,
  ]);
}
