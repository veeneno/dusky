const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(status=200){
  const timers=[], sockets=[]; let now=0;
  class Socket {
    static OPEN=1;
    constructor(){this.readyState=0;this.handlers={};this.sent=[];sockets.push(this);}
    addEventListener(type,fn){this.handlers[type]=fn;}
    send(data){this.sent.push(JSON.parse(data));}
    close(){this.readyState=3;}
    open(){this.readyState=1;this.handlers.open();}
  }
  const timer=(fn,ms)=>{const t={fn,ms,active:true};timers.push(t);return t;};
  const win={};
  const ctx=vm.createContext({WebSocket:Socket,window:{location:{protocol:'https:',host:'test'},addEventListener:(type,fn)=>{win[type]=fn;}},
    console:{warn(){},error(){}}, AbortSignal,
    fetch:async()=>({ok:status===200,status,json:async()=>({ticket:'test'})}),
    setTimeout:timer,setInterval:timer,clearTimeout:t=>{if(t)t.active=false;},Date:{now:()=>now},
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/realtime.js'),'utf8')+'\nthis.api=Realtime;',ctx);
  return {ctx,timers,sockets,win,api:ctx.api,advance:n=>now+=n};
}
test('503 é recuperável; 401 não gera loop de reconexão',async()=>{
  for(const status of [503,401]){const x=setup(status);await x.api.connect();assert.equal(x.timers.some(t=>t.ms===1000),status===503);}
});
test('handshake travado permite próxima tentativa, mesmo sem evento close',async()=>{
  const x=setup(); await x.api.connect(); x.timers.find(t=>t.ms===15000&&t!==x.timers[0]).fn();
  assert.ok(x.timers.some(t=>t.ms===1000)); await x.api.connect();assert.equal(x.sockets.length,2);
});
test('watchdog recupera conexão zumbi e ignora close atrasado do socket velho',async()=>{
  const x=setup();await x.api.connect();const old=x.sockets[0];old.open();
  x.advance(76000);x.timers[0].fn();await x.api.connect();const next=x.sockets[1];next.open();
  old.handlers.close({code:1006}); assert.equal(x.api.send('probe'),true);assert.equal(next.sent[0].type,'probe');
  old.handlers.message({data:JSON.stringify({type:'ping'})});assert.equal(old.sent.length,0);
  next.handlers.message({data:JSON.stringify({type:'ping'})});assert.equal(next.sent[1].type,'pong');
});
test('rede/janela voltando: troca socket mudo na hora e pula o backoff',async()=>{
  const x=setup();await x.api.connect();const first=x.sockets[0];first.open();
  const tick=()=>new Promise(r=>setImmediate(r));
  // aberto e recebendo os pings: voltar pra janela não mexe em nada
  x.advance(10000);x.win.focus();await tick();assert.equal(x.sockets.length,1);
  // mudo há mais de 45 s (o PC dormiu): troca na hora, sem esperar o vigia de 75 s
  x.advance(50000);x.win.online();await tick();
  assert.equal(first.readyState,3);assert.equal(x.sockets.length,2);
  // caiu e está esperando o backoff: a internet voltando reconecta já
  const second=x.sockets[1];second.open();second.handlers.close({code:1006});
  x.win.online();await tick();assert.equal(x.sockets.length,3);
  // socket velho fechando atrasado não atrapalha o novo
  x.sockets[2].open();first.handlers.close({code:1006});assert.equal(x.api.send('probe'),true);
});
test('listener com erro não impede a recuperação da call por outro listener',async()=>{
  const x=setup();let calls=0;x.api.on('connection_status',()=>{throw Error('UI');});
  x.api.on('connection_status',()=>calls++);await x.api.connect();x.sockets[0].open();assert.equal(calls,1);
});
test('cliente retoma sessão; sair da call não dispara nova entrada',async()=>{
  const handlers=new Map(), sent=[];
  const ctx=vm.createContext({Realtime:{connect(){},on:(type,fn)=>{if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},send:(...args)=>sent.push(args)},
    window:{addEventListener(){}}, document:{addEventListener(){}},voiceChannel:{id:1},voiceResumeToken:'token',voiceSpeakingReady:true,
    loadUnread(){},resyncOpenChannel(){},loadMembers(){},sendMyActivity(){},sendMyPresenceStatus(){},
  });
  const source=fs.readFileSync(require.resolve('../public/js/app/28-realtime.js'),'utf8');
  vm.runInContext(source.slice(0,source.indexOf('(async function init()'))+'\nwireRealtime();',ctx);
  for(const fn of handlers.get('connection_status'))fn({status:'open'});
  assert.equal(sent[0][0],'voice_resume');assert.equal(sent[0][1].resumeToken,'token');
  ctx.voiceChannel=null;ctx.voiceResumeToken=null;
  for(const fn of handlers.get('connection_status'))fn({status:'open'});
  assert.equal(sent.length,1);
});
