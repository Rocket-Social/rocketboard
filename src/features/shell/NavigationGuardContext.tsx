import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

type GuardFn = () => Promise<boolean> | boolean;

type NavigationGuardState = {
  registerGuard: (id: string, fn: GuardFn) => void;
  unregisterGuard: (id: string) => void;
  runRegisteredGuards: () => Promise<boolean>;
};

const NavigationGuardContext = createContext<NavigationGuardState>({
  registerGuard: () => undefined,
  unregisterGuard: () => undefined,
  runRegisteredGuards: async () => true,
});

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guardsRef = useRef<Map<string, GuardFn>>(new Map());

  const registerGuard = useCallback((id: string, fn: GuardFn) => {
    guardsRef.current.set(id, fn);
  }, []);

  const unregisterGuard = useCallback((id: string) => {
    guardsRef.current.delete(id);
  }, []);

  const runRegisteredGuards = useCallback(async () => {
    for (const guard of guardsRef.current.values()) {
      const allowed = await guard();
      if (!allowed) return false;
    }
    return true;
  }, []);

  const value: NavigationGuardState = {
    registerGuard,
    unregisterGuard,
    runRegisteredGuards,
  };

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuards() {
  return useContext(NavigationGuardContext);
}

export function useRegisterNavigationGuard(id: string, fn: GuardFn) {
  const { registerGuard, unregisterGuard } = useNavigationGuards();
  useEffect(() => {
    registerGuard(id, fn);
    return () => unregisterGuard(id);
  }, [id, fn, registerGuard, unregisterGuard]);
}
