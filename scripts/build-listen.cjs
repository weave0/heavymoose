const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const out = path.join(root,'dist/listen');
if(!out.startsWith(root+path.sep) || path.relative(root,out)!==path.join('dist','listen'))throw Error('Unsafe output directory');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
fs.cpSync(path.join(root,'listen'),out,{recursive:true});
const catalog = JSON.parse(fs.readFileSync(path.join(root,'listen/catalog.json'),'utf8'));
const files = new Set(['assets/favicon/apple-touch-icon.png',...catalog.artists.map(a=>a.image),...catalog.albums.map(a=>a.cover),...catalog.tracks.map(t=>t.src)]);
for(const url of files) {
  if(!url.startsWith('./assets/') && !url.startsWith('assets/')) continue;
  const relative = url.replace(/^\.\//,'');
  const source = path.resolve(root,relative);
  if(!source.startsWith(path.join(root,'assets')+path.sep)) throw Error('Unsafe asset path '+url);
  if(fs.statSync(source).size > 25*1024*1024) throw Error('Pages asset exceeds 25 MiB: '+url);
  const target = path.join(out,relative);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
}
console.log('Listening Room ready in dist/listen (isolated static deployment)');
