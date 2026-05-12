export async function runProjectSidebarNavigationGuard(args: {
  closeNavigationLayers: () => void;
  confirmDiscardNavigationChanges: () => Promise<boolean>;
}) {
  if (!(await args.confirmDiscardNavigationChanges())) {
    return false;
  }

  args.closeNavigationLayers();
  return true;
}
