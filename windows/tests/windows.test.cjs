'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {formatRateLimits,isMainWindow,CdpSession,AppServerClient,resolveCodexBin,unavailableValue}=require('../lib/agent.cjs');
const {safeListeners,desktopLaunchSpec,launchDesktop,classifyProbe,probeDesktop,createMonitor,retryDelay}=require('../windows.cjs');
const {EventEmitter}=require('node:events');
const app='C:\\Program Files\\WindowsApps\\OpenAI.Codex_example\\app\\ChatGPT.exe';
const snapshot=(planType='plus')=>({rateLimits:{limitId:'codex',planType,
  primary:{usedPercent:8,windowDurationMins:300,resetsAt:1800000000},
  secondary:{usedPercent:56,windowDurationMins:10080,resetsAt:1800100000}}});

test('Plus displays two true remaining windows',()=>{
  const value=formatRateLimits(snapshot());
  assert.equal(value.mode,'dual');
  assert.deepEqual(value.rings.map(r=>r.percent),[92,44]);
});

test('reset labels use local 24-hour time and month-day without changing full tooltips',()=>{
  const data=snapshot();
  data.rateLimits.primary.resetsAt=new Date(2026,10,9,18,30).getTime()/1000;
  data.rateLimits.secondary.resetsAt=new Date(2026,10,12,8,5).getTime()/1000;
  const value=formatRateLimits(data);
  assert.deepEqual(value.rings.map(r=>r.resetText),['18:30','11-12']);
  assert.match(value.rings[0].title,/18:30/);
  assert.match(value.rings[1].title,/08:05/);
  data.rateLimits.planType='pro';
  assert.equal(formatRateLimits(data).resetText,'11-12');
});

test('reset labels follow local timezone across UTC midnight',()=>{
  const {execFileSync}=require('node:child_process');
  const script=`const {formatRateLimits}=require('./lib/agent.cjs'); console.log(JSON.stringify(formatRateLimits({rateLimits:{planType:'plus',primary:{usedPercent:10,windowDurationMins:300,resetsAt:Date.parse('2026-11-09T23:30:00Z')/1000},secondary:{usedPercent:20,windowDurationMins:10080,resetsAt:Date.parse('2026-11-09T23:30:00Z')/1000}}}).rings.map(r=>r.resetText)))`;
  const result=execFileSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,TZ:'Asia/Shanghai'},encoding:'utf8'});
  assert.deepEqual(JSON.parse(result),['07:30','11-10']);
});

