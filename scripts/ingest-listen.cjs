// node scripts/ingest-listen.cjs "C:\Music\Artist\Album" [--apply]
// Validates everything first. Without --apply, leaves the repository untouched.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),folder=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Provide one album directory containing album.json, cover.jpg and MP3 files.');
const input=JSON.parse(fs.readFileSync(path.join(folder,'album.json'),'utf8'));
const validId=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
if(!validId(input.id)||!validId(input.artist?.id)||!input.title||!input.artist.name||!Array.isArray(input.tracks)||!input.tracks.length)throw Error('Album id, artist id/name, title and tracks are required. IDs use lowercase letters, digits and hyphens.');
if(input.streamingAllowed!==true)throw Error('Set streamingAllowed:true only for recordings you control or have permission to stream.');
const catalogFile=path.join(root,'listen/catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
if(catalog.albums.some(a=>a.id===input.id))throw Error('Album already exists. Update its existing manifest entry rather than overwriting it.');
const source=name=>{if(typeof name!=='string'||path.basename(name)!==name||name==='.'||name==='..')throw Error('Files must be directly inside the album directory.');return path.join(folder,name);};
const cover=source(input.cover||'cover.jpg');
if(!/\.(png|jpe?g)$/i.test(cover))throw Error('Use a JPG or PNG cover.');
const jobs=[{from:cover,to:`assets/images/listen/${input.id}${path.extname(cover).toLowerCase()}`}];
const tracks=input.tracks.map((t,i)=>{
  const from=source(t.file),bytes=fs.readFileSync(from);
  if(!/\.mp3$/i.test(from)||!t.title||!(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))throw Error('Invalid MP3/title: '+t.file);
  if(bytes.length>25*1024*1024)throw Error('MP3 exceeds the 25 MiB Pages limit: '+t.file);
  const to=`assets/audio/listen/${input.artist.id}/${input.id}/${String(i+1).padStart(2,'0')}.mp3`;jobs.push({from,to});
  return {id:`${input.artist.id}-${input.id}-${i+1}`,artistId:input.artist.id,albumId:input.id,title:t.title,src:'./'+to,downloadAllowed:input.downloadAllowed===true};
});
for(const job of jobs){if(fs.existsSync(path.join(root,job.to)))throw Error('Destination exists: '+job.to);if(fs.statSync(job.from).size>25*1024*1024)throw Error('Asset exceeds 25 MiB');}
const album={id:input.id,artistId:input.artist.id,title:input.title,year:String(input.year||new Date().getFullYear()),releaseDate:String(input.releaseDate||input.year||''),genre:input.genre||'Independent',cover:'./'+jobs[0].to,expectedTracks:tracks.length,tracks:tracks.map(t=>t.id)};
console.log(`Validated ${input.artist.name} / ${input.title}: ${tracks.length} songs. Download permission: ${input.downloadAllowed===true}.`);
if(!process.argv.includes('--apply')){console.log('Dry run only. Add --apply to import.');process.exit(0);}
for(const job of jobs){const to=path.join(root,job.to);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(job.from,to);}
if(!catalog.artists.some(a=>a.id===input.artist.id))catalog.artists.push({id:input.artist.id,name:input.artist.name,image:album.cover,description:input.artist.description||'Independent artist / Good Flippin Vibes'});
catalog.albums.unshift(album);catalog.tracks.push(...tracks);fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');console.log('Imported. Run validation and build before publishing.');
