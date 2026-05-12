import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "../lib/cn";
import {
  getBrowserTimeZone,
  getTimezoneOption,
  normalizeTimezone,
  searchTimezoneOptions,
} from "../lib/timezone";
import { Input } from "./ui/input";

type TimezoneComboboxProps = {
  className?: string;
  disabled?: boolean;
  dropdownClassName?: string;
  inputClassName?: string;
  inputId?: string;
  onChange: (value: string) => void;
  onInteract?: () => void;
  placeholder?: string;
  previewClassName?: string;
  value: string;
};

export function TimezoneCombobox({
  className,
  disabled = false,
  dropdownClassName,
  inputClassName,
  inputId,
  onChange,
  onInteract,
  placeholder = "Search by city, country, or timezone",
  previewClassName,
  value,
}: TimezoneComboboxProps) {
  const listboxId = useId();
  const browserTimezone = useMemo(() => getBrowserTimeZone(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const selectedOption = useMemo(() => getTimezoneOption(value), [value]);
  const normalizedValue = normalizeTimezone(value);
  const { ambiguityHint, options } = useMemo(
    () =>
      searchTimezoneOptions(deferredQuery, {
        browserTimezone,
        selectedValue: value,
      }),
    [browserTimezone, deferredQuery, value],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedIndex = normalizedValue
      ? options.findIndex((option) => option.value === normalizedValue)
      : -1;

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, normalizedValue, options]);

  const closePicker = () => {
    setIsOpen(false);
    setQuery("");
  };

  const selectOption = (nextValue: string) => {
    onInteract?.();
    onChange(nextValue);
    closePicker();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((currentIndex) =>
        options.length === 0 ? 0 : (currentIndex + 1) % options.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((currentIndex) =>
        options.length === 0
          ? 0
          : (currentIndex - 1 + options.length) % options.length,
      );
      return;
    }

    if (event.key === "Enter" && isOpen && options[activeIndex]) {
      event.preventDefault();
      selectOption(options[activeIndex].value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
    }
  };

  const displayValue = isOpen
    ? query
    : selectedOption
      ? `${selectedOption.label} · ${selectedOption.offsetLabel}`
      : value;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Input
          aria-activedescendant={
            isOpen && options[activeIndex]
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          autoComplete="off"
          className={inputClassName}
          disabled={disabled}
          id={inputId}
          onBlur={() => {
            window.setTimeout(() => {
              closePicker();
            }, 120);
          }}
          onChange={(event) => {
            onInteract?.();
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (disabled) {
              return;
            }

            setIsOpen(true);
            setQuery("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={displayValue}
        />

        {isOpen ? (
          <div
            className={cn(
              "absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-border-subtle bg-surface-elevated shadow-panel",
              dropdownClassName,
            )}
            id={listboxId}
            role="listbox"
          >
            {ambiguityHint ? (
              <div className="border-b border-border-subtle px-3 py-2 text-xs text-text-muted">
                {ambiguityHint}
              </div>
            ) : null}

            {options.length > 0 ? (
              options.map((option, index) => {
                const isActive = index === activeIndex;
                const isSelected = option.value === normalizedValue;

                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-canvas-accent" : "hover:bg-canvas-accent",
                    )}
                    id={`${listboxId}-option-${index}`}
                    key={option.value}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectOption(option.value);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "truncate text-sm text-text-medium",
                          isSelected && "font-medium text-text-strong",
                        )}
                      >
                        {option.label}
                      </div>
                      <div className="truncate font-mono text-[11px] text-text-muted">
                        {option.secondaryLabel}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-[11px] text-text-muted">
                      {option.offsetLabel}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-sm text-text-muted">
                No matching timezones.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {selectedOption?.previewLabel ? (
        <p className={cn("text-xs text-text-muted", previewClassName)}>
          Current local time: {selectedOption.previewLabel}
        </p>
      ) : null}
    </div>
  );
}
