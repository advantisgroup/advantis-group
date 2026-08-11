"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { GlobalFileViewer } from "./GlobalFileViewer";

export interface ViewableFile {
  /** Convex-storage id — set for legacy (pre-OneDrive) attachments/documents. */
  storageId?: string;
  /** OneDrive item id — set for anything uploaded through the current wiki/HR
   * attach flow. The viewer resolves its own preview URL through apps/api. */
  oneDriveItemId?: string;
  name: string;
  contentType?: string;
  size?: number;
  width?: number;
  height?: number;
  /** Epoch ms the file was uploaded/last changed, if known (e.g. the chat message's createdAt). */
  modifiedAt?: number;
  /** Pre-resolved URL, when the caller already has one (e.g. chat attachments). */
  url?: string;
}

export interface OpenFileViewerOptions {
  /**
   * Called instead of the default close behavior when the viewer's close
   * button/Escape/backdrop-click fires — e.g. a URL-driven opener that wants
   * closing to navigate back (`router.back()`) rather than just clearing
   * state, letting its own unmount effect clear the viewer afterward.
   */
  onClose?: () => void;
}

interface FileViewerContextValue {
  openFileViewer: (file: ViewableFile, options?: OpenFileViewerOptions) => void;
  closeFileViewer: () => void;
}

const FileViewerContext = createContext<FileViewerContextValue | null>(null);

/**
 * Global Discord-style file preview, mounted once at the app shell root
 * (alongside TourProvider) so any surface — chat, announcements, OneDrive —
 * can open the same viewer via `useFileViewer()` instead of maintaining its
 * own preview dialog.
 */
export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<ViewableFile | null>(null);
  const onCloseOverrideRef = useRef<(() => void) | null>(null);

  const openFileViewer = useCallback((f: ViewableFile, options?: OpenFileViewerOptions) => {
    onCloseOverrideRef.current = options?.onClose ?? null;
    setFile(f);
  }, []);
  const closeFileViewer = useCallback(() => {
    onCloseOverrideRef.current = null;
    setFile(null);
  }, []);
  const handleClose = useCallback(() => {
    const override = onCloseOverrideRef.current;
    if (override) {
      override();
    } else {
      closeFileViewer();
    }
  }, [closeFileViewer]);

  const value = useMemo(
    () => ({ openFileViewer, closeFileViewer }),
    [openFileViewer, closeFileViewer],
  );

  return (
    <FileViewerContext.Provider value={value}>
      {children}
      <GlobalFileViewer file={file} onClose={handleClose} />
    </FileViewerContext.Provider>
  );
}

export function useFileViewer(): FileViewerContextValue {
  const ctx = useContext(FileViewerContext);
  if (!ctx) {
    throw new Error("useFileViewer must be used within FileViewerProvider");
  }
  return ctx;
}
