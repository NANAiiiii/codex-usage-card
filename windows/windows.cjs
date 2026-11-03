'use strict';
// Local Windows adapter used by the guarded helper. Never patches the installed Codex app.
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {setTimeout: delay} = require('node:timers/promises');
const {AppServerClient, RendererInjector, resolveCodexBin, formatRateLimits} = require('./lib/agent.cjs');
const ROOT = __dirname;
const RUN = path.join(ROOT, 'runtime');
const LOCK = path.join(RUN, 'active.lock');
const STOP = path.join(RUN, 'stop.request');
const STATUS = path.join(RUN, 'status.json');
const PORT = 39222;
const LAUNCH_LOG = path.join(RUN, 'assistant-start.log');

function launchLog(stage, details = {}) {
  fs.mkdirSync(RUN, {recursive:true});
  fs.appendFileSync(LAUNCH_LOG, JSON.stringify({time:new Date().toISOString(),stage,...details})+'\n');
  console.log(`[${stage}]`);
}
function desktopLaunchSpec(app, dryRun=false) {
  if (/[\\/]WindowsApps[\\/]OpenAI\.Codex_[^\\/]+[\\/]app[\\/]ChatGPT\.exe$/i.test(app)) {
    const script=fs.readFileSync(path.join(ROOT,'lib','activate-client.ps1'),'utf8').replace(/^\uFEFF/,'');
    return {kind:'packaged-activation', command:path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
      args:['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
      options:{detached:false,stdio:['ignore','pipe','pipe'],windowsHide:true,cwd:ROOT,
        env:{...process.env,CODEX_USAGE_APP_PATH:app,CODEX_USAGE_ACTIVATE_DRYRUN:dryRun?'1':'0'}}};
  }
  if(dryRun) throw new Error('非打包应用没有激活接口预检。');
  return {kind:'exe', command:app,args:['--remote-debugging-address=127.0.0.1','--remote-debugging-port=39222'],
    options:{detached:true,stdio:'ignore',windowsHide:false,cwd:path.dirname(app)}};
}
async function launchDesktop(info, deps = {}) {
  const launch = deps.spawn || spawn;
  const ready = deps.ready || debugReady;
  const sleep = deps.sleep || delay;
  const report = deps.report || launchLog;
  const spec=desktopLaunchSpec(info.app);
  report('launch-client', {app:info.app,visible:true,method:spec.kind});
  const child=launch(spec.command,spec.args,spec.options);
  let helperError='';
  if(spec.kind==='packaged-activation') {
    child.stdout?.resume();
    child.stderr?.on('data',chunk=>{helperError=(helperError+chunk.toString('utf8')).slice(-2000);});
  }
  let exit=null;
  child.once('exit',(code,signal)=>{exit={code,signal};report('client-launcher-exit',exit);});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  child.unref();
  for(let i=0;i<20;i++) {
    await sleep(1000);
    if(ready(info.app)){report('debug-port-ready');return;}
    if(exit && exit.code!==0) throw new Error(`Codex 启动进程退出，退出码 ${exit.code}。${helperError.trim()} 详见 runtime\\assistant-start.log。`);
    if(i%5===0) report('waiting-for-debug-port',{attempt:i+1,launcherExited:exit!==null});
  }
  throw new Error(`Codex 在等待结束后没有开启调试端口${exit?`（启动进程退出码 ${exit.code}）`:''}。请查看 runtime\\assistant-start.log；不会修改客户端或绕过限制。`);
}

function powershell(script) {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  script = "$ProgressPreference='SilentlyContinue'; " + script;
  return execFileSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    {encoding:'utf8', windowsHide:true, timeout:15000, maxBuffer:1024*1024, stdio:['ignore','pipe','pipe']}).trim();
}
function localConfig() {
  const file = path.join(ROOT, 'config.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}
function desktopPaths() {
  const text = powershell("[Console]::OutputEncoding=[Text.Encoding]::UTF8; @((Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -notmatch '\\\\(bin|resources|vendor)\\\\' } | Select-Object -ExpandProperty Path -Unique)) | ConvertTo-Json -Compress");
  return text ? [].concat(JSON.parse(text)).filter(Boolean) : [];
}
function discover() {
  const config = localConfig();
  let app = config.appPath;
  const running = desktopPaths();
  if (!app) app = running.find(p => /[\\/]app[\\/](ChatGPT|Codex)\.exe$/i.test(p));
  if (!app) {
    app = powershell("[Console]::OutputEncoding=[Text.Encoding]::UTF8; $p=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1; if($p){Join-Path $p.InstallLocation 'app\\ChatGPT.exe'}");
  }
  if (!app || !fs.statSync(app, {throwIfNoEntry:false})?.isFile()) {
    throw new Error('找不到 Codex 桌面程序。请在 config.json 中填写 appPath。');
  }
  const cli = resolveCodexBin(config.codexBin, app, 'win32');
  return {app, cli, running};
}
function safeListeners(rows, app) {
  const expected = path.win32.normalize(app).toLowerCase();
  return rows.length > 0 && rows.every(row =>
    ['127.0.0.1', '::1'].includes(row.address) &&
    typeof row.path === 'string' && path.win32.normalize(row.path).toLowerCase() === expected);
}
function debugReady(app) {
  // Validate the listening process BEFORE sending any requests or UI code.
  const text = powershell("[Console]::OutputEncoding=[Text.Encoding]::UTF8; @(Get-NetTCPConnection -State Listen -LocalPort 39222 -ErrorAction SilentlyContinue | ForEach-Object { $p=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [pscustomobject]@{address=$_.LocalAddress;path=$p.Path} }) | ConvertTo-Json -Compress");
  const rows = text ? [].concat(JSON.parse(text)) : [];
  if (rows.length && !safeListeners(rows, app)) {
    throw new Error('39222 端口不是指定 Codex 的纯本机监听，拒绝连接。未关闭或改动占用程序。');
  }
  return rows.length > 0;
}
function writeStatus(value) {
  fs.mkdirSync(RUN, {recursive:true});
  fs.writeFileSync(STATUS, JSON.stringify({version:'0.1.2-windows-preview.1', updatedAt:new Date().toISOString(), ...value}, null, 2));
}
function liveLock() {
  try {
    const pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) return true;
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === 'ESRCH' || e.code === 'ENOENT') return false;
    return true; // Unknown ownership/access errors must not delete a lock.
  }
}
function releaseStaleLock() {
  if (!fs.existsSync(LOCK)) return;
  if (liveLock()) throw new Error('额度后台组件已在运行，或锁的归属无法确认；不会强杀任何进程。');
  const entries = fs.readdirSync(LOCK);
  if (entries.some(name => name !== 'pid')) throw new Error('锁目录出现未知文件，拒绝自动清理。');
  fs.rmSync(path.join(LOCK, 'pid'), {force:true});
  fs.rmdirSync(LOCK);
}
async function readQuota(cli) {
  const client = new AppServerClient({command:cli, requestTimeoutMs:20000});
  try {
    await client.start();
    return formatRateLimits(client.rateLimits);
  } finally { client.stop(); }
}
async function stop(clean = false) {
  if (!fs.existsSync(RUN)) return console.log('验证版未运行，无运行记录需要清理。');
  fs.writeFileSync(STOP, 'stop');
  for (let i=0; i<30 && fs.existsSync(LOCK) && liveLock(); i++) await delay(500);
  releaseStaleLock();
  if (clean) {
    // Only known adapter-owned runtime files; never recurse over the project.
    for (const name of ['stop.request','status.json','assistant-start.log']) fs.rmSync(path.join(RUN, name), {force:true});
    if (fs.readdirSync(RUN).length === 0) fs.rmdirSync(RUN);
  }
  console.log('已停止额度后台组件并移除可连接窗口中的卡片。若客户端无响应，退出客户端即可清除内存中的卡片。');
  console.log('调试端口随本次 Codex 进程存在；请手动退出 Codex，再用原图标打开以关闭端口。');
}
async function runMonitor({app, cli}) {
  fs.mkdirSync(RUN, {recursive:true});
  releaseStaleLock();
  fs.mkdirSync(LOCK);
  fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
  fs.rmSync(STOP, {force:true});
  const injector = new RendererInjector({port:PORT});
  const client = new AppServerClient({command:cli, requestTimeoutMs:20000});
  let stopping = false, nextRead = 0, lastCheck = 0, value = null, started = false, failures = 0;
  const signal = () => { stopping = true; };
  process.on('SIGINT', signal);
  process.on('SIGTERM', signal);
  client.on('server-exit', () => { started=false; nextRead=0; });
  client.on('rate-limits', data => {
    value = {...formatRateLimits(data), updatedAt:Date.now(), stale:false};
    injector.update(value).catch(() => {});
  });
  console.log('自动助手的额度后台组件运行中；客户端完全退出后停止，不会主动关闭 Codex。');
  try {
    while (!stopping && !fs.existsSync(STOP)) {
      if (Date.now()-lastCheck > 10000) {
        if (!debugReady(app)) break;
        lastCheck = Date.now();
      }
      try {
        await injector.scan();
        if (injector.sessions.size && Date.now() >= nextRead) {
          if (!started) { await client.start(); started=true; }
          else await client.refresh();
          failures=0;
          nextRead=Date.now()+60000;
        }
        const placements = await Promise.all([...injector.sessions.values()].map(async s => {
          try { return (await s.evaluate('window.__codexUsageBadge?.status() ?? null')).result?.value; }
          catch { return null; }
        }));
        // Keep only quota/placement metadata. Never save page text, chats or account identifiers.
        writeStatus({running:true, connectedWindows:injector.sessions.size,
          placedWindows:placements.filter(p => p?.placed).length,
          quota:value && {mode:value.mode, rings:value.rings?.map(r=>({label:r.label,percent:r.percent})), updatedAt:value.updatedAt},
          state:injector.sessions.size ? placements.some(p=>p?.placed) ? 'placed' : 'sidebar-not-found' : 'main-window-not-found'});
      } catch {
        failures++;
        client.stop(); started=false;
        value=null;
        await injector.update({percent:null,mode:'single',rings:null,tone:'muted',stale:true,title:'读取失败，正在重试'});
        writeStatus({running:true,state:'read-failed',connectedWindows:injector.sessions.size});
        await delay(Math.min(30000, failures*5000));
      }
      await delay(2000);
    }
  } finally {
    client.stop();
    await Promise.allSettled([...injector.sessions.values()].map(s => s.evaluate('window.__codexUsageBadge?.destroy()')));
    injector.stop();
    writeStatus({running:false,state:'stopped'});
    fs.rmSync(path.join(LOCK,'pid'), {force:true});
    fs.rmdirSync(LOCK);
    process.off('SIGINT',signal); process.off('SIGTERM',signal);
    console.log('验证已停止。请退出本次 Codex 进程以关闭本机调试端口。');
  }
}
async function main(command = process.argv[2] || 'doctor') {
  if (process.platform !== 'win32') throw new Error('此入口仅用于 Windows。');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或以上版本。');
  if (command === 'stop' || command === 'clean') return stop(command === 'clean');
  if(command==='start' || command==='background') launchLog('start-request',{node:process.version,background:command==='background'});
  const info = discover();
  if(command==='background' && fs.existsSync(LOCK) && liveLock()) {
    const spec=desktopLaunchSpec(info.app);
    if(spec.kind==='packaged-activation') {
      spec.options.env.CODEX_USAGE_FOCUS_ONLY='1';
      execFileSync(spec.command,spec.args,{...spec.options,timeout:30000,stdio:['ignore','pipe','pipe']});
    }
    launchLog('already-running');
    return;
  }
  if(command==='check-launcher') {
    const spec=desktopLaunchSpec(info.app,true);
    console.log(execFileSync(spec.command,spec.args,{...spec.options,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
    return;
  }
  if (command === 'probe') {
    const quota = await readQuota(info.cli);
    console.log(JSON.stringify(quota, null, 2));
    return;
  }
  if (command === 'doctor') {
    console.log(JSON.stringify({node:process.version, app:info.app, cli:info.cli,
      desktopProcesses:info.running.length, debugReady:debugReady(info.app),
      monitorRunning:fs.existsSync(LOCK) && liveLock(),
      lastStatus:fs.existsSync(STATUS) ? JSON.parse(fs.readFileSync(STATUS,'utf8')) : null}, null, 2));
    return;
  }
  if (command !== 'start' && command !== 'background') throw new Error('可用命令：doctor / probe / start / background / stop / clean');
  launchLog('discovery-complete',{app:info.app,cli:info.cli,desktopPaths:info.running});
  releaseStaleLock();
  if (!debugReady(info.app)) {
    if (info.running.length) throw new Error('Codex 仍在运行，包括可能留在后台的进程。请从客户端菜单或托盘完全退出后再启动；仅关闭窗口可能不够。详见 runtime\\assistant-start.log。');
    console.log('即将为本次 Codex 进程启用仅本机调试端口 39222。不要运行不可信本机软件或转发端口。');
    await launchDesktop(info);
  }
  return runMonitor(info);
}
function reportFailure(e) {
  try { launchLog('error',{message:e.message,code:e.code || null}); } catch {}
  console.error(e.message);
  process.exitCode=1;
}
module.exports = {safeListeners, desktopLaunchSpec, launchDesktop, main};
if (require.main === module) main().catch(reportFailure);
