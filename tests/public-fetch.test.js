const {test}=require('node:test');const assert=require('node:assert/strict');
const {isPublicIp,resolvePublic,pinnedLookup}=require('../server/publicFetch');
test('bloqueia internos, reservados e formas IPv6 de IPv4',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','192.168.15.33','169.254.169.254','100.64.0.1','0.0.0.0','198.18.0.1','224.0.0.1','::1','::','fc00::1','fe80::1','::ffff:127.0.0.1','::ffff:7f00:1','64:ff9b::7f00:1','2002:7f00:1::','2001:db8::1'])assert.equal(isPublicIp(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888'])assert.equal(isPublicIp(ip),true,ip);
});
test('DNS com qualquer resposta interna é rejeitado; protocolos e credenciais também',async()=>{
 const lookup=async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}];
 await assert.rejects(resolvePublic('https://example.com',lookup));
 for(const url of ['file:///etc/passwd','http://[::ffff:7f00:1]','http://127.1','http://2130706433','http://0x7f000001','https://user:pass@example.com','http://example.com:3000'])await assert.rejects(resolvePublic(url,lookup));
});
test('lookup da conexão reutiliza os IPs validados sem resolver DNS novamente',async()=>{
 let calls=0;const lookup=async()=>{calls++;return [{address:calls===1?'8.8.8.8':'127.0.0.1',family:4}];};
 const {addresses}=await resolvePublic('https://example.com',lookup);
 const connect=pinnedLookup(addresses);
 for(let i=0;i<2;i++)await new Promise((resolve,reject)=>connect('example.com',{},(err,ip)=>{if(err)return reject(err);assert.equal(ip,'8.8.8.8');resolve();}));
 assert.equal(calls,1);
});
test('redirect para rede interna é recusado antes de conectar ao segundo destino',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),{PassThrough}=require('node:stream'),{EventEmitter}=require('node:events');
 const file=require.resolve('../server/publicFetch');let calls=0;
 const fake={get(_url,options,cb){calls++;assert.equal(typeof options.lookup,'function');const req=new EventEmitter();
  setImmediate(()=>{const msg=new PassThrough();msg.statusCode=302;msg.headers={location:'http://[::ffff:7f00:1]/'};cb(msg);});return req;}};
 const ctx=vm.createContext({require:id=>id==='https'||id==='http'?fake:require(id),module:{exports:{}},URL,Headers,AbortController,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 await assert.rejects(ctx.module.exports.safeFetch('https://8.8.8.8/'));assert.equal(calls,1);
});
