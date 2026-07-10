"use client";

/* eslint-disable react-refresh/only-export-components --
   Provider colocated with its `useFileViewer` hook, imported across the app. */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { GlobalFileViewer } from "./GlobalFileViewer";

export interface ViewableFile {
  storageId: string;
  name: string;
  contentType?: string;
  size?: number;
  width?: number;
  height?: number;
  /** Pre-resolved URL, when the caller already has one (e.g. chat attachments). */
  url?: string;
}

interface FileViewerContextValue {
  openFileViewer: (file: ViewableFile) => void;
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

  const openFileViewer = useCallback((f: ViewableFile) => setFile(f), []);
  const closeFileViewer = useCallback(() => setFile(null), []);

  const value = useMemo(
    () => ({ openFileViewer, closeFileViewer }),
    [openFileViewer, closeFileViewer]
  );

  return (
    <FileViewerContext.Provider value={value}>
      {children}
      <GlobalFileViewer file={file} onClose={closeFileViewer} />
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
