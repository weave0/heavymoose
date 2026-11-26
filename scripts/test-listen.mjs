import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {audit,parseArgs,deriveLocation,classify}=require('./audit-listen-library.cjs');
import {restore,nextId,searchCatalog,enqueueNext,moveInQueue,extendQueue} from '../listen/player.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'listen/catalog.json'),'utf8'));
test('catalog references are unique, complete and use existing local assets',()=>{
  for(const group of ['artists','albums','tracks'])assert.equal(new Set(catalog[group].map(x=>x.id)).size,catalog[group].length);
  const artists=new Set(catalog.artists.map(x=>x.id)),albums=new Map(catalog.albums.map(x=>[x.id,x]));
  for(const a of catalog.albums){assert(artists.has(a.artistId));assert(a.tracks.length<=a.expectedTracks);for(const id of a.tracks)assert(catalog.tracks.some(t=>t.id===id&&t.albumId===a.id));}
  for(const t of catalog.tracks){assert(artists.has(t.artistId));assert(albums.get(t.albumId).tracks.includes(t.id));assert.equal(typeof t.downloadAllowed,'boolean');const b=fs.readFileSync(path.resolve(root,t.src));assert(b.subarray(0,3).toString()==='ID3'||(b[0]===0xff&&(b[1]&0xe0)===0xe0),'Invalid MP3: '+t.src);}
  for(const url of [...catalog.artists.map(x=>x.image),...catalog.albums.map(x=>x.cover),...catalog.tracks.map(x=>x.src)]){
    assert(url.startsWith('./assets/'));const p=path.resolve(root,url);assert(p.startsWith(path.join(root,'assets')+path.sep));const size=fs.statSync(p).size;assert(size>100);assert(size<25*1024*1024);
  }
});
test('persisted state rejects stale ids, invalid modes and malformed storage',()=>{
  assert.equal(restore('{',catalog.tracks).repeat,'off');
  assert.equal(restore('null',catalog.tracks).queue.length,0);
  const id=catalog.tracks[0].id,s=restore(JSON.stringify({queue:[id,id,'deleted'],likes:[id,'deleted'],current:'deleted',volume:8,repeat:'invalid',time:-1}),catalog.tracks);
  assert.deepEqual(s.queue,[id]);assert.deepEqual(s.likes,[id]);assert.equal(s.current,null);assert.equal(s.volume,1);assert.equal(s.time,0);assert.equal(s.repeat,'off');
});
test('queue advances, stops, wraps, repeats one and avoids current when shuffling',()=>{
  const s={queue:['a','b','c'],current:'b',repeat:'off',shuffle:false};
  assert.equal(nextId(s),'c');assert.equal(nextId(s,-1),'a');assert.equal(nextId({...s,current:'c'}),null);
  assert.equal(nextId({...s,current:'c',repeat:'all'}),'a');assert.equal(nextId({...s,repeat:'one'},1,true),'b');assert.equal(nextId({...s,repeat:'one'}),'c');
  assert.equal(nextId({...s,shuffle:true},1,false,()=>0),'a');assert.equal(nextId({...s,shuffle:true},1,false,()=>.99),'c');assert.equal(nextId({...s,queue:[]}),null);
});
test('search matches artist, album and title without case sensitivity',()=>{
  assert(searchCatalog(catalog,'DJ SHARIFF').tracks.length>0);assert(searchCatalog(catalog,'temper').albums.some(a=>a.id==='temper'));assert(searchCatalog(catalog,'  boots on concrete ').tracks.length>0);assert.equal(searchCatalog(catalog,'no-match-184819').tracks.length,0);
});
test('shell cache excludes automatic audio caching and is scoped to the app',()=>{
  const sw=fs.readFileSync(path.join(root,'listen/sw.js'),'utf8');assert(sw.includes("event.request.headers.has('Range')"));assert(!sw.match(/const SHELL=.*\.mp3/));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'listen/manifest.webmanifest'),'utf8'));assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');
});
test('Restricted feature preserves the supplied nine-song sequence and listening-only settings',()=>{
  const a=catalog.albums.find(a=>a.id==='80s-maybe-included');assert(a);assert.equal(catalog.feature.albumId,a.id);assert.equal(catalog.feature.videoId,'mde4tAc-s9o');
  const songs=a.tracks.map(id=>catalog.tracks.find(t=>t.id===id));
  assert.deepEqual(songs.map(t=>t.title),["80's Opening Song",'Juggle','Bat Attack','FF','Less Of A Fan','Fly To',"Somethin'",'In Context',"80's Close"]);
  assert(songs.every(t=>t.downloadAllowed===false));assert.equal(a.expectedTracks,9);
});
test('album importer validates, dry-runs, imports into an isolated fixture and refuses duplicates',()=>{
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});
  const fixture=fs.mkdtempSync(path.join(root,'dist/ingest-test-'));
  fs.mkdirSync(path.join(fixture,'scripts'));fs.mkdirSync(path.join(fixture,'listen'));fs.mkdirSync(path.join(fixture,'album'));
  fs.copyFileSync(path.join(root,'scripts/ingest-listen.cjs'),path.join(fixture,'scripts/ingest-listen.cjs'));
  fs.writeFileSync(path.join(fixture,'listen/catalog.json'),JSON.stringify({artists:[],albums:[],tracks:[]}));
  fs.copyFileSync(path.resolve(root,catalog.tracks[0].src),path.join(fixture,'album/01.mp3'));
  fs.copyFileSync(path.resolve(root,catalog.albums[0].cover),path.join(fixture,'album/cover.jpg'));
  const input={id:'test-release',artist:{id:'test-artist',name:'Test Artist'},title:'Test Release',streamingAllowed:true,downloadAllowed:false,tracks:[{file:'01.mp3',title:'Test Song'}]};
  const metadata=path.join(fixture,'album/album.json');fs.writeFileSync(metadata,JSON.stringify(input));
  const run=apply=>spawnSync(process.execPath,[path.join(fixture,'scripts/ingest-listen.cjs'),path.join(fixture,'album'),...(apply?['--apply']:[])],{encoding:'utf8'});
  assert.equal(run(false).status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(fixture,'listen/catalog.json'))).albums.length,0);
  input.tracks[0].file='../01.mp3';fs.writeFileSync(metadata,JSON.stringify(input));assert.notEqual(run(false).status,0);
  input.tracks[0].file='01.mp3';input.streamingAllowed=false;fs.writeFileSync(metadata,JSON.stringify(input));assert.notEqual(run(false).status,0);
  input.streamingAllowed=true;fs.writeFileSync(metadata,JSON.stringify(input));assert.equal(run(true).status,0);
  const imported=JSON.parse(fs.readFileSync(path.join(fixture,'listen/catalog.json')));assert.equal(imported.artists[0].name,'Test Artist');assert.equal(imported.tracks[0].downloadAllowed,false);assert(fs.existsSync(path.resolve(fixture,imported.tracks[0].src)));assert.notEqual(run(true).status,0);
});

