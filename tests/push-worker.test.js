const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/sw.js'), 'utf8');
function worker({ windows = [], responseOk = true, responseUser = 2 } = {}) {
  const handlers = {}, notices = [], opened = [], requests = [];
  const self = {
    addEventListener: (name, fn) => { handlers[name] = fn; },
    registration: { pushManager: { getSubscription: async () => ({endpoint:'https://fcm.googleapis.com/test'}) }, showNotification: async (...args) => notices.push(args) },
    clients: { matchAll: async () => windows, openWindow: async url => opened.push(url) },
  };
  vm.runInNewContext(source, { self, URL, fetch: async (url, opts) => {
    requests.push({url,opts});
    return {ok:responseOk,json:async()=>({userId:responseUser,channelId:10,serverId:1,messageId:20,title:'mensagem',body:'olá'})};
  } });
  async function dispatch(name, event) { let done; handlers[name]({...event,waitUntil:p=>{done=p;}}); await done; }
  return {dispatch,notices,opened,requests};
}
test('push sem nenhuma aba mostra notificação e clique abre mensagem',async()=>{
  const w=worker();await w.dispatch('push',{data:{json:()=>({userId:2,messageId:20})}});
  assert.equal(w.notices.length,1);assert.equal(w.notices[0][1].body,'olá');
  assert.equal(w.requests[0].opts.credentials,'include');
  let closed=false;await w.dispatch('notificationclick',{notification:{data:w.notices[0][1].data,close:()=>{closed=true;}}});
  assert.ok(closed);assert.equal(w.opened[0],'/app.html?pushChannel=10&pushServer=1&pushMessage=20');
});
test('página em foco não duplica aviso; aba em segundo plano recebe',async()=>{
  for(const focused of [true,false]){
    const w=worker({windows:[{url:'https://example.com/app.html',focused}]});
    await w.dispatch('push',{data:{json:()=>({userId:2,messageId:20})}});assert.equal(w.notices.length,focused?0:1);
  }
});
test('logout, acesso revogado ou troca de conta não expõem conteúdo',async()=>{
  for(const config of [{responseOk:false},{responseUser:3}]){
    const w=worker(config);await w.dispatch('push',{data:{json:()=>({userId:2,messageId:20})}});assert.equal(w.notices.length,0);
  }
});
test('clique reutiliza aba aberta e manda a localização da mensagem',async()=>{
  const messages=[];let focused=false;
  const w=worker({windows:[{url:'https://example.com/app.html',postMessage:d=>messages.push(d),focus:async()=>{focused=true;}}]});
  await w.dispatch('notificationclick',{notification:{data:{channelId:10,serverId:null,messageId:20},close(){}}});
  assert.ok(focused);assert.equal(messages[0].type,'push_open');assert.equal(w.opened.length,0);
});
test('Web Push gera requisição assinada e criptografada sem enviar para a rede',()=>{
  const webpush=require('web-push'),crypto=require('node:crypto');const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
  const request=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}},JSON.stringify({messageId:20,userId:2}),{vapidDetails:{subject:'https://dusky.veneno.space',...webpush.generateVAPIDKeys()},TTL:300});
  assert.ok(request.headers.Authorization);assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert.ok(request.body.length>0);
});
