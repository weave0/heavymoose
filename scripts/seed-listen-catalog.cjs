// Explicit migration from the existing published catalog. Does not fetch remote data.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const old = JSON.parse(read('assets/data/music-catalog.json'));
const html = read('music.html');
const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
const albums = old.releases.map(r => ({ id: r.slug, artistId: 'heavy-moose', title: r.title, year: r.releaseDate.slice(0, 4), releaseDate: r.releaseDate, genre: r.genre, cover: './' + r.artwork, expectedTracks: r.trackCount, tracks: [] }));
const extra = [
  ['temper','Temper','assets/images/COVER-TEMPER.png','2026-04-29',12],
  ['glass-and-ash','Glass and Ash','assets/images/COVER-glass-and-ash.png','2024',11],
  ['yield','Yield','assets/images/COVERyield.png','2025',12]
];
for(const [id,title,cover,releaseDate,expectedTracks] of extra) if(!albums.some(a=>a.id===id)) albums.push({id,title,cover:'./'+cover,artistId:'heavy-moose',year:releaseDate.slice(0,4),releaseDate,genre:'Industrial',expectedTracks,tracks:[]});
const tracks = [];
function add(album, file, title) {
  const bytes = fs.readFileSync(path.join(root,file));
  if(bytes.subarray(0,3).toString()!=='ID3' && !(bytes[0]===0xff && (bytes[1]&0xe0)===0xe0)) {
    console.warn('Excluded invalid MP3: '+file);return;
  }
  const id = album.id + '-' + path.basename(file, '.mp3');
  if(tracks.some(t=>t.src==='./'+file)) return;
  tracks.push({ id, albumId:album.id, artistId:album.artistId, title, src:'./'+file, downloadAllowed:false });
  album.tracks.push(id);
}
for(const [folder,id] of [['temper','temper'],['floor-witness','floor-witness'],['america-250','knock-knock-merica'],['conus','missed-some-80s-feat-dj-shariff']]) {
  const album = albums.find(a=>a.id===id);
  if(!album) throw Error('Missing album '+id);
  const metadata = graph.find(a=>a['@type']==='MusicAlbum' && a.name.toLowerCase()===album.title.toLowerCase());
  const files = fs.readdirSync(path.join(root,'assets/audio',folder)).filter(f=>f.endsWith('.mp3') && !f.startsWith('flipside-') && !f.startsWith('dj-shariff-')).sort();
  files.forEach((f,i)=>{
    const match = [...html.matchAll(/data-src="([^"]+)" data-title="([^"]+)"/g)].find(m=>m[1]===`assets/audio/${folder}/${f}`);
    const title = match?.[2] || metadata?.track?.[i]?.name || f.replace(/^\d+-/,'').replace(/\.mp3$/,'').replaceAll('-',' ');
    add(album,`assets/audio/${folder}/${f}`,title.replaceAll('&amp;','&').replaceAll('&#39;',"'"));
  });
}
const flipside = albums.find(a=>a.id==='flipside-rituals');
for(const f of fs.readdirSync(path.join(root,'assets/audio/america-250')).filter(f=>f.startsWith('flipside-')).sort()) {
  const match = [...html.matchAll(/data-src="([^"]+)" data-title="([^"]+)"/g)].find(m=>m[1]===`assets/audio/america-250/${f}`);
  add(flipside,`assets/audio/america-250/${f}`,match?.[2] || f);
}
const dj = {id:'dj-shariff-merica',artistId:'dj-shariff',title:"'Merica",year:'2026',releaseDate:'2026',genre:'Electronic',cover:'./assets/images/america-250/knock-knock-merica-250-key-art.png',expectedTracks:1,tracks:[]};
albums.push(dj);add(dj,'assets/audio/america-250/dj-shariff-merica.mp3',"'Merica");
const catalog = {version:1,label:'Good Flippin Vibes',notice:'Streaming recordings already published on the Heavy Moose website. Other releases show catalog metadata only. Offline music saving awaits owner approval per recording.',artists:[{id:'heavy-moose',name:'Heavy Moose',image:'./assets/images/heavy-moose-dj-silhouette.png',description:'Industrial. Electronic. Experimental. Independent by nature.'},{id:'dj-shariff',name:'DJ Shariff',image:dj.cover,description:'Collaborator / featured artist. One recording currently available in this room.'}],albums,tracks};
fs.writeFileSync(path.join(root,'listen/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(`${albums.length} albums, ${tracks.length} streamable tracks, ${catalog.artists.length} artists`);
