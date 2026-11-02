'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {formatRateLimits,isMainWindow,CdpSession,AppServerClient,resolveCodexBin,unavailableValue}=require('../lib/agent.cjs');
const {safeListeners,desktopLaunchSpec,launchDesktop}=require('../windows.cjs');
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
  assert.match(source,/RmShutdown\(session,0,IntPtr.Zero\)/);
  assert.match(source,/started<=baseline/);
  assert.match(source,/SaveAttempt\(lastAttempt\)/);
  assert.match(source,/InputStamp\(\)!=stamp/);
  assert.match(source,/inputAfterStartMs=/);
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
