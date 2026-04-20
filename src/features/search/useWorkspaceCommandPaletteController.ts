import { useCallback, useEffect, useState } from "react";

import { isEditableEventTarget } from "../../lib/dom";

type UseWorkspaceCommandPaletteControllerOptions = {
  disabled: boolean;
};

export function useWorkspaceCommandPaletteController({
  disabled,
}: UseWorkspaceCommandPaletteControllerOptions) {
  const [isOpen, setIsOpen] = useState(false);

  const closePalette = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openPalette = useCallback(() => {
    if (disabled) {
      return false;
    }

    setIsOpen(true);
    return true;
  }, [disabled]);

  useEffect(() => {
    if (!isOpen || !disabled) {
      return;
    }

    setIsOpen(false);
  }, [disabled, isOpen]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (!event.metaKey && !event.ctrlKey) ||
        isEditableEventTarget(event.target)
      ) {
        return;
      }

      if (event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled]);

  return {
    closePalette,
    isOpen,
    openPalette,
  };
}
