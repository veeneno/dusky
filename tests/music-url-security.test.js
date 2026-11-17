const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(){const calls=[];const ctx=vm.createContext({module:{exports:{}},URL,console,require:id=>{
 if(id==='child_process')return {execFile:(_bin,args,_opts,cb)=>{calls.push(args);cb(null,JSON.stringify({id:'abc12345678',title:'test',webpage_url:'https://www.youtube.com/watch?v=abc12345678'}),'');}};
 if(id==='./binaries')return {ensureYtDlp:async()=>'/test/yt-dlp'};
 if(id==='../../config')return {};if(id==='../../limits')return require('../server/limits');throw Error(id);
 }});vm.runInContext(fs.readFileSync(require.resolve('../server/bots/musicBot/resolve'),'utf8'),ctx);return {api:ctx.module.exports,calls};}
test('links disfarçados de YouTube não chegam ao downloader',async()=>{
 const {api,calls}=setup();for(const url of ['http://127.0.0.1/?list=abc','https://evil.example/youtube.com/watch?v=abc12345678','https://youtube.com.evil.example/watch?v=abc12345678','https://user:pass@youtube.com/watch?v=abc12345678'])await assert.rejects(api.resolveInput(url,1));assert.equal(calls.length,0);
});
test('links reais são canonicalizados e pesquisa não vira opção de processo',async()=>{
 const {api,calls}=setup();await api.resolveInput('https://youtu.be/abc12345678?t=1',1);
 assert.equal(calls[0].at(-1),'https://www.youtube.com/watch?v=abc12345678');
 await api.resolveInput('--exec=anything',1);assert.equal(calls[1].at(-1),'ytsearch1:--exec=anything');
});
