import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  buildMyNotesSearch,
  myNotesRoutePath,
  resolveMyNotesWorkspace,
} from "./notes.routes";
import { useToast } from "../../components/ui/toast";
import { useSignedInAppFrame } from "../shell/SignedInAppFrame";
import { useIsDesktop } from "../shell/useIsDesktop";
import { getErrorMessage } from "../../platform/data/rpc-adapter";
import {
  useInitializeNotesMutation,
  useDuplicateNoteAsEditableMutation,
  useNotesQuery,
  useFoldersQuery,
} from "./note.queries";
import { AiChatDrawer } from "../ai/components/AiChatDrawer";
import { NotesView } from "./NotesView";
import {
  granolaImportKeys,
  useGranolaConnectMutation,
  useGranolaConnectionQuery,
  useGranolaDisconnectMutation,
  useGranolaSetModeMutation,
  useGranolaSyncMutation,
} from "./granola-import.queries";
import { NotesImportDialog, type ObsidianImportState } from "./NotesImportDialog";
import { isFromProvider, resolveActiveNoteId } from "./note.types";
import {
  GRANOLA_PROVIDER,
  isCurrentGranolaImportVersion,
  type GranolaConnectionMode,
  type GranolaConnectionRecord,
  type GranolaSyncMode,
} from "./granola-import.shared";
import { parseVaultFromZip } from "./obsidian-import";
import { useObsidianImportMutation } from "./obsidian-import.queries";

const GRANOLA_AUTO_SYNC_STALE_MS = 15 * 60 * 1000;

type GranolaRuntimeState = {
  importedCount: number
  isRunning: boolean
  lastError: string | null
  message: string | null
  updatedCount: number
}

function shouldAutoSyncGranola(connection: GranolaConnectionRecord | null) {
  if (!connection || connection.status !== "connected") {
    return false;
  }

  if (!connection.initialImportCompletedAt) {
    return true;
  }

  if (!connection.lastSyncFinishedAt) {
    return true;
  }

  const lastSyncTimestamp = new Date(connection.lastSyncFinishedAt).getTime();
  if (Number.isNaN(lastSyncTimestamp)) {
    return true;
  }

  return Date.now() - lastSyncTimestamp >= GRANOLA_AUTO_SYNC_STALE_MS;
}

