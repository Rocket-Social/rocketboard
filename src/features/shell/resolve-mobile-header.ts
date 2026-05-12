import { myNotesRoutePath } from "../notes/notes.routes";
import { aiAgentsRoutePath } from "./signed-in-navigation";

export type MobileHeaderConfig = {
  title: string;
  visible: boolean;
};

export function resolveMobileHeader(pathname: string): MobileHeaderConfig {
  if (pathname === aiAgentsRoutePath) {
    return { title: "AI Agents", visible: true };
  }
  if (pathname === myNotesRoutePath) {
    return { title: "My Notes", visible: true };
  }
  if (pathname.endsWith("/trash")) {
    return { title: "Trash", visible: true };
  }
  if (pathname.endsWith("/archive")) {
    return { title: "Archive", visible: true };
  }
  if (pathname.endsWith("/access")) {
    return {
      title: pathname.includes("/projects/") ? "Project Access" : "Workspace Access",
      visible: true,
    };
  }
  if (pathname.endsWith("/settings/api-keys")) {
    return { title: "API Keys", visible: true };
  }
  if (pathname.includes("/wiki")) {
    return { title: "Wiki", visible: true };
  }
  if (pathname.endsWith("/settings")) {
    return { title: "Organization Settings", visible: true };
  }
  if (pathname.includes("/projects/")) {
    return { title: "", visible: false };
  }
  return { title: "Rocketboard", visible: true };
}