test('missing, invalid or stale reset times are cleared and recover with new data',()=>{
  for(const resetsAt of [undefined,null,0,-1,NaN,Infinity,1e30,'1800000000']){
    const data=snapshot();data.rateLimits.primary.resetsAt=resetsAt;
    assert.equal(formatRateLimits(data).rings[0].resetText,null);
  }
  const data=snapshot();delete data.rateLimits.primary.usedPercent;
  assert.equal(formatRateLimits(data).rings[0].resetText,null);
  const fresh=formatRateLimits(snapshot());
  assert.ok(fresh.rings.every(r=>r.resetText));
  const stale=unavailableValue(fresh);
  assert.equal(stale.resetText,null);
  assert.deepEqual(stale.rings.map(r=>r.resetText),[null,null]);
  assert.ok(formatRateLimits(snapshot()).rings.every(r=>r.resetText));
});
test('Pro uses weekly window, not a fake five-hour value',()=>{
  const value=formatRateLimits(snapshot('pro'));
  assert.equal(value.percent,44);
  assert.equal(value.windowLabel,'周');
});
test('missing data never becomes 100% remaining',()=>{
  const value=formatRateLimits({rateLimits:{planType:'plus'}});
  assert.deepEqual(value.rings.map(r=>r.percent),[null,null]);
});
test('unrelated model quota is ignored',()=>{
  const data=snapshot();data.rateLimits.limitId='other';
  assert.equal(formatRateLimits(data).percent,null);
});
test('mark stale values unavailable',()=>{
  const value=unavailableValue(formatRateLimits(snapshot()));
  assert.equal(value.stale,true);
  assert.deepEqual(value.rings.map(r=>r.percent),[null,null]);
});
test('only main app windows selected',()=>{
  assert.equal(isMainWindow({url:'app://-/index.html'}),true);
  for(const url of ['https://chatgpt.com','app://-/index.html?overlay=true','app://other/index.html','file:///index.html'])
    assert.equal(isMainWindow({url}),false);
});
test('only expected app and exclusively loopback listeners are accepted',()=>{
  assert.equal(safeListeners([{address:'127.0.0.1',path:app}],app),true);
  assert.equal(safeListeners([{address:'::1',path:app.toLowerCase()}],app),true);
  assert.equal(safeListeners([],app),false);
  for(const row of [{address:'0.0.0.0',path:app},{address:'::',path:app},
    {address:'127.0.0.1',path:'C:\\Other.exe'},{address:'127.0.0.1',path:null}])
    assert.equal(safeListeners([row],app),false);
  assert.equal(safeListeners([{address:'127.0.0.1',path:app},{address:'0.0.0.0',path:app}],app),false);
});
test('CDP rejects wrong port, remote hosts, credentials and secure/non-WebSocket schemes before connecting',async()=>{
  for(const url of ['ws://example.com:39222/devtools/page/1','ws://127.0.0.1:9222/devtools/page/1',
    'ws://user:pass@127.0.0.1:39222/devtools/page/1','wss://127.0.0.1:39222/devtools/page/1',
    'http://127.0.0.1:39222/devtools/page/1'])
    await assert.rejects(new CdpSession({webSocketDebuggerUrl:url}).connect(),/expected loopback/);
});
test('usage client blocks chat, login, reset redemption and arbitrary methods',async()=>{
  const client=new AppServerClient();
  for(const method of ['thread/start','turn/start','account/login/start','account/rateLimitResetCredit/consume','exec'])
    await assert.rejects(client.request(method,{}),/usage-only/);
});
test('stdio integration gets planType from account/read and closes its own child',async()=>{
  const client=new AppServerClient({command:process.execPath,args:[path.join(__dirname,'fake-server.cjs')]});
  try{
    await client.start();
    assert.deepEqual(formatRateLimits(client.rateLimits).rings.map(r=>r.percent),[92,44]);
    await client.refresh();
    assert.equal(client.rateLimits.planType,'plus');
  } finally{client.stop();}
  assert.equal(client.child,null);
});
test('Windows resolver respects an explicitly supplied executable',()=>{
  assert.equal(resolveCodexBin(process.execPath,'','win32'),process.execPath);
});
test('desktop GUI is launched visibly; only the CLI is hidden',()=>{
  const spec=desktopLaunchSpec('C:\\Programs\\Codex\\app\\ChatGPT.exe');
  assert.equal(spec.options.windowsHide,false);
  assert.deepEqual(spec.args,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=39222']);
  assert.equal(spec.command,'C:\\Programs\\Codex\\app\\ChatGPT.exe');
});
test('WindowsApps uses registered package activation, not forbidden direct EXE spawn',()=>{
  const spec=desktopLaunchSpec(app);
  assert.equal(spec.kind,'packaged-activation');
  assert.notEqual(spec.command,app);
  assert.match(spec.command,/powershell\.exe$/i);
  assert.equal(spec.options.cwd,path.join(__dirname,'..'));
  assert.equal(spec.options.env.CODEX_USAGE_APP_PATH,app);
  assert.equal(spec.options.env.CODEX_USAGE_ACTIVATE_DRYRUN,'0');
  assert.equal(spec.args.includes('-ExecutionPolicy'),false);
  const source=Buffer.from(spec.args.at(-1),'base64').toString('utf16le');
  assert.equal(source.charCodeAt(0)===0xFEFF,false);
  assert.match(source,/ActivateApplication/);
  assert.doesNotMatch(source,/runas|EnableDebugging|Set-ExecutionPolicy|Remove-AppxPackage/i);
});
test('package activation preflight is explicitly dry-run',()=>{
  assert.equal(desktopLaunchSpec(app,true).options.env.CODEX_USAGE_ACTIVATE_DRYRUN,'1');
});
test('internal agent host hides only its Node worker and keeps failure messages',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src','UsageAgentHost.cs'),'utf8');
  assert.match(source,/CreateNoWindow = true/);
  assert.match(source,/UseShellExecute = false/);
  assert.match(source,/MessageBox.Show/);
  assert.match(source,/child.WaitForExit\(\)/);
  assert.doesNotMatch(source,/runas|Kill\(|Set-ExecutionPolicy|Registry/i);
});
test('automatic helper uses its private agent',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src','AutoAssistant.cs'),'utf8');
  assert.match(source,/"lib","UsageAgent.exe"/);
  assert.match(source,/"--check"/);
  assert.ok(source.indexOf('preflight.WaitForExit')<source.indexOf('string app=RegisteredApp()'));
});
test('the root exposes only the automatic assistant executable',()=>{
  const root=path.join(__dirname,'..');
  assert.ok(fs.readdirSync(root).filter(name=>name.endsWith('.exe')).every(name=>name==='Codex-Usage-AutoHelper.exe'));
  assert.deepEqual(fs.readdirSync(root).filter(name=>name.endsWith('.cmd')),[]);
  const build=fs.readFileSync(path.join(root,'build-auto-helper.ps1'),'utf8');
  assert.match(build,/Codex-Usage-AutoHelper.exe/);
  assert.doesNotMatch(build,/CreateShortcut|SpecialFolder|win32icon/);
});
test('Node lookup is portable and checks the supported version',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src','UsageAgentHost.cs'),'utf8');
  assert.match(source,/GetEnvironmentVariable\("PATH"\)/);
  assert.match(source,/major < 24/);
  assert.doesNotMatch(source,/[A-Z]:\\/);
});
test('release packaging and user docs describe the current input-allowed preview',()=>{
  const root=path.join(__dirname,'..');
  const packaging=fs.readFileSync(path.join(root,'package.ps1'),'utf8');
  assert.match(packaging,/CodexUsageCard-Windows-0\.1\.4-preview\.1.zip/);
  assert.match(packaging,/Unexpected files in/);
  assert.match(packaging,/ReparsePoint/);
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
  assert.match(readme,/v0\.1\.4-windows-preview\.1/);
  assert.match(readme,/Ctrl\+Q/);
  assert.match(readme,/其他应用/);
  assert.match(fs.readFileSync(path.join(root,'windows.cjs'),'utf8'),/version:'0\.1\.4-windows-preview\.1'/);
  assert.match(readme,/可能打断/);
  assert.doesNotMatch(readme,/尚待验收|未发布改动/);
});
test('shortcut generation is local and the helper uses its management folder',()=>{
  const root=path.join(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'src','AutoAssistant.cs'),'utf8');
  assert.match(source,/CreateLoginLink\(\)/);
  assert.doesNotMatch(source,/File.Copy\(LocalLink/);
  const shortcuts=fs.readFileSync(path.join(root,'create-shortcuts.ps1'),'utf8');
  assert.match(shortcuts,/管理工具/);
  assert.doesNotMatch(shortcuts,/SpecialFolder|Startup/);
});
test('watcher is launched by desktop shell rather than inheriting the Codex launcher lifetime',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src','AutoAssistant.cs'),'utf8');
  assert.match(source,/GetTypeFromProgID\("Shell.Application"\)/);
  assert.match(source,/FindWindowSW\(0,0,8,out handle,1\)/);
  assert.match(source,/application.ShellExecute\(Exe,"--watch",Root,"open",0\)/);
  assert.match(source,/if\(mode=="--run"\)\{StartDetached\(\);return 0;\}/);
  assert.doesNotMatch(source,/Process.Start\(new ProcessStartInfo\(Exe,"--run"/);
});
test('experimental auto assistant has no force-kill or package/security modifications',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src','AutoAssistant.cs'),'utf8');
  assert.match(source,/GetForegroundWindow\(\)!=window\)return 2/);
  assert.match(source,/CanSendQuitShortcut/);
  assert.match(source,/GetAsyncKeyState/);
  assert.match(source,/ReleaseQuitInputs\(sent\)/);
  assert.doesNotMatch(source,/CloseMainWindow|SendKeys|SetForegroundWindow/);
  assert.doesNotMatch(source,/rstrtmgr|RmShutdown|RmRegisterResources|RmStartSession/);
  assert.ok(source.indexOf('if(!absent)')<source.indexOf('Log("reopening-with-card")'));
  assert.match(source,/Foreground\(\)==p.Id\) RestoreNormal\(app\)/);
  assert.match(source,/started<=baseline/);
  assert.match(source,/SaveAttempt\(lastAttempt\)/);
  assert.doesNotMatch(source,/InputStamp|GetLastInputInfo|skip-user-input/);
  assert.match(source,/stop.WaitOne\(0\) \|\| Foreground\(\)!=p.Id/);
  assert.match(source,/if\(another\)/);
  assert.doesNotMatch(source,/\.Kill\(|TerminateProcess|Set-ExecutionPolicy|EnableDebugging|takeown|icacls|runas/i);
});
function fakeChild(exitCode) {
  const child=new EventEmitter();child.unref=()=>{};
  queueMicrotask(()=>{child.emit('spawn');if(exitCode!==undefined)child.emit('exit',exitCode,null);});
  return child;
}
test('startup detects a ready debug port without opening a real app',async()=>{
  const stages=[];
  await launchDesktop({app},{spawn:()=>fakeChild(),ready:()=>true,sleep:async()=>{},report:s=>stages.push(s)});
  assert.ok(stages.includes('debug-port-ready'));
});
test('startup reports failed client process instead of silently waiting',async()=>{
  await assert.rejects(launchDesktop({app},{spawn:()=>fakeChild(5),ready:()=>false,sleep:async()=>{},report:()=>{}}),/退出码 5/);
});
test('startup reports timeout even when spawn itself succeeded',async()=>{
  let attempts=0;
  await assert.rejects(launchDesktop({app},{spawn:()=>fakeChild(),ready:()=>{attempts++;return false;},sleep:async()=>{},report:()=>{}}),/没有开启调试端口/);
  assert.equal(attempts,20);
});
test('startup propagates an OS launch error',async()=>{
  const child=new EventEmitter();
  queueMicrotask(()=>child.emit('error',Object.assign(new Error('Access denied'),{code:'EACCES'})));
  await assert.rejects(launchDesktop({app},{spawn:()=>child,report:()=>{}}),/Access denied/);
});