export function MyNotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const search = useSearch({strict: false}) as {noteId?: string; workspaceSlug?: string | null};
  const { currentUser, workspaces } = useSignedInAppFrame();
  const isDesktop = useIsDesktop();

  const currentWorkspace = resolveMyNotesWorkspace(
    workspaces,
    search.workspaceSlug ?? undefined,
  );

  // Notes data
  const userId = currentUser?.id;
  const notesQuery = useNotesQuery(userId);
  const foldersQuery = useFoldersQuery(userId);
  const initMutation = useInitializeNotesMutation();
  const duplicateNoteMutation = useDuplicateNoteAsEditableMutation(userId ?? "");
  const granolaConnectionQuery = useGranolaConnectionQuery(userId);
  const granolaConnectMutation = useGranolaConnectMutation(userId ?? "");
  const granolaDisconnectMutation = useGranolaDisconnectMutation(userId ?? "");
  const granolaSetModeMutation = useGranolaSetModeMutation(userId ?? "");
  const granolaSyncMutation = useGranolaSyncMutation(userId ?? "");
  const obsidianImportMutation = useObsidianImportMutation(userId ?? "");
  const notesErrorMessage =
    notesQuery.error || foldersQuery.error || initMutation.error
      ? getErrorMessage(
          notesQuery.error ?? foldersQuery.error ?? initMutation.error,
          "Rocketboard couldn't load your notes.",
        )
      : null;

  const [hasInitialized, setHasInitialized] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [granolaAnnouncement, setGranolaAnnouncement] = useState<string | null>(
    null,
  );
  const [granolaRuntime, setGranolaRuntime] = useState<GranolaRuntimeState>({
    importedCount: 0,
    isRunning: false,
    lastError: null,
    message: null,
    updatedCount: 0,
  });
  const [obsidianImportState, setObsidianImportState] = useState<ObsidianImportState>({
    error: null,
    isRunning: false,
    progress: null,
    result: null,
  });
  const obsidianNoteCount = useMemo(
    () => (notesQuery.data ?? []).filter((note) => isFromProvider(note, 'obsidian' as any)).length,
    [notesQuery.data],
  );
  const autoSyncTriggeredRef = useRef(false);
  const granolaSyncLockRef = useRef(false);
  const handleRetryNotesLoad = useCallback(() => {
    if (initMutation.error) {
      initMutation.reset();
      setHasInitialized(false);
    }

    void notesQuery.refetch();
    void foldersQuery.refetch();
  }, [foldersQuery, initMutation, notesQuery]);

  // Auto-initialize default folder + note on first visit
  useEffect(() => {
    if (
      userId &&
      !hasInitialized &&
      foldersQuery.data &&
      !foldersQuery.isPending
    ) {
      setHasInitialized(true);
      if (foldersQuery.data.length === 0) {
        initMutation.mutate(userId);
      }
    }
  }, [
    userId,
    hasInitialized,
    foldersQuery.data,
    foldersQuery.isPending,
    initMutation,
  ]);

  const granolaConnection = granolaConnectionQuery.data ?? null;
  const granolaImportedNoteCount = useMemo(
    () =>
      (notesQuery.data ?? []).filter((note) => isFromProvider(note, GRANOLA_PROVIDER)).length,
    [notesQuery.data],
  );
  const granolaHasStaleImports = useMemo(
    () =>
      (notesQuery.data ?? []).some(
        (note) =>
          isFromProvider(note, GRANOLA_PROVIDER) &&
          !isCurrentGranolaImportVersion(note.sourceMetadata),
      ),
    [notesQuery.data],
  );

  const runGranolaSync = useCallback(
    async (reason: "auto" | "connect" | "manual") => {
      if (!userId || granolaSyncLockRef.current) {
        return;
      }

      granolaSyncLockRef.current = true;
      const connectionSnapshot = granolaConnectionQuery.data;
      const syncMode: GranolaSyncMode =
        connectionSnapshot?.initialImportCompletedAt ? "incremental" : "backfill";
      const syncStartedMessage =
        syncMode === "backfill"
          ? "Importing from Granola in the background."
          : "Syncing Granola notes in the background.";

      setGranolaAnnouncement(syncStartedMessage);
      setGranolaRuntime({
        importedCount: 0,
        isRunning: true,
        lastError: null,
        message: syncStartedMessage,
        updatedCount: 0,
      });

      let cursor: string | null = null;
      let importedCount = 0;
      let updatedCount = 0;
      let lastResult:
        | Awaited<ReturnType<typeof granolaSyncMutation.mutateAsync>>
        | null = null;

      try {
        do {
          lastResult = await granolaSyncMutation.mutateAsync({
            cursor,
            mode: syncMode,
          });
          cursor = lastResult.nextCursor;
          importedCount += lastResult.importedCount;
          updatedCount += lastResult.updatedCount;

          setGranolaRuntime({
            importedCount,
            isRunning: true,
            lastError: null,
            message:
              syncMode === "backfill"
                ? `Imported ${importedCount} Granola note${importedCount === 1 ? "" : "s"} so far.`
                : `Updated ${importedCount + updatedCount} Granola note${importedCount + updatedCount === 1 ? "" : "s"}.`,
            updatedCount,
          });
        } while (lastResult?.hasMore);

        if (lastResult?.didCompleteInitialImport && lastResult.newestImportedNoteId) {
          void navigate({
            replace: true,
            search: buildMyNotesSearch(
              currentWorkspace?.slug ?? search.workspaceSlug ?? null,
              lastResult.newestImportedNoteId,
            ),
            to: myNotesRoutePath,
          });
          toast({
            description: "Your imported meetings are in the Granola folder.",
            title: "Granola notes imported",
          });
          setGranolaAnnouncement(
            "Granola import complete. Your notes are in the Granola folder.",
          );
        } else if (reason !== "auto") {
          toast({
            description:
              syncMode === "backfill"
                ? "Imported notes are available in your Granola folder."
                : "Granola notes are up to date.",
            title: syncMode === "backfill" ? "Import complete" : "Granola synced",
          });
          setGranolaAnnouncement(
            syncMode === "backfill"
              ? "Granola import complete."
              : "Granola sync complete.",
          );
        }

        setGranolaRuntime((current) => ({
          ...current,
          isRunning: false,
          message:
            syncMode === "backfill" ? "Import complete." : "Granola sync complete.",
        }));
      } catch (error) {
        const message = getErrorMessage(
          error,
          "Rocketboard could not sync Granola notes.",
        );
        setGranolaRuntime((current) => ({
          ...current,
          isRunning: false,
          lastError: message,
          message,
        }));
        setGranolaAnnouncement(message);
        void queryClient.invalidateQueries({
          queryKey: granolaImportKeys.connection(userId),
        });
        toast({
          description: message,
          title: "Granola sync failed",
          variant: "error",
        });
      } finally {
        granolaSyncLockRef.current = false;
      }
    },
    [currentWorkspace?.slug, granolaConnectionQuery.data, granolaSyncMutation, navigate, queryClient, search.workspaceSlug, toast, userId],
  );

  const handleGranolaConnect = useCallback(
    (token: string, mode: GranolaConnectionMode = 'capture') => {
      granolaConnectMutation.mutate({token, mode}, {
        onError: (error) => {
          const message = getErrorMessage(
            error,
            "Rocketboard could not connect to Granola.",
          );
          setGranolaAnnouncement(message);
          toast({
            description: message,
            title: "Granola connection failed",
            variant: "error",
          });
        },
        onSuccess: () => {
          setImportDialogOpen(false);
          setGranolaAnnouncement("Granola connected. Starting the import.");
          toast({
            description: "Rocketboard is importing your Granola notes in the background.",
            title: "Granola connected",
          });
          void runGranolaSync("connect");
        },
      });
    },
    [granolaConnectMutation, runGranolaSync, toast],
  );

  const handleGranolaReconnect = useCallback(
    (token: string) => {
      const existingMode = granolaConnection?.mode ?? 'capture';
      handleGranolaConnect(token, existingMode);
    },
    [granolaConnection?.mode, handleGranolaConnect],
  );

  const handleGranolaDisconnect = useCallback(() => {
    granolaDisconnectMutation.mutate(undefined, {
      onError: (error) => {
        const message = getErrorMessage(
          error,
          "Rocketboard could not disconnect Granola.",
        );
        setGranolaAnnouncement(message);
        toast({
          description: message,
          title: "Disconnect failed",
          variant: "error",
        });
      },
      onSuccess: () => {
        setGranolaAnnouncement("Granola disconnected. Imported notes remain available.");
        toast({
          description: "Imported notes already in My Notes are still available.",
          title: "Granola disconnected",
        });
      },
    });
  }, [granolaDisconnectMutation, toast]);

  const handleGranolaModeChange = useCallback(
    (mode: GranolaConnectionMode, convertExisting: boolean) => {
      granolaSetModeMutation.mutate({mode, convertExisting}, {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, "Could not change mode."),
            title: "Mode change failed",
            variant: "error",
          });
        },
        onSuccess: (result) => {
          const converted = result.convertedCount ?? 0;
          toast({
            description: converted > 0
              ? `Mode changed. ${converted} note${converted === 1 ? '' : 's'} are now editable.`
              : `Mode changed to ${mode}.`,
            title: mode === 'capture' ? 'Capture mode' : 'Mirror mode',
          });
        },
      });
    },
    [granolaSetModeMutation, toast],
  );

  const handleDuplicateImportedNote = useCallback(
    (noteId: string) => {
      if (!userId) {
        return;
      }

      duplicateNoteMutation.mutate(noteId, {
        onError: (error) => {
          toast({
            description: getErrorMessage(
              error,
              "Rocketboard could not duplicate that note.",
            ),
            title: "Couldn't duplicate note",
            variant: "error",
          });
        },
        onSuccess: (duplicatedNote) => {
          void navigate({
            replace: true,
            search: buildMyNotesSearch(
              currentWorkspace?.slug ?? search.workspaceSlug ?? null,
              duplicatedNote.id,
            ),
            to: myNotesRoutePath,
          });
          toast({
            description: "The editable copy was created in Unfiled.",
            title: "Editable copy created",
          });
        },
      });
    },
    [currentWorkspace?.slug, duplicateNoteMutation, navigate, search.workspaceSlug, toast, userId],
  );

  const handleObsidianImport = useCallback(async (file: File) => {
    if (!userId) return;

    setObsidianImportState({error: null, isRunning: true, progress: null, result: null});

    try {
      const buffer = await file.arrayBuffer();
      const parseResult = parseVaultFromZip(buffer);

      if (parseResult.notes.length === 0) {
        setObsidianImportState({
          error: 'No markdown files found in this zip. Make sure it contains your Obsidian vault.',
          isRunning: false,
          progress: null,
          result: null,
        });
        return;
      }

      const result = await obsidianImportMutation.mutateAsync({
        onProgress: (progress) => {
          setObsidianImportState((prev) => ({...prev, progress}));
        },
        parseResult,
      });

      setObsidianImportState({
        error: null,
        isRunning: false,
        progress: null,
        result,
      });

      toast({
        description: `${result.insertedCount} note${result.insertedCount === 1 ? '' : 's'} imported from Obsidian.`,
        title: "Obsidian import complete",
      });
    } catch (error) {
      const message = getErrorMessage(error, "Could not import Obsidian vault.");
      setObsidianImportState({
        error: message,
        isRunning: false,
        progress: null,
        result: null,
      });
      toast({
        description: message,
        title: "Import failed",
        variant: "error",
      });
    }
  }, [obsidianImportMutation, toast, userId]);

  useEffect(() => {
    if (!userId || autoSyncTriggeredRef.current) {
      return;
    }

    if (!granolaHasStaleImports && !shouldAutoSyncGranola(granolaConnection)) {
      return;
    }

    autoSyncTriggeredRef.current = true;
    void runGranolaSync("auto");
  }, [granolaConnection, granolaHasStaleImports, runGranolaSync, userId]);

  const handleActiveNoteIdChange = useCallback(
    (noteId: string | null) => {
      const nextSearch = buildMyNotesSearch(
        currentWorkspace?.slug ?? search.workspaceSlug ?? null,
        noteId,
      );

      if (
        nextSearch.noteId === search.noteId &&
        nextSearch.workspaceSlug === search.workspaceSlug
      ) {
        return;
      }

      void navigate({
        replace: true,
        search: nextSearch,
        to: myNotesRoutePath,
      });
    },
    [currentWorkspace?.slug, navigate, search.noteId, search.workspaceSlug],
  );

  const resolvedActiveNoteId = resolveActiveNoteId(
    notesQuery.data ?? [],
    null,
    search.noteId ?? null,
  );

  return (
    <>
      <NotesView
        activeNoteIdFromRoute={resolvedActiveNoteId}
        errorMessage={notesErrorMessage}
        folders={foldersQuery.data ?? []}
        granolaConnection={granolaConnection}
        granolaSyncMessage={granolaRuntime.message}
        isLoading={
          (!notesQuery.data || !foldersQuery.data)
          && (notesQuery.isPending || foldersQuery.isPending)
        }
        isGranolaSyncing={granolaRuntime.isRunning}
        notes={notesQuery.data ?? []}
        onActiveNoteIdChange={handleActiveNoteIdChange}
        onDuplicateImportedNote={handleDuplicateImportedNote}
        onOpenAiChat={() => setAiChatOpen(true)}
        onOpenImportDialog={() => setImportDialogOpen(true)}
        onRetryLoad={handleRetryNotesLoad}
        userId={currentUser.id}
      />

      <NotesImportDialog
        connection={granolaConnection}
        importedNoteCount={granolaImportedNoteCount}
        isConnecting={granolaConnectMutation.isPending}
        isDesktop={isDesktop}
        isOpen={importDialogOpen}
        isSyncing={granolaRuntime.isRunning}
        obsidianImportState={obsidianImportState}
        obsidianNoteCount={obsidianNoteCount}
        onClose={() => setImportDialogOpen(false)}
        onConnect={handleGranolaConnect}
        onDisconnect={handleGranolaDisconnect}
        onModeChange={handleGranolaModeChange}
        onObsidianImport={handleObsidianImport}
        onReconnect={handleGranolaReconnect}
        onSync={() => {
          void runGranolaSync("manual");
        }}
        statusAnnouncement={granolaAnnouncement}
      />

      <AiChatDrawer
        isOpen={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        organizationId={currentWorkspace?.organizationId ?? workspaces?.[0]?.organizationId ?? ""}
        surface="notes"
        surfaceContext={{
          activeNoteTitle: (notesQuery.data ?? []).find((n) => n.id === search.noteId)?.title ?? undefined,
          folderStructure: (foldersQuery.data ?? []).map((f) => ({ id: f.id, name: f.name })),
        }}
        userId={currentUser.id}
      />
    </>
  );
}
