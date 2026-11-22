process.env.DUSKY_DB_PATH=':memory:';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const express=require('express'),db=require('../server/db');
const {UPLOADS_ROOT}=require('../server/upload');
const files=[];let server,base,html,png,avatar;
function make(folder,ext,body){const name=crypto.randomBytes(16).toString('hex')+ext;const file=path.join(UPLOADS_ROOT,folder,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);files.push(file);return '/uploads/'+folder+'/'+name;}
before(async()=>{
 for(let i=1;i<=3;i++) db.prepare('INSERT INTO users(id,username,password_hash) VALUES(?,?,?)').run(i,'upload-test-'+i,'unused');
 db.prepare("UPDATE users SET email = username || '@teste.local' WHERE email IS NULL").run(); // conta sem e-mail confirmado fica presa na tela de confirmar
 db.prepare("INSERT INTO servers(id,name,owner_id) VALUES(1,'test',1)").run();
 db.prepare('INSERT INTO server_members(server_id,user_id) VALUES(1,1),(1,2)').run();
 db.prepare("INSERT INTO channels(id,name,type,server_id) VALUES(1,'chat','text',1),(2,'dm','text',NULL)").run();
 db.prepare('INSERT INTO dm_members(channel_id,user_id) VALUES(2,1),(2,2)').run();
 html=make('attachments','.html','<script>window.marker=true</script>');
 png=make('attachments','.png',Buffer.from('89504e470d0a1a0a','hex'));avatar=make('avatars','.svg','<svg></svg>');
 db.prepare('INSERT INTO messages(channel_id,user_id,content,attachment_url) VALUES(1,1,?,?),(2,1,?,?)').run('',html,'',png);
 const app=express();app.use((req,res,next)=>{req.session={userId:Number(req.headers['x-test-user']),sv:0};next();});
 app.use(require('../server/routes/uploads'));app.use(express.static(path.join(__dirname,'../public')));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(r=>server.close(r));for(const f of files)fs.unlinkSync(f);db.close();});
function get(url,user,options={}){return fetch(base+url,{...options,headers:{...(user?{'x-test-user':String(user)}:{}),...options.headers}});}
test('HTML exige permissão e baixa como octet-stream com sandbox',async()=>{
 assert.equal((await get(html)).status,401);assert.equal((await get(html,3)).status,404);
 const r=await get(html,2);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/octet-stream/);
 assert.match(r.headers.get('content-disposition'),/^attachment/);assert.match(r.headers.get('content-security-policy'),/sandbox/);
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('cache-control'),'private, no-cache');
});
test('URL codificada, barras duplicadas e HEAD não contornam autenticação',async()=>{
 for(const url of [html.replace('/uploads/','/%75ploads/'),html.replace('/attachments/','%2fattachments%2f'),html.replace('/uploads/','//uploads//')])assert.equal((await get(url)).status,401);
 assert.equal((await get(html,undefined,{method:'HEAD'})).status,401);
});
test('imagem de DM mantém Range e bloqueia não participante',async()=>{
 assert.equal((await get(png,3)).status,404);
 const r=await get(png,2,{headers:{Range:'bytes=0-3'}});assert.equal(r.status,206);assert.match(r.headers.get('content-type'),/image\/png/);assert.equal((await r.arrayBuffer()).byteLength,4);
});
test('revogação de acesso vale mesmo para URL já conhecida',async()=>{
 db.prepare('DELETE FROM server_members WHERE user_id=2').run();assert.equal((await get(html,2)).status,404);
 db.prepare('DELETE FROM dm_members WHERE user_id=2').run();assert.equal((await get(png,2)).status,404);
});
test('SVG de perfil não vira página ativa; arquivo sem mensagem não é público',async()=>{
 const r=await get(avatar);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, max-age=31536000, immutable');assert.match(r.headers.get('content-type'),/octet-stream/);assert.match(r.headers.get('content-disposition'),/^attachment/);
 db.prepare('DELETE FROM messages WHERE attachment_url=?').run(html);assert.equal((await get(html,1)).status,404);
});
