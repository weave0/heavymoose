import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {restore,nextId,searchCatalog} from '../listen/player.mjs';
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
