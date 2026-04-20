import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type BlockingUiState = {
  isAnyBlockingUiOpen: boolean;
  registerBlocker: (id: string, isBlocking: boolean) => void;
};

const BlockingUiContext = createContext<BlockingUiState>({
  isAnyBlockingUiOpen: false,
  registerBlocker: () => undefined,
});

export function BlockingUiProvider({ children }: { children: ReactNode }) {
  const blockersRef = useRef<Map<string, boolean>>(new Map());
  const [isAnyBlocking, setIsAnyBlocking] = useState(false);

  const registerBlocker = useCallback((id: string, isBlocking: boolean) => {
    blockersRef.current.set(id, isBlocking);
    const anyBlocking = Array.from(blockersRef.current.values()).some(Boolean);
    setIsAnyBlocking(anyBlocking);
  }, []);

  const value: BlockingUiState = {
    isAnyBlockingUiOpen: isAnyBlocking,
    registerBlocker,
  };

  return (
    <BlockingUiContext.Provider value={value}>
      {children}
    </BlockingUiContext.Provider>
  );
}

export function useBlockingUi() {
  return useContext(BlockingUiContext);
}

export function useRegisterBlocker(id: string, isBlocking: boolean) {
  const { registerBlocker } = useBlockingUi();
  useLayoutEffect(() => {
    registerBlocker(id, isBlocking);
    return () => {
      registerBlocker(id, false);
    };
  }, [id, isBlocking, registerBlocker]);
}
