// HTTP real + SQLite em memória: nunca lê ou altera o banco do servidor em uso.
process.env.DUSKY_DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../server/db');
const access = require('../server/access');
const push = require('../server/push');
let server, base;
const sent = [];
push.transport.send = async (sub, payload) => { sent.push({ sub, payload: JSON.parse(payload) }); };
before(async () => {
  for (let i = 1; i <= 5; i++) db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(i, 'user'+i, 'test');
  db.prepare("UPDATE users SET email = username || '@teste.local' WHERE email IS NULL").run(); // conta sem e-mail confirmado fica presa na tela de confirmar
  db.prepare("INSERT INTO servers (id, name, owner_id) VALUES (1, 'one', 1), (2, 'two', 5)").run();
  for (let i = 1; i <= 4; i++) db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (1, ?)').run(i);
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (2, 5)').run();
  db.prepare(`INSERT INTO channels (id, name, type, server_id) VALUES (1,'geral','text',1),(2,'voz','voice',1),(3,'outro','text',2),(4,'dm','text',NULL)`).run();
  db.prepare('INSERT INTO dm_members (channel_id,user_id) VALUES (4,1),(4,2)').run();
  db.prepare(`INSERT INTO roles (id,server_id,name,is_admin,permissions_json) VALUES (1,1,'admin',1,'{}'),(2,1,'moderador',0,'{"manage_channels":true,"manage_messages":true,"kick_members":true,"moderate_voice":true}'),(3,1,'membro',0,'{}'),(4,2,'outro',0,'{}')`).run();
  db.prepare('INSERT INTO member_roles (server_id,user_id,role_id) VALUES (1,2,2),(1,3,3),(1,4,1)').run();
  const app = express(); app.use(express.json());
  app.use((req,res,next) => { req.session = {userId:Number(req.headers['x-user']),sv:0};next(); });
  app.use('/api/servers/:serverId/categories',require('../server/routes/categories'));
  app.use('/api/servers',require('../server/routes/servers'));
  app.use('/api/channels',require('../server/routes/channels'));
  app.use('/api/channels/:channelId/messages',require('../server/routes/messages'));
  app.use('/api/push',require('../server/routes/push'));
  server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); base='http://127.0.0.1:'+server.address().port;
});
after(async () => { await new Promise(r=>server.close(r)); db.close(); });
async function api(user, method, path, body) {
  const res=await fetch(base+'/api'+path,{method,headers:{'x-user':String(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>null); return {status:res.status,data};
}
test('permissões são independentes de admin e não concedem acesso a outro servidor',async()=>{
  assert.equal(access.isServerAdmin(1,2),false);
  assert.equal(access.hasServerPermission(1,2,'manage_channels'),true);
  assert.equal(access.hasServerPermission(2,2,'manage_channels'),false);
  assert.equal((await api(2,'POST','/servers/1/roles',{name:'hack',is_admin:true})).status,403);
  assert.equal((await api(4,'POST','/servers/1/roles',{name:'hack',is_admin:true})).status,403);
  assert.equal((await api(3,'POST','/servers/1/channels',{name:'hack',type:'text'})).status,403);
  assert.equal((await api(2,'POST','/servers/1/channels',{name:'novo',type:'text'})).status,201);
});
test('categorias: isolamento, mudança atômica e exclusão preservando canal/histórico',async()=>{
  assert.equal((await api(3,'POST','/servers/1/categories',{name:'x'})).status,403);
  const cat=await api(2,'POST','/servers/1/categories',{name:'Jogos'});assert.equal(cat.status,201);
  const foreign=await api(5,'POST','/servers/2/categories',{name:'privado'});
  assert.equal((await api(2,'PATCH','/channels/1',{name:'não salvar',category_id:foreign.data.id})).status,400);
  assert.equal(access.getChannel(1).name,'geral');
  assert.equal((await api(2,'PATCH','/channels/1',{category_id:cat.data.id,position:2})).status,200);
  db.prepare("INSERT INTO messages (channel_id,user_id,content) VALUES (1,1,'preservar')").run();
  assert.equal((await api(2,'PATCH','/servers/1/categories/'+cat.data.id,{name:'Comunidade',position:3})).status,200);
  const list=await api(3,'GET','/servers/1/channels'); assert.equal(list.data.categories[0].name,'Comunidade');
  assert.equal((await api(2,'DELETE','/servers/1/categories/'+foreign.data.id)).status,404);
  assert.equal((await api(2,'DELETE','/servers/1/categories/'+cat.data.id)).status,200);
  assert.equal(access.getChannel(1).category_id,null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM messages WHERE channel_id=1').get().n,1);
});
test('restrições de texto são aplicadas no servidor e cargos não atravessam servidores',async()=>{
  const config={private_send:true,send_role_ids:[2],private_attach:true,attach_role_ids:[],private_react:true,react_role_ids:[2],private_pin:true,pin_role_ids:[2]};
  assert.equal((await api(1,'PATCH','/channels/1',config)).status,200);
  assert.equal((await api(1,'PATCH','/channels/1',{name:'inválido',send_role_ids:[4]})).status,400);
  assert.equal(access.getChannel(1).name,'geral');
  assert.equal((await api(3,'POST','/channels/1/messages',{content:'negado'})).status,403);
  assert.equal((await api(2,'POST','/channels/1/messages/attachment')).status,403);
  assert.equal((await api(2,'POST','/channels/1/messages/gif',{url:'https://media.giphy.com/a.gif'})).status,403);
  const posted=await api(2,'POST','/channels/1/messages',{content:'permitido'});assert.equal(posted.status,201);
  const id=posted.data.message.id;
  assert.equal((await api(3,'PUT',`/channels/1/messages/${id}/reactions/👍`)).status,403);
  assert.equal((await api(2,'PUT',`/channels/1/messages/${id}/reactions/👍`)).status,200);
  assert.equal((await api(3,'PUT',`/channels/1/messages/${id}/pin`)).status,403);
  assert.equal((await api(1,'POST','/channels/1/messages',{content:'dono ignora restrição'})).status,201);
  assert.equal((await api(3,'POST','/channels/4/messages',{content:'fora da dm'})).status,404);
  assert.equal((await api(2,'POST','/channels/4/messages',{content:'dm normal'})).status,201);
  assert.equal((await api(3,'DELETE',`/channels/1/messages/${id}`)).status,403);
  assert.equal((await api(2,'DELETE','/channels/1/messages/1')).status,200);
});
test('visibilidade prevalece sobre grants e revogação de cargo é imediata',async()=>{
  await api(1,'PATCH','/channels/1',{private_view:true,view_role_ids:[2]});
  assert.equal(access.canAccessChannel(1,3),null);
  assert.equal(access.channelAudience(1).includes(3),false);
  assert.equal((await api(3,'GET','/channels/1/messages')).status,404);
  db.prepare('DELETE FROM member_roles WHERE user_id=2').run();
  assert.equal(access.hasServerPermission(1,2,'manage_channels'),false);
  assert.equal(access.canAccessChannel(1,2),null);
  assert.equal((await api(2,'PATCH','/channels/2',{name:'negado'})).status,403);
  db.prepare('INSERT INTO member_roles (server_id,user_id,role_id) VALUES (1,2,2)').run();
});
test('push: assinatura, filtros, sessão, acesso atual, limpeza de endpoint expirado',async()=>{
  const crypto=require('node:crypto');const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  assert.equal((await api(2,'POST','/push/subscription',{subscription:{...subscription,endpoint:'https://127.0.0.1/private'},level:'all'})).status,400);
  assert.equal((await api(2,'POST','/push/subscription',{subscription,level:'mentions'})).status,200);
  const post=await api(1,'POST','/channels/1/messages',{content:'oi <@2>'});const m=post.data.message;
  await push.notifyMessage(m);assert.ok(sent.some(s=>s.payload.messageId===m.id));
  assert.equal(Object.hasOwn(sent.at(-1).payload,'body'),false);
  const url='/push/message/'+m.id+'?endpoint='+encodeURIComponent(subscription.endpoint);
  assert.equal((await api(2,'GET',url)).status,200);
  assert.equal((await api(3,'GET',url)).status,404);
  db.prepare('UPDATE users SET session_version=1 WHERE id=2').run();
  const sub=db.prepare('SELECT * FROM push_subscriptions').get();assert.equal(push.eligible(sub,m),false);
  db.prepare('UPDATE users SET session_version=0 WHERE id=2').run();
  await api(1,'PATCH','/channels/1',{view_role_ids:[]});assert.equal((await api(2,'GET',url)).status,404);
  await api(1,'PATCH','/channels/1',{view_role_ids:[2]});
  push.transport.send=async()=>{throw {statusCode:410}};await push.notifyMessage(m);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
  assert.deepEqual(push.getKeys(),push.getKeys());
});
