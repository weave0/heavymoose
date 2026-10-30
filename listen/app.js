import {restore,nextId,searchCatalog} from './player.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audio=$('#audio'), main=$('#content');
const storageKey='gfv-listening-room-v1';
let catalog, state, artists, albums, tracks, timer, installPrompt, savingFailed=false, sourceGeneration=0;
let history=[];
const time=s=>Number.isFinite(s)?`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`:'0:00';
const toast=message=>{ $('#notice').textContent=message;$('#notice').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#notice').classList.remove('show'),4500); };
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{if(!savingFailed){toast('Device storage is unavailable. Your changes will last for this visit.');savingFailed=true;}}}
function readStorage(){try{return localStorage.getItem(storageKey);}catch{return null;}}
function syncPlayer(){
  const t=tracks.get(state.current),a=t&&albums.get(t.albumId);
  $('#now-title').textContent=t?.title || 'Find your next frequency';
  $('#now-artist').textContent=t?`${artists.get(t.artistId).name} · ${a.title}`:'Choose a song to start listening';
  $('#now-art').src=a?.cover || './assets/images/releases/floor-witness.jpg';
  $('#now-like').disabled=!t;$('#now-like').textContent=state.likes.includes(t?.id)?'♥':'♡';$('#now-like').setAttribute('aria-pressed',String(state.likes.includes(t?.id)));
  $('#shuffle').setAttribute('aria-pressed',String(state.shuffle));$('#repeat').setAttribute('aria-pressed',String(state.repeat!=='off'));$('#repeat').setAttribute('aria-label',`Repeat ${state.repeat}`);$('#repeat').textContent=state.repeat==='one'?'↻¹':'↻';
  $('#play').textContent=audio.paused?'▶':'Ⅱ';$('#play').setAttribute('aria-label',audio.paused?'Play':'Pause');
  $('#like-count').textContent=state.likes.length;
  document.querySelectorAll('[data-like]').forEach(b=>{const liked=state.likes.includes(b.dataset.like);b.textContent=liked?'♥':'♡';b.setAttribute('aria-pressed',String(liked));});
  document.querySelectorAll('tr[data-track]').forEach(row=>{row.classList.toggle('current',row.dataset.track===state.current);});
}
async function playTrack(id, queue=null, record=true){
  const t=tracks.get(id);if(!t)return;
  if(record && state.current && state.current!==id)history.push(state.current);
  if(queue)state.queue=[...queue];
  if(!state.queue.includes(id))state.queue.push(id);
  if(state.current!==id || !audio.getAttribute('src')){state.current=id;state.time=0;audio.src=t.src;sourceGeneration++;}
  const generation=sourceGeneration;
  persist();syncPlayer();
  if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:artists.get(t.artistId).name,album:albums.get(t.albumId).title,artwork:[{src:new URL(albums.get(t.albumId).cover,location.href).href}]});}
  try{await audio.play();}catch(e){if(generation===sourceGeneration && e.name!=='AbortError')toast('Playback could not start. Tap play to retry, or check your connection.');}
  syncPlayer();
}
function startList(ids){if(ids.length)playTrack(ids[0],ids);else toast('Audio for this release has not been added yet.');}
function toggleLike(id){state.likes=state.likes.includes(id)?state.likes.filter(x=>x!==id):[...state.likes,id];persist();syncPlayer();if(location.hash==='#likes')render();}
function skip(direction=1,ended=false){
  if(direction<0 && audio.currentTime>3){audio.currentTime=0;return;}
  if(direction<0 && history.length){playTrack(history.pop(),null,false);return;}
  const id=nextId(state,direction,ended);
  if(id){if(id===state.current)audio.currentTime=0;playTrack(id);}else{audio.pause();if(ended){state.time=0;audio.currentTime=0;persist();}syncPlayer();}
}
function albumCard(a){return `<article class="album"><a class="art-link" href="#album/${esc(a.id)}"><img src="${esc(a.cover)}" alt="${esc(a.title)} cover" loading="lazy"><span class="art-arrow" aria-hidden="true">↗</span></a><h3><a href="#album/${esc(a.id)}">${esc(a.title)}</a></h3><p>${esc(artists.get(a.artistId).name)} · ${esc(a.year)}</p><span class="badge ${a.tracks.length?'':'pending'}">${a.tracks.length===a.expectedTracks?'FULL RELEASE':a.tracks.length?`${a.tracks.length} TRACKS AVAILABLE`:'CATALOG ONLY'}</span></article>`;}
function cards(list,all=false){return `<div class="grid ${all?'all-albums':''}">${list.map(albumCard).join('')}</div>`;}
function artistCard(a){return `<a class="artist-card" href="#artist/${esc(a.id)}"><img src="${esc(a.image)}" alt="" loading="lazy"><div><h3>${esc(a.name)}</h3><p>${catalog.albums.filter(x=>x.artistId===a.id).length} releases · ${catalog.tracks.filter(x=>x.artistId===a.id).length} songs available</p></div><span aria-hidden="true">↗</span></a>`;}
function songTable(ids,{queue=false}={}){
  if(!ids.length)return '<p class="empty">Nothing here yet. Explore a record, then like a song or add it to your queue.</p>';
  return `<table class="tracks"><thead><tr><th scope="col">#</th><th scope="col">SONG / ARTIST</th><th scope="col" class="album-column">RELEASE</th><th scope="col">${queue?'QUEUE':'COLLECTION'}</th></tr></thead><tbody>${ids.map((id,i)=>{const t=tracks.get(id),a=albums.get(t.albumId);return `<tr data-track="${esc(id)}"><td>${String(i+1).padStart(2,'0')}</td><td><button class="song-title" data-play="${esc(id)}">${esc(t.title)}<small>${esc(artists.get(t.artistId).name)}</small></button></td><td class="album-column"><a href="#album/${esc(a.id)}">${esc(a.title)}</a></td><td class="tools"><button class="icon-button" data-like="${esc(id)}" aria-label="Like ${esc(t.title)}" aria-pressed="false">♡</button>${queue?`<button class="icon-button" data-remove="${i}" aria-label="Remove ${esc(t.title)} from queue">×</button>`:`<button class="icon-button" data-add="${esc(id)}" aria-label="Add ${esc(t.title)} to queue">+</button>`}${t.downloadAllowed?`<a class="icon-button" href="${esc(t.src)}" download aria-label="Download ${esc(t.title)}">↓</a>`:''}</td></tr>`;}).join('')}</tbody></table>`;
}
function heading(title,detail='',link=''){return `<div class="section-heading"><h2>${esc(title)}</h2>${link?`<a href="${link}">${esc(detail)} ↗</a>`:`<p>${esc(detail)}</p>`}</div>`;}
function render(){
  const q=$('#search').value.trim();
  const [route,id]=(location.hash.replace(/^#/,'')||'discover').split('?')[0].split('/');
  document.querySelectorAll('[data-view]').forEach(a=>{const active=a.dataset.view===route || (route==='album'&&a.dataset.view==='albums') || (route==='artist'&&a.dataset.view==='artists');a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(q){const found=searchCatalog(catalog,q);main.innerHTML=`<h1 class="page-title">Find your frequency.</h1><p class="intro">Results for “${esc(q)}”</p>${heading('Songs',`${found.tracks.length} available`)}${songTable(found.tracks.map(t=>t.id))}${heading('Releases',`${found.albums.length} found`)}${cards(found.albums,true)}`;}
  else if(route==='discover'){
    const available=catalog.albums.filter(a=>a.tracks.length).sort((a,b)=>b.tracks.length-a.tracks.length);
    main.innerHTML=`<section class="hero"><img src="./assets/images/heavy-moose-dj-silhouette.png" alt="Heavy Moose silhouetted against a vivid concert stage"><div class="hero-copy"><span class="tag"><span class="live-dot"></span> THE GOOD FLIPPIN VIBES LISTENING ROOM</span><h1>Out of the noise.<br>Into <em>the music.</em></h1><p>A home for independent sound. Full records, unexpected turns, and a little room to get lost.</p><button class="primary" data-start="all">▶ &nbsp; Enter the rotation</button><a class="text-link" href="#artists">Meet the artists ↗</a></div><div class="hero-bottom">ON YOUR OWN FREQUENCY<strong>Heavy Moose / Good Flippin Vibes</strong></div></section>${heading('Stay for the whole record.','Browse all releases','#albums')}${cards(available.slice(0,4))}${heading('Different artists. Shared instinct.','Explore the roster','#artists')}<div class="artist-strip">${catalog.artists.map(artistCard).join('')}</div>${heading('Fresh in the catalog.','Audio availability shown on each release')}${cards(catalog.albums.slice(0,4))}`;
  }else if(route==='albums'){
    const filter=new URLSearchParams(location.hash.split('?')[1]||'').get('available')==='1';
    main.innerHTML=`<span class="eyebrow">THE COLLECTION</span><h1 class="page-title">Every record has a world.</h1><p class="intro">${catalog.albums.length} releases in the catalog. ${catalog.tracks.length} full songs available now. Catalog-only releases will open for listening as recordings are added.</p><div class="pills"><a class="pill ${!filter?'active':''}" href="#albums">All releases</a><a class="pill ${filter?'active':''}" href="#albums?available=1">Available to play</a></div>${cards(catalog.albums.filter(a=>!filter||a.tracks.length),true)}`;
  }else if(route==='artists'){main.innerHTML=`<span class="eyebrow">THE PEOPLE BEHIND THE SOUND</span><h1 class="page-title">Independent by nature.</h1><p class="intro">Artists and collaborators from the Heavy Moose / Good Flippin Vibes catalog.</p><div class="artist-strip">${catalog.artists.map(artistCard).join('')}</div>`;
  }else if(route==='album' && albums.has(id)){
    const a=albums.get(id);main.innerHTML=`<a class="eyebrow" href="#albums">← ALL RELEASES</a><div class="detail"><img src="${esc(a.cover)}" alt="${esc(a.title)} cover"><div><span class="eyebrow">${esc(a.genre)} / ${esc(a.year)}</span><h1>${esc(a.title)}</h1><p><a href="#artist/${esc(a.artistId)}">${esc(artists.get(a.artistId).name)}</a> · ${a.tracks.length} of ${a.expectedTracks} songs available</p><button class="primary" data-start="${esc(a.id)}" ${!a.tracks.length?'disabled':''}>▶ &nbsp; Play release</button></div></div>${!a.tracks.length?'<p class="empty">This release is in the catalog. Its recordings and song metadata have not been supplied for the listening room yet.</p>':`${a.tracks.length<a.expectedTracks?'<p class="intro">A selection from this release is available. The remaining recordings have not been added yet.</p>':''}${songTable(a.tracks)}`}`;
  }else if(route==='artist' && artists.has(id)){
    const a=artists.get(id);main.innerHTML=`<a class="eyebrow" href="#artists">← ALL ARTISTS</a><div class="detail"><img src="${esc(a.image)}" alt="${esc(a.name)}"><div><span class="eyebrow">ARTIST / COLLABORATOR</span><h1>${esc(a.name)}</h1><p>${esc(a.description)}</p><button class="primary" data-artist="${esc(id)}">▶ &nbsp; Play artist</button></div></div>${heading('Discography')}${cards(catalog.albums.filter(a=>a.artistId===id),true)}`;
  }else if(route==='likes'){main.innerHTML=`<span class="eyebrow">YOUR OWN LITTLE COLLECTION</span><h1 class="page-title">The ones you come back to.</h1><p class="intro">${state.likes.length} liked songs, saved on this browser. No account needed.</p><div class="queue-actions"><button class="primary" data-start="likes" ${!state.likes.length?'disabled':''}>▶ &nbsp; Play liked songs</button></div>${songTable(state.likes)}`;
  }else if(route==='queue'){main.innerHTML=`<span class="eyebrow">COMING THROUGH THE SPEAKERS</span><h1 class="page-title">Your queue.</h1><p class="intro">${state.queue.length} songs. Saved here between visits. Shuffle ${state.shuffle?'on':'off'} · Repeat ${state.repeat}.</p><div class="queue-actions"><button class="primary" data-start="queue" ${!state.queue.length?'disabled':''}>▶ &nbsp; Play queue</button><button class="quiet" data-clear="queue">Clear queue</button></div>${songTable(state.queue,{queue:true})}`;
  }else if(route==='about'){main.innerHTML=`<article class="about"><span class="eyebrow">WELCOME IN</span><h1 class="page-title">A room for the music.</h1><p>The Heavy Moose / Good Flippin Vibes listening room brings independent artists and collaborators together. Listening is free, with no subscription, account, or advertising.</p><h2>A growing collection</h2><p>Recordings here are drawn from the existing Heavy Moose website. Other releases display real catalog metadata and artwork, with availability clearly labeled. The roster and library will grow as more music is supplied.</p><h2>Yours, on this device</h2><p>Your likes, queue, volume, shuffle, repeat, and playback position are saved in this browser. Playback resumes only when you press play. Clearing browser data removes these preferences. They do not sync across devices.</p><h2>Take the room with you</h2><p>Use your browser’s “Add to Home Screen” or install option. The app shell is available offline after your first visit. Music currently requires a connection; offline music saving is prepared for a later release after download permissions are confirmed. Where an artist explicitly allows file downloads, a download button will appear beside that recording. Device storage may be cleared by your browser.</p><h2>Keep in touch</h2><p><a href="https://heavymoose.com" target="_blank" rel="noopener">Heavy Moose ↗</a> &nbsp; <a href="https://goodflippinvibes.com" target="_blank" rel="noopener">Good Flippin Vibes ↗</a></p></article>`;
  }else{main.innerHTML='<h1 class="page-title">That frequency is quiet.</h1><p class="intro"><a href="#discover">Return to the listening room ↗</a></p>';}
  syncPlayer();
}
async function boot(){
  const response=await fetch('./catalog.json');if(!response.ok)throw Error('Catalog unavailable');catalog=await response.json();
  artists=new Map(catalog.artists.map(a=>[a.id,a]));albums=new Map(catalog.albums.map(a=>[a.id,a]));tracks=new Map(catalog.tracks.map(t=>[t.id,t]));state=restore(readStorage(),catalog.tracks);
  audio.volume=state.volume;$('#volume').value=state.volume;
  if(state.current){audio.src=tracks.get(state.current).src;audio.addEventListener('loadedmetadata',()=>{if(state.time>0&&state.time<audio.duration)audio.currentTime=state.time;},{once:true});}
  $('#year').textContent=new Date().getFullYear();
  $('.skip').onclick=e=>{e.preventDefault();main.focus();};
  main.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.play){const ids=[...main.querySelectorAll('tr[data-track]')].map(r=>r.dataset.track);playTrack(b.dataset.play,ids);}
    if(b.dataset.like)toggleLike(b.dataset.like);
    if(b.dataset.add){if(!state.queue.includes(b.dataset.add))state.queue.push(b.dataset.add);persist();toast('Added to your queue.');}
    if(b.dataset.remove!==undefined){state.queue.splice(Number(b.dataset.remove),1);persist();render();}
    if(b.dataset.clear){state.queue=[];persist();render();}
    if(b.dataset.artist)startList(catalog.tracks.filter(t=>t.artistId===b.dataset.artist).map(t=>t.id));
    if(b.dataset.start){const key=b.dataset.start;startList(key==='all'?catalog.tracks.map(t=>t.id):key==='likes'?state.likes:key==='queue'?state.queue:albums.get(key)?.tracks||[]);}
  });
  $('#play').onclick=()=>{if(!state.current)startList(state.queue.length?state.queue:catalog.tracks.map(t=>t.id));else if(audio.paused)playTrack(state.current);else audio.pause();};
  $('#next').onclick=()=>skip();$('#previous').onclick=()=>skip(-1);
  $('#now-like').onclick=()=>state.current&&toggleLike(state.current);
  $('#shuffle').onclick=()=>{state.shuffle=!state.shuffle;persist();syncPlayer();if(location.hash==='#queue')render();toast(`Shuffle ${state.shuffle?'on':'off'}`);};
  $('#repeat').onclick=()=>{state.repeat={off:'all',all:'one',one:'off'}[state.repeat];persist();syncPlayer();if(location.hash==='#queue')render();toast(`Repeat ${state.repeat}`);};
  $('#volume').oninput=e=>{audio.volume=Number(e.target.value);state.volume=audio.volume;persist();};
  $('#seek').oninput=e=>{if(Number.isFinite(audio.duration)){audio.currentTime=audio.duration*Number(e.target.value)/100;state.time=audio.currentTime;persist();}};
  let lastSave=0;
  audio.ontimeupdate=()=>{const d=audio.duration;$('#elapsed').textContent=time(audio.currentTime);$('#duration').textContent=time(d);$('#seek').value=d?audio.currentTime/d*100:0;state.time=audio.currentTime;if(Date.now()-lastSave>3000){persist();lastSave=Date.now();}};
  audio.onended=()=>skip(1,true);audio.onplay=audio.onpause=()=>{syncPlayer();persist();if('mediaSession'in navigator)navigator.mediaSession.playbackState=audio.paused?'paused':'playing';};
  audio.onerror=()=>{toast('This recording could not be loaded. Check your connection or choose another song.');syncPlayer();};
  if('mediaSession'in navigator){for(const [action,handler] of Object.entries({play:()=>playTrack(state.current),pause:()=>audio.pause(),nexttrack:()=>skip(),previoustrack:()=>skip(-1),seekto:d=>{if(Number.isFinite(d.seekTime))audio.currentTime=d.seekTime;}})){try{navigator.mediaSession.setActionHandler(action,handler);}catch{}}}
  $('#search').oninput=render;window.addEventListener('hashchange',()=>{$('#search').value='';render();window.scrollTo(0,0);});
  window.addEventListener('pagehide',persist);render();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>toast('Offline app shell is unavailable in this browser. Streaming is ready.'));
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false;});
$('#install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install').hidden=true;}};
boot().catch(()=>{main.innerHTML='<h1 class="page-title">The room is taking a moment.</h1><p class="empty">We could not load the catalog. Check your connection and reload this page.</p>';});
