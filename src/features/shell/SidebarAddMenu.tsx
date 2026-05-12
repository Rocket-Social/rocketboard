import {
  BarChart3,
  Calendar,
  FolderPlus,
  LayoutGrid,
  Plus,
  Rocket,
} from "lucide-react";
import { useCallback, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import type { PlanViewType } from "../plans/plan.types";

type SidebarAddMenuProps = {
  onCreateInitiative: () => void;
  onCreatePlan: (defaultViewType: PlanViewType) => void;
  onCreateProject: () => void;
  sidebarButtonBase: string;
};

export function SidebarAddMenu({
  onCreateInitiative,
  onCreatePlan,
  onCreateProject,
  sidebarButtonBase,
}: SidebarAddMenuProps) {
  const [open, setOpen] = useState(false);

  const closeMenuThen = useCallback((action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  }, []);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Add new item"
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${sidebarButtonBase}`}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48"
        side="bottom"
        sideOffset={4}
      >
        <DropdownMenuItem onSelect={() => closeMenuThen(onCreateProject)}>
          <FolderPlus className="mr-2 h-4 w-4" />
          Project
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => closeMenuThen(onCreateInitiative)}>
          <LayoutGrid className="mr-2 h-4 w-4" />
          Initiatives
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => closeMenuThen(() => onCreatePlan("releases"))}>
          <Rocket className="mr-2 h-4 w-4" />
          Releases
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => closeMenuThen(() => onCreatePlan("roadmap"))}>
          <Calendar className="mr-2 h-4 w-4" />
          Roadmap
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => closeMenuThen(() => onCreatePlan("scorecard"))}>
          <BarChart3 className="mr-2 h-4 w-4" />
          Scorecard
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