const readyProbe={kind:'ready',fingerprint:'test-client-1'};
const dualQuota=snapshot();
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function monitorHarness(probes=[readyProbe]) {
  let clock=0,probeCount=0;
  const states=[],logs=[],updates=[],clients=[];
  const session={evaluate:async()=>({result:{value:{placed:true}}}),close(){}};
  const injector={sessions:new Map(),currentValue:null,scans:0,
    async scan(){this.scans++;this.sessions.set('main',session);},
    async update(value){this.currentValue=value;updates.push(structuredClone(value));},
    stop(){this.sessions.clear();}};
  const h={states,logs,updates,clients,injector,probeCalls:()=>probeCount,now:()=>clock,advance:ms=>{clock+=ms;},
    probe:async()=>probes[Math.min(probeCount++,probes.length-1)],
    read:async client=>{client.emit('rate-limits',dualQuota);}};
  h.monitor=createMonitor({app,cli:'fake'}, {
    probe:(...args)=>h.probe(...args),injector,now:()=>clock,
    write:value=>states.push(structuredClone(value)),report:(...args)=>logs.push(args),
    makeClient:()=>{const c=new EventEmitter();c.stops=0;c.start=()=>h.read(c);c.refresh=()=>h.read(c);c.stop=()=>{c.stops++;};clients.push(c);return c;}
  });
  return h;
}
async function healthy(h){await h.monitor.tick();await flush();await h.monitor.tick();}

