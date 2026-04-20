import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

type UseResizableWidthOptions = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
};

export type UseResizableWidthResult = {
  width: number;
  isResizing: boolean;
  handleResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function useResizableWidth({
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
}: UseResizableWidthOptions): UseResizableWidthResult {
  const clamp = useCallback(
    (value: number) => Math.max(minWidth, Math.min(maxWidth, value)),
    [minWidth, maxWidth],
  );

  const readInitialWidth = useCallback(() => {
    if (typeof window === "undefined") {
      return defaultWidth;
    }

    const storedValueRaw = window.localStorage.getItem(storageKey);

    if (storedValueRaw === null) {
      return defaultWidth;
    }

    const storedValue = Number(storedValueRaw);

    if (!Number.isFinite(storedValue)) {
      return defaultWidth;
    }

    return clamp(storedValue);
  }, [clamp, defaultWidth, storageKey]);

  const [width, setWidth] = useState<number>(() => readInitialWidth());
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);
  const resizeStateRef = useRef({ initialWidth: width, initialX: 0 });

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const offset = event.clientX - resizeStateRef.current.initialX;
      setWidth(clamp(resizeStateRef.current.initialWidth + offset));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(storageKey, String(widthRef.current));
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [clamp, isResizing, storageKey]);

  const handleResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      resizeStateRef.current = {
        initialWidth: widthRef.current,
        initialX: event.clientX,
      };
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      event.preventDefault();
    },
    [],
  );

  return { width, isResizing, handleResizeStart };
}
