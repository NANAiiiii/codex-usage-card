'use strict';
// Test-only stdio server: never authenticates or opens network connections.
const readline=require('node:readline');
readline.createInterface({input:process.stdin}).on('line', line => {
  const request=JSON.parse(line);
  if (request.id === undefined) return;
  let result={};
  if (request.method==='account/read') result={account:{type:'chatgpt',planType:'plus'}};
  if (request.method==='account/rateLimits/read') result={rateLimits:{limitId:'codex',
    primary:{usedPercent:8,windowDurationMins:300,resetsAt:1800000000},
    secondary:{usedPercent:56,windowDurationMins:10080,resetsAt:1800100000}}};
  process.stdout.write(JSON.stringify({id:request.id,result})+'\n');
});
