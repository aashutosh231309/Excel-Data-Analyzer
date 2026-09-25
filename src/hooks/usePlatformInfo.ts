import { useEffect, useState } from 'react';
import { getDesktopBridge } from '@/lib/desktop-bridge';
import type { PlatformInfo } from '@shared/api';

export type PlatformInfoState =
  | { status: 'loading' }
  | { status: 'ready'; info: PlatformInfo }
  | { status: 'unavailable' };

/** Runtime information shown on the Settings screen (read-only, no telemetry). */
export function usePlatformInfo(): PlatformInfoState {
  const [state, setState] = useState<PlatformInfoState>({ status: 'loading' });

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setState({ status: 'unavailable' });
      return;
    }
    let isActive = true;
    void bridge.app
      .getPlatformInfo()
      .then((info) => {
        if (isActive) {
          setState({ status: 'ready', info });
        }
      })
      .catch(() => {
        if (isActive) {
          setState({ status: 'unavailable' });
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  return state;
}
