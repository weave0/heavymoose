#!/usr/bin/env node
'use strict';
// Read-only local music library audit. Never copies or publishes recordings.
// Usage: node scripts/audit-listen-library.cjs "E:\art\MUSIC\Heavy Moose" [--out "C:\somewhere\audit"] [--no-probe] [--no-hash]
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const AUDIO=new Set(['.mp3','.wav','.wave','.flac','.m4a','.aac','.aif','.aiff','.ogg','.opus','.wma']);
const ART=new Set(['.jpg','.jpeg','.png','.webp']);
const ARCHIVES=new Set(['.zip','.rar','.7z']);
const GENERIC_DIR=/^(?:master(?:s|ed)?|audio[_ -]?masters?|final(?:s| exports?)?|export(?:s)?|mix(?:es|downs)?|download(?:s|ed)?|original(?:s| downloads?)?|track(?:s)?|source(?:s)?|audio|music|wav|flac|mp3|lossless|stereo|hires|24bit|320(?:kbps)?|output|renders?|versions?|converted|streaming|all files)$/i;
const GENERIC_FILE=/^(?:master(?:[ _.-]?[a-z0-9]+)*|original(?:[ _.-]?(?:download|audio|file))*|audio|track|song|final|export|mix|output|reference)(?:[ _.-]?(?:\d+|320|44k|48k|24bit|16bit|wav|flac|mp3))*$/i;
const SKIP=new Set(['.git','node_modules','__MACOSX','$RECYCLE.BIN','System Volume Information']);
const VALID_TAGS=['album','album_artist','albumartist','artist','title','track','date','year','genre','disc'];
const normalize=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function plainTitle(input){
  return String(input||'').replace(/^\s*(?:disc\s*\d+[\s._-]*)?\d{1,3}[\s._-]+/i,'')
    .replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
}
function trackIndex(tags,file,relativeDir){
  const tag=String(tags.track||'').match(/^(\d{1,3})(?:\s*\/\s*\d+)?$/);
  if(tag)return Number(tag[1]);
  for(const part of [path.parse(file).name,path.basename(relativeDir)]){
    const m=part.match(/^\s*(\d{1,3})[\s._-]/);
    if(m)return Number(m[1]);
  }
  return null;
}
function deriveLocation(root,filename,tags){
  const dir=path.dirname(filename), relativeDir=path.relative(root,dir);
  let folder=dir, source='folder', candidate='';
  while(folder!==root && path.relative(root,folder) && !path.relative(root,folder).startsWith('..')){
    const name=path.basename(folder);
    if(!GENERIC_DIR.test(name) && !/^\d{1,3}[\s._-]+/.test(name)){
      candidate=name;break;
    }
    const next=path.dirname(folder);
    if(next===folder)break;
    folder=next;
  }
  let album=String(tags.album||'').trim();
  if(album)source='embedded tags';
  else if(candidate)album=candidate;
  else {album='Unsorted / album unknown';source='unresolved';}
  let title=String(tags.title||'').trim(), titleSource='embedded tags';
  if(!title){
    const stem=plainTitle(path.parse(filename).name);
    if(GENERIC_FILE.test(stem)||/^master[ _.-].*reference(?:[ _.-]|$)/i.test(stem)){
      const namedFolder=path.basename(dir);
      title=/^\d{1,3}[\s._-]+/.test(namedFolder)?plainTitle(namedFolder):'Untitled / verify';
      titleSource=title==='Untitled / verify'?'unresolved':'numbered folder';
    } else {title=stem||'Untitled / verify';titleSource='filename';}
  }
  return {artist:String(tags.album_artist||tags.albumartist||tags.artist||'Heavy Moose').trim(),
    album,albumSource:source,title,titleSource,trackNumber:trackIndex(tags,filename,relativeDir)};
}
function classify(relative,bytes,metadata,ext){
  const name=relative.toLowerCase();
  const flags=[];
  if(bytes===0)flags.push('ZERO_BYTES');
  if(metadata?.error)flags.push('MEDIA_UNREADABLE_OR_UNVERIFIED');
  if(/(?:^|[\/ _.-])(?:stems?|acapella|a cappella|vocals? only|drums? only|instrumental|multitrack)(?:[\/ _.-]|$)/i.test(name))
    flags.push('VARIANT_OR_STEM_REVIEW');
  if(/(?:^|[\/ _.-])(?:demo|draft|scratch|rough|unfinished|temp|preview|snippet|test|wip)(?:[\/ _.-]|$)/i.test(name))
    flags.push('WORKING_VERSION_REVIEW');
  if(/(?:^|[\/ _.-])(?:alternate|alt|remix|edit|v[0-9]+|take[0-9]+)(?:[\/ _.-]|$)/i.test(name))
    flags.push('ALTERNATE_VERSION_REVIEW');
  if(ext==='.mp3'&&bytes>25*1024*1024)flags.push('EXCEEDS_PAGES_25_MIB');
  const lossless=['.wav','.wave','.flac','.aif','.aiff'].includes(ext);
  const master=/(?:master|24bit|24-bit|hires|lossless)/i.test(name)||lossless;
  const original=/(?:original|download|source)/i.test(name);
  const role=bytes===0?'invalid':lossless?'lossless source':master?'master/reference':'compressed source';
  const sourceKind=original?'original/download':master?'master/reference':lossless?'lossless master candidate':'unclassified recording';
  if(ext!=='.mp3')flags.push('CONVERSION_NEEDED_FOR_CURRENT_INGESTER');
  if(metadata?.probeMissing)flags.push('FFPROBE_NOT_AVAILABLE');
  const bitrate=Number(metadata?.bitrateKbps)||0;
  let rank=lossless?35:ext==='.mp3'?20:10;
  if(master)rank+=12;
  if(original)rank+=3;
  if(/(?:^|[\/ _.-])final(?:[\/ _.-]|$)/i.test(name))rank+=7;
  rank+=Math.min(15,Math.floor(bitrate/64));
  if(flags.includes('VARIANT_OR_STEM_REVIEW'))rank-=30;
  if(flags.includes('ALTERNATE_VERSION_REVIEW'))rank-=8;
  if(flags.includes('WORKING_VERSION_REVIEW'))rank-=90;
  if(flags.includes('MEDIA_UNREADABLE_OR_UNVERIFIED'))rank-=25;
  if(bytes===0)rank=-10000;
  return {role,sourceKind,flags,reviewRank:rank};
}
function csv(rows,columns){
  const cell=value=>'"'+String(value==null?'':Array.isArray(value)?value.join(' | '):value).replace(/"/g,'""').replace(/\r?\n/g,' ')+'"';
  return columns.map(cell).join(',')+'\r\n'+rows.map(row=>columns.map(k=>cell(row[k])).join(',')).join('\r\n')+'\r\n';
}
function probe(file,enabled){
  if(!enabled)return {probeMissing:true};
  const p=spawnSync('ffprobe',['-v','error','-show_entries',
    'format=duration,bit_rate:format_tags:stream=codec_name,codec_type,channels,sample_rate,bits_per_sample,bit_rate',
    '-of','json',file],{windowsHide:true,encoding:'utf8',maxBuffer:1024*1024,timeout:25000});
  if(p.error||p.status!==0)return {error:(p.error?.message||p.stderr||'ffprobe failed').trim().slice(0,300)};
  let info;
  try{info=JSON.parse(p.stdout)}catch{return {error:'Unparseable ffprobe output'};}
  const tags={};
  for(const [k,v] of Object.entries(info.format?.tags||{})){
    const key=k.toLowerCase().replace(/[^a-z_]/g,'');
    if(VALID_TAGS.includes(key))tags[key]=String(v).trim().slice(0,250);
  }
  const stream=(info.streams||[]).find(s=>s.codec_type==='audio')||{};
  const bitrate=Number(stream.bit_rate||info.format?.bit_rate)||0;
  return {tags,durationSec:Number.isFinite(Number(info.format?.duration))?Number(Number(info.format.duration).toFixed(2)):null,
    bitrateKbps:bitrate>0?Math.round(bitrate/1000):null,codec:stream.codec_name||null,
    channels:stream.channels||null,sampleRate:stream.sample_rate?Number(stream.sample_rate):null,
    bitsPerSample:stream.bits_per_sample||null};
}
function getFiles(root,out){
  const result={audio:[],covers:[],archives:[],errors:[]};
  const stack=[root];
  while(stack.length){
    const dir=stack.pop();
    let entries;
    try{entries=fs.readdirSync(dir,{withFileTypes:true});}
    catch(e){result.errors.push({path:dir,error:e.message});continue;}
    entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const entry of entries){
      const full=path.join(dir,entry.name);
      if(full===out||full.startsWith(out+path.sep))continue;
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory()){if(!SKIP.has(entry.name))stack.push(full);continue;}
      if(!entry.isFile())continue;
      const ext=path.extname(entry.name).toLowerCase();
      if(AUDIO.has(ext))result.audio.push(full);
      else if(ARCHIVES.has(ext))result.archives.push(path.relative(root,full).split(path.sep).join('/'));
      else if(ART.has(ext) && /(?:cover|front|folder|art|sleeve|album|release|disc)/i.test(entry.name))result.covers.push(full);
    }
  }
  result.audio.sort((a,b)=>a.localeCompare(b,'en'));
  return result;
}
async function hashFile(file){
  const hash=crypto.createHash('sha256');
  await new Promise((resolve,reject)=>{
    const stream=fs.createReadStream(file,{highWaterMark:1024*1024});
    stream.on('data',bytes=>hash.update(bytes));
    stream.on('error',reject);stream.on('end',resolve);
  });
  return hash.digest('hex');
}
function markReview(items){
  const bySong=new Map();
  for(const item of items){
    const key=normalize(item.artist)+'|'+normalize(item.album)+'|'+(item.trackNumber||'')+'|'+normalize(item.title);
    if(!bySong.has(key))bySong.set(key,[]);
    bySong.get(key).push(item);
  }
  for(const group of bySong.values()){
    group.sort((a,b)=>b.reviewRank-a.reviewRank||a.relativePath.localeCompare(b.relativePath));
    for(const [index,item] of group.entries()){
      item.reviewPriority=index===0?'inspect first':'alternate to compare';
      item.variantsInSongGroup=group.length;
    }
  }
}
function albumGroups(items,covers,root,catalog={artists:[],albums:[]}){
  const albums=new Map();
  for(const item of items){
    const key=normalize(item.artist)+'|'+normalize(item.album);
    if(!albums.has(key))albums.set(key,{artist:item.artist,album:item.album,albumSource:item.albumSource,
      files:[],covers:[],streamingAllowed:null,downloadAllowed:false,reviewRequired:true});
    albums.get(key).files.push(item);
  }
  const result=Array.from(albums.values());
  const artistNames=new Map((catalog.artists||[]).map(a=>[a.id,a.name]));
  for(const group of result){
    const existing=(catalog.albums||[]).find(a=>normalize(a.title)===normalize(group.album) &&
      normalize(artistNames.get(a.artistId))===normalize(group.artist));
    group.catalogAlbumId=existing?.id||null;
    group.catalogTracksCurrentlyPlayable=existing?.tracks?.length||0;
    const candidates=new Set(group.files.map(x=>path.dirname(x.absolutePath)));
    group.covers=covers.filter(cover=>{
      const dir=path.dirname(cover);
      for(const candidate of candidates){
        if(dir===candidate||dir===path.dirname(candidate)||path.dirname(dir)===candidate)return true;
      }
      return false;
    }).map(cover=>path.relative(root,cover).split(path.sep).join('/')).slice(0,20);
    group.files.sort((a,b)=>(a.trackNumber||999)-(b.trackNumber||999)||a.title.localeCompare(b.title)||b.reviewRank-a.reviewRank);
    group.fileCount=group.files.length;
    group.possibleTrackCount=new Set(group.files.map(x=>(x.trackNumber||'')+'|'+normalize(x.title))).size;
    group.issues=group.files.filter(x=>x.flags.length||x.titleSource==='unresolved'||x.albumSource==='unresolved').length;
    group.files=group.files.map(x=>({relativePath:x.relativePath,title:x.title,trackNumber:x.trackNumber,
      format:x.format,bytes:x.bytes,sha256:x.sha256,reviewPriority:x.reviewPriority,flags:x.flags}));
  }
  return result.sort((a,b)=>a.artist.localeCompare(b.artist)||a.album.localeCompare(b.album));
}
async function audit(source,out,opts={}){
  const root=path.resolve(source),dest=path.resolve(out);
  if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('Source folder not accessible: '+root);
  if(dest===root||root.startsWith(dest+path.sep))throw Error('Output directory must not contain the source library.');
  const files=getFiles(root,dest);
  const probeEnabled=!opts.noProbe && spawnSync('ffprobe',['-version'],{stdio:'ignore',windowsHide:true,timeout:10000}).status===0;
  const items=[];
  for(const [i,filename] of files.audio.entries()){
    let stat;
    try{stat=fs.statSync(filename);}catch(e){files.errors.push({path:filename,error:e.message});continue;}
    const relativePath=path.relative(root,filename).split(path.sep).join('/');
    const ext=path.extname(filename).toLowerCase();
    const metadata=stat.size===0?{}:probe(filename,probeEnabled);
    const location=deriveLocation(root,filename,metadata.tags||{});
    const classification=classify(relativePath,stat.size,metadata,ext);
    const sha256=opts.noHash||stat.size===0?null:await hashFile(filename);
    items.push({relativePath,absolutePath:filename,bytes:stat.size,mb:Number((stat.size/1048576).toFixed(2)),
      format:ext,sha256,...location,...metadata,...classification,
      streamingAllowed:null,downloadAllowed:false,reviewRequired:true});
    if(opts.progress && (i+1)%25===0)console.log('Inspected '+(i+1)+' / '+files.audio.length+' audio files');
  }
  markReview(items);
  const hashes=new Map();
  for(const item of items){
    if(!item.sha256)continue;
    if(!hashes.has(item.sha256))hashes.set(item.sha256,[]);
    hashes.get(item.sha256).push(item);
  }
  const duplicates=Array.from(hashes).filter(([,v])=>v.length>1)
    .map(([hash,group])=>({sha256:hash,files:group.map(x=>x.relativePath),bytes:group[0].bytes}));
  for(const duplicate of duplicates)
    for(const item of items)if(item.sha256===duplicate.sha256)item.duplicateGroup=duplicate.sha256.slice(0,12);
  const catalogPath=path.resolve(__dirname,'..','listen','catalog.json');
  const existingCatalog=fs.existsSync(catalogPath)?JSON.parse(fs.readFileSync(catalogPath,'utf8')):{artists:[],albums:[]};
  const albums=albumGroups(items,files.covers,root,existingCatalog);
  const catalogIndex=new Map(albums.map(a=>[normalize(a.artist)+'|'+normalize(a.album),a.catalogAlbumId]));
  for(const item of items)item.catalogAlbumId=catalogIndex.get(normalize(item.artist)+'|'+normalize(item.album))||null;
  const counts={source:root,output:dest,scannedAudio:items.length,albumGroups:albums.length,
    exactDuplicateGroups:duplicates.length,catalogMatches:albums.filter(a=>a.catalogAlbumId).length,
    catalogMatchesCurrentlyEmpty:albums.filter(a=>a.catalogAlbumId&&!a.catalogTracksCurrentlyPlayable).length,
    zeroByteFiles:items.filter(x=>x.bytes===0).length,
    losslessSources:items.filter(x=>x.role==='lossless source').length,
    compressedSources:items.filter(x=>x.role==='compressed source'||x.role==='master/reference').length,
    reviewFlags:items.filter(x=>x.flags.length||x.titleSource==='unresolved'||x.albumSource==='unresolved').length,
    unrecoverableOrUnreadable:items.filter(x=>x.flags.includes('MEDIA_UNREADABLE_OR_UNVERIFIED')).length,
    archivesNeedingManualExtraction:files.archives.length,
    ffprobeUsed:probeEnabled,sha256Used:!opts.noHash,changedAudioFiles:0};
  const columns=['artist','album','catalogAlbumId','trackNumber','title','albumSource','titleSource','relativePath','format',
    'mb','durationSec','bitrateKbps','sampleRate','channels','role','sourceKind','reviewPriority','variantsInSongGroup',
    'flags','duplicateGroup','sha256','streamingAllowed','downloadAllowed'];
  const csvRows=items.map(x=>Object.fromEntries(columns.map(k=>[k,x[k]??''])));
  fs.mkdirSync(dest,{recursive:true});
  fs.writeFileSync(path.join(dest,'inventory.csv'),csv(csvRows,columns),'utf8');
  fs.writeFileSync(path.join(dest,'inventory.json'),JSON.stringify({counts,files:items.map(({absolutePath,...rest})=>rest)},null,2)+'\n');
  fs.writeFileSync(path.join(dest,'album-suggestions.json'),JSON.stringify({counts,albums},null,2)+'\n');
  fs.writeFileSync(path.join(dest,'exact-duplicates.csv'),csv(duplicates.flatMap(x=>x.files.map(p=>({
    sha256:x.sha256,bytes:x.bytes,relativePath:p,members:x.files.length
  }))),['sha256','bytes','members','relativePath']));
  const summary=[
    '# Heavy Moose music-library inventory',
    '',
    '**Read-only. Nothing was moved, converted, uploaded, or published.**',
    '',
    '- Source: '+root,
    '- Audio files: '+counts.scannedAudio,
    '- Candidate album groups: '+counts.albumGroups+' (inferred; require review)',
    '- Exact matches to existing Listening Room album entries: '+counts.catalogMatches,
    '- Matching catalog-only albums awaiting playable tracks: '+counts.catalogMatchesCurrentlyEmpty,
    '- Exact duplicate groups: '+counts.exactDuplicateGroups,
    '- Zero-byte files: '+counts.zeroByteFiles,
    '- Lossless source files: '+counts.losslessSources,
    '- Flagged for review: '+counts.reviewFlags,
    '- Archived bundles not inspected: '+counts.archivesNeedingManualExtraction,
    '- ffprobe metadata inspection: '+(probeEnabled?'enabled':'not available / disabled'),
    '- SHA-256 exact duplicate inspection: '+(opts.noHash?'disabled':'enabled'),
    '',
    '## Candidate albums',
    '',
    '| Artist | Album inferred from tags or folders | Existing catalog ID | Files | Possible tracks | Issues |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...albums.map(a=>'| '+[a.artist,a.album,a.catalogAlbumId||'not matched',a.fileCount,a.possibleTrackCount,a.issues]
      .map(v=>String(v).replace(/\|/g,'/').replace(/\r?\n/g,' ')).join(' | ')+' |'),
    '',
    '## Publishing gate',
    '',
    'No streaming rights or album/track accuracy can be inferred from a local file. Review album identity, track order, correct master, final mix, artwork, permissions and available space before importing. The current importer accepts valid MP3 files under 25 MiB; lossless masters may need separate non-destructive conversion to streaming MP3. Keep source masters unchanged; downloads default disabled.',
    '',
    '## Share for catalog reconciliation',
    '',
    'Share summary.md, inventory.csv and album-suggestions.json. These contain filenames and metadata, **not** the audio recordings. They may include private local folder names: inspect before sharing. Do not commit the generated inventory or private recordings to public GitHub.',
    '',
    '### Local output',
    '',
    '- inventory.csv — one line per file, with provenance and review status',
    '- album-suggestions.json — candidate groupings, covers and alternate takes',
    '- exact-duplicates.csv — SHA-256 identical files',
    '- inventory.json — detailed technical inspection',
    '- summary.md — this report',
    ...(files.archives.length?['','## Unexpanded archives','',...files.archives.slice(0,100).map(x=>'- '+x),
      ...(files.archives.length>100?['- ... additional archives omitted from this summary']:[])]:[]),
    ...(files.errors.length?['','## Read errors','',...files.errors.slice(0,30).map(e=>'- '+e.path+': '+e.error)]:[]),
    ''
  ].join('\n');
  fs.writeFileSync(path.join(dest,'summary.md'),summary,'utf8');
  return {counts,output:dest,errors:files.errors};
}
function parseArgs(args){
  if(args.includes('--help')||args.includes('-h'))return {help:true};
  let source=null,out=path.resolve(__dirname,'..','dist','heavy-moose-audit'),noProbe=false,noHash=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--out'){if(!args[i+1])throw Error('--out needs a folder path');out=args[++i];}
    else if(arg==='--no-probe')noProbe=true;
    else if(arg==='--no-hash')noHash=true;
    else if(arg.startsWith('-'))throw Error('Unknown option: '+arg);
    else if(!source)source=arg;
    else throw Error('Only one source directory can be scanned.');
  }
  return {source:source||'E:\\art\\MUSIC\\Heavy Moose',out,noProbe,noHash};
}
if(require.main===module){
  const args=parseArgs(process.argv.slice(2));
  if(args.help){
    console.log('node scripts/audit-listen-library.cjs "E:\\art\\MUSIC\\Heavy Moose" [--out path] [--no-probe] [--no-hash]\nRead-only recursive music inventory; requires Node.js; ffprobe is optional. Results are Git-ignored in dist/heavy-moose-audit.');
  }else audit(args.source,args.out,{noProbe:args.noProbe,noHash:args.noHash,progress:true})
    .then(r=>{
      console.log(JSON.stringify(r.counts,null,2));
      console.log('Audit reports: '+r.output);
      if(r.errors.length)console.error(r.errors.length+' paths could not be read; see summary.md.');
    })
    .catch(error=>{console.error('Music audit failed: '+error.message);process.exitCode=1;});
}
module.exports={audit,parseArgs,deriveLocation,classify,markReview,albumGroups,plainTitle,trackIndex};
