import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { type Action, type State, type DraftKey } from './domain';
import { eraseState, loadState, saveState } from './storage';
import { translate, type Key } from './i18n';
import { DemoRepository } from './repository';
interface Store { state: State; ready: boolean; storageError: boolean; motionReduced: boolean; dispatch(a: Action): boolean; retryStorage(): Promise<void>; reset(): Promise<boolean>; t(k: Key): string; flash: string; notify(s: string): void }
const Context = createContext<Store | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [repository]=useState(() => new DemoRepository({ load:loadState,save:saveState,erase:eraseState }));
  const [,render]=useState(0);
  const [systemReduced,setSystemReduced] = useState(false); const [flash,setFlash] = useState('');
  useEffect(() => {
    repository.onChange=() => render(n => n+1);void repository.load();
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduced);
    return () => { repository.onChange=() => {};sub.remove(); };
  },[repository]);
  useEffect(() => { if (!flash) return; const timer = setTimeout(() => setFlash(''), 4500); return () => clearTimeout(timer); },[flash]);
  const dispatch = useCallback((a: Action) => {
    try { repository.apply(a);return true; }
    catch { setFlash(translate(repository.state.locale,repository.error==='read' ? 'storageError' : 'error'));return false; }
  },[repository]);
  const reset = useCallback(async () => {
    try { await repository.reset();return true; }
    catch { setFlash(translate(repository.state.locale,'resetFailed'));return false; }
  },[repository]);
  return <Context.Provider value={{ state:repository.state,ready:repository.ready,storageError:!!repository.error,motionReduced:systemReduced || repository.state.reducedMotion,dispatch,reset,retryStorage:() => repository.retry(),t:k => translate(repository.state.locale,k),flash,notify:setFlash }}>{children}</Context.Provider>;
}
export function useStore() { const s = useContext(Context); if (!s) throw new Error('Missing mobile provider'); return s; }
export function useDraft(key:DraftKey):[string,(text:string)=>void] { const { state,dispatch }=useStore();return [state.drafts[key],text => { dispatch({ type:'draft',key,text }); }]; }
