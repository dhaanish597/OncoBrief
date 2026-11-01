import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { type Action, type State, type DraftKey } from './domain';
import { eraseState, loadState, saveState } from './storage';
import { translate, type Key } from './i18n';
import { DemoRepository, ConnectedPatientRepository } from './repository';
import { PatientPortalApiClient } from './api-client';

interface Store {
  state: State;
  ready: boolean;
  storageError: boolean;
  motionReduced: boolean;
  mode: 'demo' | 'connected';
  isAuthenticated: boolean;
  client: PatientPortalApiClient;
  dispatch(a: Action): boolean;
  retryStorage(): Promise<void>;
  reset(): Promise<boolean>;
  t(k: Key): string;
  flash: string;
  notify(s: string): void;
  switchMode(mode: 'demo' | 'connected'): void;
  signInConnected(params: {
    hospitalSlug: string;
    identifier: string;
    otp: string;
    actorRole?: 'patient' | 'caregiver';
  }): Promise<void>;
  signOutConnected(): Promise<void>;
  refresh(): Promise<void>;
}

const Context = createContext<Store | null>(null);

export function Provider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'demo' | 'connected'>('demo');
  const [demoRepo] = useState(() => new DemoRepository({ load: loadState, save: saveState, erase: eraseState }));
  const [connectedRepo] = useState(() => new ConnectedPatientRepository());
  const [, render] = useState(0);
  const [systemReduced, setSystemReduced] = useState(false);
  const [flash, setFlash] = useState('');

  const activeRepo = mode === 'connected' ? connectedRepo : demoRepo;

  useEffect(() => {
    const onDemoChange = () => {
      if (mode === 'demo') render((n) => n + 1);
    };
    const onConnectedChange = () => {
      if (mode === 'connected') render((n) => n + 1);
    };

    demoRepo.onChange = onDemoChange;
    connectedRepo.onChange = onConnectedChange;

    void demoRepo.load();

    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => {
      demoRepo.onChange = () => {};
      connectedRepo.onChange = () => {};
      sub.remove();
    };
  }, [demoRepo, connectedRepo, mode]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(''), 4500);
    return () => clearTimeout(timer);
  }, [flash]);

  const dispatch = useCallback(
    (a: Action) => {
      try {
        activeRepo.apply(a);
        return true;
      } catch {
        setFlash(
          translate(
            activeRepo.state.locale,
            activeRepo.error === 'read' ? 'storageError' : 'error',
          ),
        );
        return false;
      }
    },
    [activeRepo],
  );

  const reset = useCallback(async () => {
    try {
      await activeRepo.reset();
      return true;
    } catch {
      setFlash(translate(activeRepo.state.locale, 'resetFailed'));
      return false;
    }
  }, [activeRepo]);

  const switchMode = useCallback((newMode: 'demo' | 'connected') => {
    setMode(newMode);
    render((n) => n + 1);
  }, []);

  const signInConnected = useCallback(
    async (params: {
      hospitalSlug: string;
      identifier: string;
      otp: string;
      actorRole?: 'patient' | 'caregiver';
    }) => {
      await connectedRepo.signIn(params);
      setMode('connected');
      render((n) => n + 1);
    },
    [connectedRepo],
  );

  const signOutConnected = useCallback(async () => {
    await connectedRepo.signOut();
    render((n) => n + 1);
  }, [connectedRepo]);

  const refresh = useCallback(async () => {
    if (mode === 'connected') {
      await connectedRepo.refreshSnapshot();
    } else {
      await demoRepo.retry();
    }
  }, [mode, connectedRepo, demoRepo]);

  return (
    <Context.Provider
      value={{
        state: activeRepo.state,
        ready: activeRepo.ready,
        storageError: !!activeRepo.error,
        motionReduced: systemReduced || activeRepo.state.reducedMotion,
        mode,
        isAuthenticated: mode === 'connected' ? connectedRepo.isAuthenticated : true,
        client: connectedRepo.client,
        dispatch,
        reset,
        retryStorage: () => activeRepo.retry(),
        t: (k) => translate(activeRepo.state.locale, k),
        flash,
        notify: setFlash,
        switchMode,
        signInConnected,
        signOutConnected,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useStore() {
  const s = useContext(Context);
  if (!s) throw new Error('Missing mobile provider');
  return s;
}

export function useDraft(key: DraftKey): [string, (text: string) => void] {
  const { state, dispatch } = useStore();
  return [
    state.drafts[key],
    (text) => {
      dispatch({ type: 'draft', key, text });
    },
  ];
}
