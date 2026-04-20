import { ImageUp, KeyRound, Loader2, Save, Trash2, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { UserAvatar } from "../../components/ui/user-avatar";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { getErrorMessage } from "../../platform/data/rpc-adapter";
import { minimumAccountPasswordLength, type SessionUser } from "./data";
import {
  useRemoveAccountAvatarMutation,
  useUploadAccountAvatarMutation,
  useUpdateAccountPasswordMutation,
  useUpdateAccountProfileMutation,
} from "./session.queries";

type AccountSettingsDialogProps = {
  currentUser: SessionUser;
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string;
  registerCloseRequest?: (
    closeRequest: (() => Promise<boolean>) | null,
  ) => void;
};

export function AccountSettingsDialog({
  currentUser,
  isOpen,
  onClose,
  registerCloseRequest,
}: AccountSettingsDialogProps) {
  const updateProfileMutation = useUpdateAccountProfileMutation();
  const updatePasswordMutation = useUpdateAccountPasswordMutation();
  const uploadAvatarMutation = useUploadAccountAvatarMutation();
  const removeAvatarMutation = useRemoveAccountAvatarMutation();
  const { confirm, confirmDialogProps } = useConfirmDialog();
  const wasOpenRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState(currentUser.name);
  const [githubLogin, setGitHubLogin] = useState(currentUser.githubLogin ?? "");
  const [password, setPassword] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    if (wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = true;
    updatePasswordMutation.reset();
    updateProfileMutation.reset();
    setConfirmPassword("");
    setFullName(currentUser.name);
    setGitHubLogin(currentUser.githubLogin ?? "");
    setPassword("");
    setSuccessMessage(null);
  }, [
    currentUser.githubLogin,
    currentUser.name,
    isOpen,
    updatePasswordMutation,
    updateProfileMutation,
  ]);

  const errorSource =
    uploadAvatarMutation.error
    ?? removeAvatarMutation.error
    ?? updateProfileMutation.error
    ?? updatePasswordMutation.error;
  const errorMessage = errorSource ? getErrorMessage(errorSource) : null;
  const normalizedGithubLogin = githubLogin.trim().toLowerCase();
  const passwordDirty =
    password.trim().length > 0 || confirmPassword.trim().length > 0;
  const passwordsMatch = !password || password === confirmPassword;
  const profileDirty =
    fullName.trim() !== currentUser.name ||
    normalizedGithubLogin !== (currentUser.githubLogin ?? "").toLowerCase();
  const hasUnsavedChanges = profileDirty || passwordDirty;

  const clearSuccessMessage = () => {
    if (successMessage) {
      setSuccessMessage(null);
    }
  };

  const requestClose = useCallback(async () => {
    if (
      uploadAvatarMutation.isPending ||
      removeAvatarMutation.isPending ||
      updatePasswordMutation.isPending ||
      updateProfileMutation.isPending
    ) {
      return false;
    }

    if (
      hasUnsavedChanges &&
      !(await confirm({
        title: "Discard the unsaved changes?",
        confirmLabel: "Discard",
        variant: "destructive",
      }))
    ) {
      return false;
    }

    onClose();
    return true;
  }, [
    confirm,
    hasUnsavedChanges,
    onClose,
    removeAvatarMutation.isPending,
    updatePasswordMutation.isPending,
    updateProfileMutation.isPending,
    uploadAvatarMutation.isPending,
  ]);

  useEffect(() => {
    if (!registerCloseRequest) {
      return;
    }

    if (!isOpen) {
      registerCloseRequest(null);
      return;
    }

    registerCloseRequest(requestClose);
    return () => registerCloseRequest(null);
  }, [isOpen, registerCloseRequest, requestClose]);

  const handleSaveProfile = () => {
    if (!profileDirty || !fullName.trim()) {
      return;
    }

    updateProfileMutation.mutate(
      {
        fullName,
        githubLogin,
      },
      {
        onSuccess: () => {
          setSuccessMessage("Your profile details have been updated.");
        },
      },
    );
  };

  const handleUpdatePassword = () => {
    if (!password.trim() || !passwordsMatch) {
      return;
    }

    updatePasswordMutation.mutate(
      {
        password,
      },
      {
        onSuccess: () => {
          setConfirmPassword("");
          setPassword("");
          setSuccessMessage("Your password has been updated.");
        },
      },
    );
  };

  const handleAvatarSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    clearSuccessMessage();
    uploadAvatarMutation.mutate(file, {
      onSuccess: () => {
        setSuccessMessage("Your profile photo has been updated.");
      },
    });
  };

  const handleRemoveAvatar = () => {
    clearSuccessMessage();
    removeAvatarMutation.mutate(undefined, {
      onSuccess: () => {
        setSuccessMessage("Your profile photo has been removed.");
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) void requestClose(); }}>
      <DialogContent className="h-[min(42rem,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto rounded-[28px] bg-surface-base p-0">
        <DialogHeader className="px-6 py-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-text-muted">
            Profile
          </p>
          <DialogTitle className="mt-1 font-display text-2xl">
            Manage your profile
          </DialogTitle>
          <DialogDescription className="mt-2">
            Update your photo, name, GitHub login, and password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <section className="rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-text-muted" />
              <h3 className="font-display text-lg font-semibold text-text-strong">
                Profile
              </h3>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-base p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <UserAvatar
                    avatarUrl={currentUser.avatarUrl}
                    className="h-16 w-16"
                    fallback={currentUser.initials}
                    fallbackClassName="text-lg"
                    name={currentUser.name}
                  />
                  <div>
                    <p className="text-sm font-medium text-text-strong">
                      Profile photo
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Uploads save immediately. Use a square-ish image up to 5 MB.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarSelection}
                    ref={avatarInputRef}
                    type="file"
                  />
                  <Button
                    disabled={uploadAvatarMutation.isPending || removeAvatarMutation.isPending}
                    onClick={() => avatarInputRef.current?.click()}
                    type="button"
                    variant="secondary"
                  >
                    {uploadAvatarMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageUp className="h-4 w-4" />
                    )}
                    {uploadAvatarMutation.isPending ? "Uploading…" : "Upload photo"}
                  </Button>
                  {currentUser.avatarUrl ? (
                    <Button
                      disabled={uploadAvatarMutation.isPending || removeAvatarMutation.isPending}
                      onClick={handleRemoveAvatar}
                      type="button"
                      variant="ghost"
                    >
                      {removeAvatarMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {removeAvatarMutation.isPending ? "Removing…" : "Remove"}
                    </Button>
                  ) : null}
                </div>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-strong">
                  Full name
                </span>
                <Input
                  autoComplete="name"
                  onChange={(event) => {
                    clearSuccessMessage();
                    setFullName(event.target.value);
                  }}
                  placeholder="Morgan Lee"
                  value={fullName}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-strong">
                  Email
                </span>
                <Input disabled type="email" value={currentUser.email} />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-strong">
                  GitHub login
                </span>
                <Input
                  autoCapitalize="none"
                  autoComplete="off"
                  onChange={(event) => {
                    clearSuccessMessage();
                    setGitHubLogin(event.target.value);
                  }}
                  placeholder="octocat"
                  value={githubLogin}
                />
              </label>

              <p className="text-xs text-text-muted">
                Add your GitHub login so Team and Health analytics can match
                your pull requests and reviews to your Rocketboard profile.
              </p>

              <div className="flex justify-end">
                <Button
                  disabled={
                    !profileDirty ||
                    !fullName.trim() ||
                    updateProfileMutation.isPending
                  }
                  onClick={handleSaveProfile}
                  variant="primary"
                >
                  <Save className="h-4 w-4" />
                  {updateProfileMutation.isPending ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-text-muted" />
              <h3 className="font-display text-lg font-semibold text-text-strong">
                Security
              </h3>
            </div>

            <div className="mt-4 space-y-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-text-strong">
                  New password
                </span>
                <Input
                  autoComplete="new-password"
                  onChange={(event) => {
                    clearSuccessMessage();
                    setPassword(event.target.value);
                  }}
                  placeholder="At least 8 characters"
                  type="password"
                  value={password}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-strong">
                  Confirm password
                </span>
                <Input
                  autoComplete="new-password"
                  onChange={(event) => {
                    clearSuccessMessage();
                    setConfirmPassword(event.target.value);
                  }}
                  placeholder="Repeat the new password"
                  type="password"
                  value={confirmPassword}
                />
              </label>

              {!passwordsMatch ? (
                <div className="rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                  The new password and confirmation do not match.
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  disabled={
                    !password.trim() ||
                    password.trim().length < minimumAccountPasswordLength ||
                    !passwordsMatch ||
                    updatePasswordMutation.isPending
                  }
                  onClick={handleUpdatePassword}
                  variant="primary"
                >
                  <KeyRound className="h-4 w-4" />
                  {updatePasswordMutation.isPending
                    ? "Updating…"
                    : "Update password"}
                </Button>
              </div>
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-2xl border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
              {successMessage}
            </div>
          ) : null}
        </div>
      </DialogContent>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps} /> : null}
    </Dialog>
  );
}
