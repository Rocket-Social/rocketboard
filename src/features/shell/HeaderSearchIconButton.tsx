import { Search } from "lucide-react";

type HeaderSearchIconButtonProps = {
  onOpen: () => void;
  variant?: "default" | "quiet";
  disabled?: boolean;
};

const VARIANT_CLASSES: Record<NonNullable<HeaderSearchIconButtonProps["variant"]>, string> = {
  default:
    "inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft disabled:pointer-events-none disabled:opacity-50",
  quiet:
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft disabled:pointer-events-none disabled:opacity-50",
};

export function HeaderSearchIconButton({
  onOpen,
  variant = "default",
  disabled = false,
}: HeaderSearchIconButtonProps) {
  return (
    <button
      aria-label="Search"
      className={VARIANT_CLASSES[variant]}
      disabled={disabled}
      onClick={() => onOpen()}
      title="Search"
      type="button"
    >
      <Search className={variant === "quiet" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </button>
  );
}