test('desktop probes distinguish absence, unknown ownership and unsafe listeners',()=>{
  const row={address:'127.0.0.1',path:app,pid:123,started:'100'};
  assert.equal(classifyProbe({appPresent:true,listeners:[row]},app).kind,'ready');
  assert.equal(classifyProbe({appPresent:false,listeners:[]},app).kind,'exited');
  assert.equal(classifyProbe({appPresent:true,listeners:[]},app).kind,'absent');
  assert.equal(classifyProbe({appPresent:null,listeners:[]},app).kind,'transient');
  assert.equal(classifyProbe({appPresent:true,listeners:[{...row,path:null}]},app).kind,'transient');
  assert.equal(classifyProbe({appPresent:true,listeners:[{...row,path:''}]},app).kind,'transient');
  for(const r of [{...row,address:'0.0.0.0'},{...row,path:'C:\\Other.exe'}])
    assert.equal(classifyProbe({appPresent:true,listeners:[r]},app).kind,'unsafe');
  for(const value of [null,{},[],{appPresent:true,listeners:[{}]}])
    assert.equal(classifyProbe(value,app).kind,'transient');
});
test('runtime PowerShell probe is asynchronous, bounded and abortable; bad output is transient',async()=>{
  const signal=new AbortController().signal;
  for(const result of ['timeout','invalid','ok']){
    const exec=(command,args,options,done)=>{
      assert.match(command,/powershell\.exe$/i);assert.equal(options.timeout,15000);
      assert.equal(options.signal,signal);assert.equal(options.windowsHide,true);
      assert.equal(options.env.CODEX_USAGE_APP_PATH,app);
      queueMicrotask(()=>done(result==='timeout'?Object.assign(new Error('timeout'),{code:'ETIMEDOUT'}):null,
        result==='ok'?JSON.stringify({appPresent:true,listeners:[]}):'not-json'));
    };
    const value=await probeDesktop(app,{exec,signal});
    assert.equal(value.kind,result==='ok'?'absent':'transient');
  }
  const result=await probeDesktop(app,{exec:(_c,_a,_o,done)=>done(Object.assign(new Error('missing'),{code:'ENOENT'}))});
  assert.equal(result.kind,'fatal');
});
test('independent exponential retry schedules cap at 30 seconds',()=>{
  assert.deepEqual([1,2,3,4,5].map(retryDelay),[5000,10000,20000,30000,30000]);
});
test('PowerShell timeout keeps monitor alive, pauses all CDP work and recovers',async()=>{
  const h=monitorHarness([readyProbe,{kind:'transient',code:'ETIMEDOUT'},readyProbe]);
  await healthy(h);assert.equal(h.updates.at(-1).mode,'dual');
  h.advance(10000);await h.monitor.tick();
  const scans=h.injector.scans,updates=h.updates.length;
  assert.equal(h.states.at(-1).state,'local-check-retrying');assert.equal(h.monitor.done,false);
  assert.equal(h.injector.sessions.size,0);
  await h.monitor.tick();assert.equal(h.injector.scans,scans);assert.equal(h.updates.length,updates);
  h.advance(5000);await healthy(h);
  assert.equal(h.states.at(-1).state,'placed');assert.equal(h.probeCalls(),3);
  await h.monitor.close();
});
test('quota failure clears both percentages, retains two rings and retries after recovery',async()=>{
  const h=monitorHarness();await healthy(h);
  h.read=async()=>{throw new Error('offline')};h.advance(60000);await h.monitor.tick();await flush();await h.monitor.tick();
  assert.equal(h.states.at(-1).state,'read-failed');
  assert.equal(h.updates.at(-1).mode,'dual');assert.deepEqual(h.updates.at(-1).rings.map(r=>r.percent),[null,null]);
  const old=h.clients[0];old.emit('rate-limits',dualQuota);await h.monitor.tick();
  assert.deepEqual(h.updates.at(-1).rings.map(r=>r.percent),[null,null]);
  h.read=async c=>c.emit('rate-limits',dualQuota);h.advance(5000);await healthy(h);
  assert.deepEqual(h.updates.at(-1).rings.map(r=>r.percent),[92,44]);
  await h.monitor.close();
});
test('port absence with a live app retries, while confirmed app exit stops normally',async()=>{
  const h=monitorHarness([{kind:'absent'},readyProbe,{kind:'exited'}]);
  await h.monitor.tick();assert.equal(h.monitor.done,false);assert.equal(h.injector.scans,0);
  h.advance(5000);await healthy(h);assert.equal(h.states.at(-1).state,'placed');
  h.advance(10000);await h.monitor.tick();assert.equal(h.monitor.done,true);
  await h.monitor.close();assert.equal(h.states.at(-1).running,false);
});
test('unsafe ownership never sends CDP operations, including cleanup',async()=>{
  const h=monitorHarness([{kind:'unsafe',code:'UNTRUSTED_LISTENER'}]);
  await assert.rejects(h.monitor.tick(),/39222/);await h.monitor.close();
  assert.equal(h.injector.scans,0);assert.equal(h.updates.length,0);
  assert.equal(h.states.at(-1).state,'security-blocked');
});
test('query retries do not overlap or emit repeated state logs',async()=>{
  const h=monitorHarness([{kind:'transient',code:'ETIMEDOUT'}]);
  await Promise.all([h.monitor.tick(),h.monitor.tick()]);assert.equal(h.probeCalls(),1);
  h.advance(5000);await h.monitor.tick();h.advance(10000);await h.monitor.tick();
  assert.equal(h.probeCalls(),3);assert.equal(h.logs.length,1);
  await h.monitor.close();
});
test('slow quota reads do not block health checks, overlap, or publish after stop',async()=>{
  const h=monitorHarness();let release;
  h.read=c=>new Promise(resolve=>{release=()=>{c.emit('rate-limits',dualQuota);resolve();};});
  await h.monitor.tick();assert.equal(h.clients.length,1);
  h.advance(10000);await h.monitor.tick();assert.equal(h.probeCalls(),2);assert.equal(h.clients.length,1);
  h.monitor.stop();release();await flush();await h.monitor.tick();await h.monitor.close();
  assert.ok(h.updates.every(v=>v.stale));
});
test('stop aborts an in-flight probe and does not clean up through unverified CDP',async()=>{
  const h=monitorHarness();let observed;
  h.probe=(_app,{signal})=>new Promise(resolve=>{observed=signal;signal.addEventListener('abort',()=>resolve({kind:'transient',code:'ABORTED'}),{once:true});});
  const pending=h.monitor.tick();h.monitor.stop();await pending;await h.monitor.close();
  assert.equal(observed.aborted,true);assert.equal(h.injector.scans,0);assert.equal(h.updates.length,0);
});
test('uncertain or unsafe ownership after a healthy connection never evaluates cleanup',async()=>{
  for(const result of [{kind:'transient',code:'UNKNOWN_OWNER'},{kind:'unsafe',code:'UNTRUSTED_LISTENER'}]){
    const h=monitorHarness([readyProbe,result]);await healthy(h);
    let evaluations=0;for(const s of h.injector.sessions.values())s.evaluate=async()=>{evaluations++;return {};};
    h.advance(10000);
    if(result.kind==='unsafe')await assert.rejects(h.monitor.tick(),/39222/);else await h.monitor.tick();
    await h.monitor.close();assert.equal(evaluations,0);
  }
});
test('long outages back off quota reads without restarting the monitor or duplicating reads',async()=>{
  const h=monitorHarness();await healthy(h);let reads=0;
  h.read=async()=>{reads++;throw new Error('offline');};
  h.advance(60000);
  for(const wait of [5000,10000,20000,30000,30000]){
    await h.monitor.tick();await flush();await h.monitor.tick();
    assert.equal(h.states.at(-1).state,'read-failed');
    assert.equal(h.states.at(-1).retryAt,h.now()+wait);
    const count=reads;h.advance(wait-1);await h.monitor.tick();await flush();assert.equal(reads,count);
    h.advance(1);
  }
  assert.equal(h.monitor.done,false);assert.equal(reads,5);await h.monitor.close();
});
test('reconnection forces a new ownership probe instead of using a cached check',async()=>{
  const h=monitorHarness([readyProbe,{kind:'unsafe',code:'UNTRUSTED_LISTENER'}]);await healthy(h);
  h.injector.sessions.clear();await assert.rejects(h.monitor.tick(),/39222/);
  assert.equal(h.probeCalls(),2);await h.monitor.close();
});
