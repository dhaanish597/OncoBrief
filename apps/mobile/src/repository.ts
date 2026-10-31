import { createDemo,reduce,type State,type Action } from './domain';
export interface DemoStorage { load():Promise<State>;save(s:State):Promise<void>;erase():Promise<void> }
export class DemoRepository {
  state=createDemo();error:'read'|'write'|null=null;ready=false;
  private queue=Promise.resolve();
  onChange:()=>void=() => {};
  constructor(private readonly storage:DemoStorage) {}
  async load() {
    try { this.state=await this.storage.load();this.error=null; } catch { this.error='read'; }
    this.ready=true;this.onChange();
  }
  apply(action:Action) {
    if (!this.ready || this.error==='read') throw new Error('storage_recovery_required');
    this.state=reduce(this.state,action);const snapshot=this.state;this.onChange();
    this.queue=this.queue.then(async () => { try { await this.storage.save(snapshot); } catch { this.error='write';this.onChange(); } });
  }
  async flush() { await this.queue; }
  async retry() {
    await this.queue;
    if (this.error==='read') return this.load();
    try { await this.storage.save(this.state);this.error=null; } catch { this.error='write'; }
    this.onChange();
  }
  async reset() { await this.queue;await this.storage.erase();this.state=createDemo();this.error=null;this.onChange(); }
}
