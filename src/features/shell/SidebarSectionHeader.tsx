import type { ReactNode } from "react";

type SidebarSectionHeaderProps = {
  action?: ReactNode;
  darkSidebar: boolean;
  title: string;
};

export function SidebarSectionHeader({
  action,
  darkSidebar,
  title,
}: SidebarSectionHeaderProps) {
  return (
    <div className="mb-2 flex items-center pl-1">
      <span
        className={`font-mono text-xs font-medium uppercase tracking-wider ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
      >
        {title}
      </span>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