test('Shuffle All visits each track once before a cycle may restart',()=>{
  const q=['one','two','three','four','five'],state={queue:q,current:'one',shuffle:true,shuffleSeen:['one'],repeat:'off',upNext:[]};
  const visited=new Set(['one']);
  for(let i=1;i<q.length;i++){
    const choice=nextId(state,1,true,()=>.99);
    assert(choice&&!visited.has(choice),'Repeated before the queue was exhausted');
    visited.add(choice);state.current=choice;state.shuffleSeen.push(choice);
  }
  assert.equal(visited.size,q.length);
  assert.equal(nextId(state,1,true),null);
  state.repeat='all';
  const another=nextId(state,1,true,()=>0);
  assert(another&&another!==state.current,'Repeat All must start a new cycle');
});
test('Play Next stays prioritized over shuffle, and queue helpers do not duplicate songs',()=>{
  const q=['a','b','c'];
  assert.deepEqual(enqueueNext(q,'a','c'),['a','c','b']);
  assert.deepEqual(enqueueNext(q,'a','new'),['a','new','b','c']);
  assert.deepEqual(moveInQueue(q,2,-1),['a','c','b']);
  assert.deepEqual(moveInQueue(q,0,-1),q);
  assert.deepEqual(extendQueue(['b','a'],['a','c','d','c','b']),['b','a','c','d']);
  const state={queue:q,current:'a',shuffle:true,shuffleSeen:['a'],repeat:'off',upNext:['c']};
  assert.equal(nextId(state,1,false,()=>0),'c');
});
test('v1 likes and positions migrate without loss; new playlists and recent songs are safe',()=>{
  const a=catalog.tracks[0].id,b=catalog.tracks[1].id;
  const prior=restore(JSON.stringify({likes:[a,a,b],queue:[a,b],current:a,time:82,shuffle:true}),catalog.tracks);
  assert.deepEqual(prior.likes,[a,b]);
  assert.equal(prior.time,82);assert.equal(prior.continuous,true);assert.deepEqual(prior.playlists,[]);
  const newer=restore(JSON.stringify({
    likes:[b],queue:[a,b],upNext:[b,'ghost'],shuffleSeen:[a,'ghost'],recent:[b,a,b,'ghost'],
    continuous:false,playlists:[{id:'road-mix',name:' Road Mix ',ids:[a,a,b,'ghost']},{id:'bad',name:'',ids:[a]}]
  }),catalog.tracks);
  assert.deepEqual(newer.upNext,[b]);assert.deepEqual(newer.shuffleSeen,[a]);
  assert.deepEqual(newer.recent,[b,a]);assert.equal(newer.continuous,false);
  assert.deepEqual(newer.playlists,[{id:'road-mix',name:'Road Mix',ids:[a,b]}]);
});
test('mobile controls, explicit all-library actions and restricted audio safeguards remain present',()=>{
  const html=fs.readFileSync(path.join(root,'listen/index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'listen/app.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'listen/room.css'),'utf8');
  const sw=fs.readFileSync(path.join(root,'listen/sw.js'),'utf8');
  for(const value of ['id="full-player"','id="full-seek"','id="full-like"','id="save-dialog"','#playlists','#recent'])assert(html.includes(value),value);
  for(const value of ['data-shuffle-all','data-playlist-start','data-save-queue','setPositionState','seekbackward','seekforward','state.continuous'])assert(app.includes(value),value);
  assert(css.includes('min-width:44px'));assert(sw.includes('gfv-room-shell-v4'));
  assert(!/const SHELL=[^\n]*\.(mp3|wav|m4a)/.test(sw));
  assert(catalog.tracks.filter(t=>t.albumId==='80s-maybe-included').every(t=>t.downloadAllowed===false));
});


