// Prévia externa: valida TODOS os IPs e fixa a conexão nos endereços validados.
// Usar fetch depois de dns.lookup permitiria uma segunda resolução (DNS rebinding).
const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');
const { Readable } = require('stream');
const blocked = new net.BlockList();
for (const [ip, bits] of [ ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
  ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24], ['192.168.0.0',16],
  ['198.18.0.0',15], ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',3] ]) blocked.addSubnet(ip,bits,'ipv4');
const globalV6 = new net.BlockList(); globalV6.addSubnet('2000::',3,'ipv6');
for (const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) blocked.addSubnet(ip,bits,'ipv6');
function isPublicIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip,'ipv4');
  // IPv4 mapeado, loopback, link-local, ULA e NAT64 não entram na faixa global permitida.
  return family === 6 && globalV6.check(ip,'ipv6') && !blocked.check(ip,'ipv6');
}
async function resolvePublic(url, lookup = dns.lookup) {
  const u = new URL(url);
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password) throw Error('URL não permitida');
  if (u.port && !['80','443'].includes(u.port)) throw Error('porta não permitida');
  const hostname = u.hostname.replace(/^\[|\]$/g,'');
  const addresses = net.isIP(hostname) ? [{address:hostname,family:net.isIP(hostname)}] : await lookup(hostname,{all:true});
  if (!addresses.length || addresses.some(a=>!isPublicIp(a.address))) throw Error('endereço não permitido');
  return { u, hostname, addresses };
}
function pinnedLookup(addresses) {
  return (_host, options, cb) => {
    const family = typeof options === 'number' ? options : options.family;
    const eligible = addresses.filter(a=>!family || a.family===family);
    if (!eligible.length) return cb(Error('família de endereço indisponível'));
    if (options.all) return cb(null,eligible);
    cb(null,eligible[0].address,eligible[0].family);
  };
}
async function safeFetch(url, opts = {}) {
  let current = url;
  for (let hop=0;hop<5;hop++) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),6000);
    timer.unref();
    try {
      const resolved = await Promise.race([
        resolvePublic(current),
        new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('tempo esgotado')),{once:true})),
      ]);
      const {u,hostname,addresses}=resolved;
      const msg = await new Promise((resolve,reject)=>{
        const req=(u.protocol==='https:'?https:http).get(u, {
          hostname, agent:false, lookup:pinnedLookup(addresses), signal:controller.signal,
          headers:{'User-Agent':'dusky link preview','Accept-Language':'pt-BR,pt;q=0.9',...opts.headers},
        },resolve);
        req.on('error',reject);
      });
      const status=msg.statusCode;
      if (status>=300 && status<400 && msg.headers.location) {
        const next=new URL(msg.headers.location,current).href;
        msg.destroy();clearTimeout(timer);current=next;continue;
      }
      msg.once('end',()=>clearTimeout(timer));msg.once('close',()=>clearTimeout(timer));
      const headers=new Headers();
      for(const [key,value] of Object.entries(msg.headers)) if(value!==undefined) headers.set(key,Array.isArray(value)?value.join(', '):value);
      return {res:{status,ok:status>=200&&status<300,headers,body:Readable.toWeb(msg)},finalUrl:current};
    } catch(err) { clearTimeout(timer);controller.abort();throw err; }
  }
  throw Error('redirecionamentos demais');
}
module.exports={safeFetch,isPublicIp,resolvePublic,pinnedLookup};
