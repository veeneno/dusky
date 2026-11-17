process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const vm = require('node:vm');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const db = require('../server/db');
const tickets = require('../server/wsTickets');
const filename = require.resolve('../server/realtime');
const timers = [];
const makeTimer = (fn, ms) => { const t = { fn, ms, active: true, unref() {} }; timers.push(t); return t; };
const context = vm.createContext({ require: createRequire(filename), module: {exports:{}}, console,
  setTimeout: makeTimer, setInterval: makeTimer,
  clearTimeout: t => { if(t) t.active=false; }, clearInterval: t => { if(t) t.active=false; },
  Date, Buffer, URL,
});
vm.runInContext(fs.readFileSync(filename,'utf8'), context, { filename });
const realtime = context.module.exports;
let server, wss, base;
const sockets = [];
const inbox = new WeakMap();
const pause = () => new Promise(r => setTimeout(r, 10));
async function until(fn) { for(let i=0;i<200;i++){ if(fn())return; await pause(); } throw Error('timeout'); }
async function connect(user=1) {
  const ws = new WebSocket(`${base}/ws?ticket=${tickets.issue(user)}`);
  inbox.set(ws,[]); ws.on('message', raw => inbox.get(ws).push(JSON.parse(raw)));
  sockets.push(ws); await once(ws,'open'); return ws;
}
async function event(ws, type) {
  await until(() => inbox.get(ws).some(x=>x.type===type));
  const q=inbox.get(ws); return q.splice(q.findIndex(x=>x.type===type),1)[0];
}
const send=(ws,type,data={})=>ws.send(JSON.stringify({type,...data}));
async function join(ws) { send(ws,'voice_join',{channelId:1}); return event(ws,'voice_channel_state'); }
async function drop(ws) {
  const closed=once(ws,'close'); ws.terminate(); await closed;
  await until(()=>timers.some(t=>t.active && t.ms===120000));
}
before(async()=>{
  db.prepare("INSERT INTO users(id,username,password_hash) VALUES(1,'owner','test'),(2,'friend','test')").run();
  db.prepare("INSERT INTO servers(id,name,owner_id) VALUES(1,'test',1)").run();
  db.prepare('INSERT INTO server_members(server_id,user_id) VALUES(1,1),(1,2)').run();
  db.prepare("INSERT INTO channels(id,name,type,server_id) VALUES(1,'voice','voice',1)").run();
  server=http.createServer(); wss=realtime.init(server); server.listen(0,'127.0.0.1');
  await once(server,'listening'); base=`ws://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  for(const ws of sockets) ws.terminate();
  for(const ws of wss.clients) ws.terminate();
  await new Promise(r=>wss.close(r)); await new Promise(r=>server.close(r)); db.close();
});
test('pong nativo mantém conexão viva sem nenhum pong do JavaScript',async()=>{
  const ws=await connect(); const peer=[...wss.clients].find(s=>s.userId===1);
  peer.lastPongAt=Date.now()-44000;
  const pong=once(peer,'pong'); timers.find(t=>t.ms===20000).fn(); await pong;
  assert.ok(Date.now()-peer.lastPongAt<1000);
  assert.equal(ws.readyState,WebSocket.OPEN);
});
test('retoma call e estado de mute; timer antigo não derruba a conexão nova',async()=>{
  const first=await connect(); const {resumeToken}=await join(first);
  send(first,'voice_update',{muted:true,deafened:true,cameraOn:false,screenOn:false});
  await event(first,'voice_state_update'); await drop(first);
  assert.equal(realtime.voiceChannelOf(1),1);
  const oldTimers=timers.filter(t=>t.active&&t.ms===120000);
  const next=await connect(); send(next,'voice_resume',{channelId:1,resumeToken});
  await event(next,'voice_channel_state');
  assert.equal(realtime.voiceOccupancy(1).find(x=>x.userId===1).muted,true);
  for(const t of oldTimers) t.fn();
  assert.equal(realtime.voiceChannelOf(1),1);
  send(next,'voice_leave'); await event(next,'voice_user_left');
  send(next,'voice_resume',{channelId:1,resumeToken}); await event(next,'voice_resume_denied');
  assert.equal(realtime.voiceChannelOf(1),null);
});
test('expulsão durante queda impede retomada',async()=>{
  const first=await connect(); const {resumeToken}=await join(first); await drop(first);
  assert.equal(realtime.disconnectUser(1,'moderator'),true);
  const next=await connect(); send(next,'voice_resume',{channelId:1,resumeToken});
  await event(next,'voice_resume_denied'); assert.equal(realtime.voiceChannelOf(1),null);
});
test('token antigo não toma a call aberta em outro aparelho',async()=>{
  const first=await connect(); const old=await join(first); await drop(first);
  const other=await connect(); const fresh=await join(other);
  const next=await connect(); send(next,'voice_resume',{channelId:1,resumeToken:old.resumeToken});
  await event(next,'voice_resume_denied'); assert.equal(realtime.voiceChannelOf(1),1);
  send(other,'voice_resume',{channelId:1,resumeToken:fresh.resumeToken}); await event(other,'voice_channel_state');
  send(other,'voice_leave'); await event(other,'voice_user_left');
});
test('prazo expira e limpa presença; perda de permissão também impede retomada',async()=>{
  const first=await connect(2); const old=await join(first); await drop(first);
  for(const t of timers.filter(t=>t.active&&t.ms===120000)){t.active=false;t.fn();}
  assert.equal(realtime.voiceChannelOf(2),null);
  const next=await connect(2); send(next,'voice_resume',{channelId:1,resumeToken:old.resumeToken});
  await event(next,'voice_resume_denied');
  const fresh=await join(next); await drop(next);
  db.prepare('DELETE FROM server_members WHERE user_id=2').run();
  const last=await connect(2); send(last,'voice_resume',{channelId:1,resumeToken:fresh.resumeToken});
  await event(last,'voice_resume_denied');
});