test('read-only library scanner audits nested masters, downloaded originals, duplicates and catalog matches',async()=>{
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});
  const fixture=fs.mkdtempSync(path.join(root,'dist/library-audit-fixture-'));
  const source=path.join(fixture,'Heavy Moose');
  const albumFolder=path.join(source,'80s Maybe Included');
  const numberedFolder=path.join(albumFolder,'03_bst_attack22');
  const originals=path.join(albumFolder,'Original Downloads');
  fs.mkdirSync(numberedFolder,{recursive:true});
  fs.mkdirSync(originals,{recursive:true});
  const master=path.join(numberedFolder,'master_B_reference_320.mp3');
  const download=path.join(originals,'03 - Bat Attack.mp3');
  const empty=path.join(originals,'00 - Placeholder.mp3');
  const wav=path.join(albumFolder,'01 - Opening.wav');
  const cover=path.join(albumFolder,'cover.jpg');
  const zip=path.join(albumFolder,'OriginalDownloads.zip');
  const bytes=Buffer.from('SAMPLE_FIXTURE_RECORDING_NOT_REAL_AUDIO');
  fs.writeFileSync(master,bytes);
  fs.writeFileSync(download,bytes);
  fs.writeFileSync(empty,Buffer.alloc(0));
  fs.writeFileSync(wav,Buffer.from('RIFF0000WAVEfmt '));
  fs.writeFileSync(cover,Buffer.from('fixture-cover'));
  fs.writeFileSync(zip,Buffer.from('fixture-archive'));
  const outside=path.join(fixture,'report');
  const result=await audit(source,outside,{noProbe:true});
  assert.equal(result.counts.scannedAudio,4);
  assert.equal(result.counts.zeroByteFiles,1);
  assert.equal(result.counts.exactDuplicateGroups,1);
  assert.equal(result.counts.catalogMatches,1);
  assert.equal(result.counts.archivesNeedingManualExtraction,1);
  assert.equal(result.counts.ffprobeUsed,false);
  assert.equal(result.counts.changedAudioFiles,0);
  assert.deepEqual(fs.readFileSync(master),bytes);
  assert.deepEqual(fs.readFileSync(download),bytes);
  const details=JSON.parse(fs.readFileSync(path.join(outside,'inventory.json'),'utf8'));
  assert.equal(details.files.length,4);
  assert(details.files.every(f=>f.streamingAllowed===null && f.downloadAllowed===false));
  assert(details.files.every(f=>!Object.prototype.hasOwnProperty.call(f,'absolutePath')));
  const albumResult=JSON.parse(fs.readFileSync(path.join(outside,'album-suggestions.json'),'utf8'));
  const album=albumResult.albums.find(a=>a.catalogAlbumId==='80s-maybe-included');
  assert(album,'Known Listening Room release should be recognized');
  assert.equal(album.album,'80s Maybe Included');
  assert(album.covers.some(c=>c==='80s Maybe Included/cover.jpg'));
  const masterEntry=details.files.find(f=>f.relativePath.endsWith('master_B_reference_320.mp3'));
  assert.equal(masterEntry.album,'80s Maybe Included');
  assert.equal(masterEntry.trackNumber,3);
  assert.equal(masterEntry.titleSource,'numbered folder');
  assert.equal(masterEntry.sourceKind,'master/reference');
  assert(masterEntry.duplicateGroup,'Downloaded original should be recorded as an exact duplicate');
  assert(fs.readFileSync(path.join(outside,'summary.md'),'utf8').includes('OriginalDownloads.zip'));
  assert(fs.readFileSync(path.join(outside,'inventory.csv'),'utf8').includes('catalogAlbumId'));
  assert.equal(fs.statSync(wav).size,16);
});
test('library scanner validates options, scores source versions and skips its own nested output',async()=>{
  const opts=parseArgs(['E:\\art\\MUSIC\\Heavy Moose','--no-probe','--out','C:\\temp\\Music Audit']);
  assert.equal(opts.noProbe,true);assert.equal(opts.source,'E:\\art\\MUSIC\\Heavy Moose');
  assert.equal(opts.out,'C:\\temp\\Music Audit');
  assert.throws(()=>parseArgs(['--unknown']),/Unknown option/);
  const master=classify('LP/masters/song.flac',1000,{},'.flac');
  assert.equal(master.role,'lossless source');
  assert(master.flags.includes('CONVERSION_NEEDED_FOR_CURRENT_INGESTER'));
  const draft=classify('LP/rough-demo/song.mp3',1000,{},'.mp3');
  assert(draft.reviewRank<master.reviewRank);
  const parsed=deriveLocation('C:\\music','C:\\music\\a\\track.mp3',{});
  assert(parsed.album);
  const folder=fs.mkdtempSync(path.join(root,'dist/library-nested-output-'));
  const src=path.join(folder,'music'),out=path.join(src,'Albums','_audit');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'should-not-count.mp3'),Buffer.from('ignored'));
  const valid=path.join(src,'Albums','01 - Valid.mp3');
  fs.writeFileSync(valid,Buffer.from('fixture'));
  const result=await audit(src,out,{noProbe:true,noHash:true});
  assert.equal(result.counts.scannedAudio,1);
  assert.equal(result.counts.exactDuplicateGroups,0);
  assert(fs.existsSync(valid));
});
