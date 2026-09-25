import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getDesktopBridge } from '@/lib/desktop-bridge';
import type { WindowState } from '@shared/api';

export interface WindowControls {
  isMaximized: boolean;
  isFullScreen: boolean;
  /** `false` when the UI runs outside Electron (e.g. a browser preview). */
  available: boolean;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}

const INITIAL_STATE: WindowState = { isMaximized: false, isFullScreen: false };

/**
 * Drives the custom window controls in the title bar and mirrors the real
 * window state reported by the main process.
 */
export function useWindowControls(): WindowControls {
  const bridge = getDesktopBridge();
  const { notify } = useToast();
  const [state, setState] = useState<WindowState>(INITIAL_STATE);

  useEffect(() => {
    if (!bridge) {
      return;
    }
    let isActive = true;
    void bridge.window.getState().then((next) => {
      if (isActive) {
        setState(next);
      }
    });
    const unsubscribe = bridge.window.onStateChanged((next) => setState(next));
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [bridge]);

  const reportFailure = useCallback(
    (action: string) => {
      notify({
        variant: 'error',
        title: 'Window command failed',
        description: `The application could not ${action} the window.`,
      });
    },
    [notify],
  );

  const minimize = useCallback(() => {
    if (!bridge) {
      return;
    }
    void bridge.window.minimize().catch(() => reportFailure('minimize'));
  }, [bridge, reportFailure]);

  const toggleMaximize = useCallback(() => {
    if (!bridge) {
      return;
    }
    void bridge.window
      .toggleMaximize()
      .then((next) => setState(next))
      .catch(() => reportFailure('resize'));
  }, [bridge, reportFailure]);

  const close = useCallback(() => {
    if (!bridge) {
      return;
    }
    void bridge.window.close().catch(() => reportFailure('close'));
  }, [bridge, reportFailure]);

  return useMemo(
    () => ({
      isMaximized: state.isMaximized,
      isFullScreen: state.isFullScreen,
      available: bridge !== null,
      minimize,
      toggleMaximize,
      close,
    }),
    [state.isMaximized, state.isFullScreen, bridge, minimize, toggleMaximize, close],
  );
}
