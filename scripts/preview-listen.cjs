// Local-only static server; supports seeking with HTTP byte ranges.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist/listen');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg'};
http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404).end();return;}
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
    let start=0,end=stat.size-1,status=200;
    if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416).end();return;}start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);
  });
}).listen(3001,'127.0.0.1',()=>console.log('Listening Room: http://127.0.0.1:3001'));
