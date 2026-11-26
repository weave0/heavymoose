// Restore Git-ignored streaming assets from the current label-owned deployment.
// SHA-256 pins each file. The build never substitutes or silently drops audio.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
async function main(){
 const assets=JSON.parse(fs.readFileSync(path.join(root,'listen/media-assets.json'),'utf8'));
 for(const asset of assets){
  if(!/^assets\/audio\/listen\/[a-z0-9/-]+\.mp3$/.test(asset.path))throw Error('Invalid media path');
  const target=path.resolve(root,asset.path);
  if(!target.startsWith(path.join(root,'assets/audio/listen')+path.sep))throw Error('Unsafe media destination');
  let bytes=fs.existsSync(target)?fs.readFileSync(target):null;
  if(!bytes){const response=await fetch(new URL(asset.path,'https://listen.heavymoose.com/'),{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Published media missing: '+asset.path);bytes=Buffer.from(await response.arrayBuffer());}
  if(bytes.length!==asset.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Media integrity check failed: '+asset.path);
  if(!fs.existsSync(target)){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 }
 console.log(`${assets.length} artist streaming files verified (kept out of GitHub).`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
