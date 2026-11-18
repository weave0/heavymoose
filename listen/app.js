import {restore,nextId,searchCatalog,enqueueNext,moveInQueue,extendQueue} from './player.mjs';
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
function allIds(){return catalog.albums.flatMap(a=>a.tracks).filter(id=>tracks.has(id));}
function syncPlayer(){
  const t=tracks.get(state.current), a=t&&albums.get(t.albumId);
  const title=t?.title||'Find your next frequency';
  const artist=t?(artists.get(t.artistId)?.name||'Unknown artist')+' · '+(a?.title||''):'Choose a song to start listening';
  const cover=a?.cover||'./assets/images/releases/floor-witness.jpg';
  const liked=!!t&&state.likes.includes(t.id);
  $('#now-title').textContent=$('#full-title').textContent=title;
  $('#now-artist').textContent=$('#full-artist').textContent=artist;
  $('#now-art').src=$('#full-art').src=cover;
  for(const button of ['#now-like','#full-like']){
    const b=$(button);b.disabled=!t;b.textContent=liked?'♥':'♡';b.setAttribute('aria-pressed',String(liked));b.setAttribute('aria-label',liked?'Remove from liked songs':'Add to liked songs');b.title=liked?'Unlike song':'Like song';
  }
  for(const id of ['#shuffle','#full-shuffle'])$(id).setAttribute('aria-pressed',String(state.shuffle));
  for(const id of ['#repeat','#full-repeat']){
    const b=$(id);b.setAttribute('aria-pressed',String(state.repeat!=='off'));b.setAttribute('aria-label','Repeat '+state.repeat);b.textContent=state.repeat==='one'?'↻¹':'↻';
  }
  for(const id of ['#play','#full-play']){
    const b=$(id);b.textContent=audio.paused?'▶':'Ⅱ';b.setAttribute('aria-label',audio.paused?'Play':'Pause');
  }
  $('#like-count').textContent=state.likes.length;
  document.querySelectorAll('[data-like]').forEach(b=>{
    const yes=state.likes.includes(b.dataset.like);b.textContent=yes?'♥':'♡';
    b.setAttribute('aria-pressed',String(yes));b.setAttribute('aria-label',(yes?'Unlike ':'Like ')+(tracks.get(b.dataset.like)?.title||'song'));
  });
  document.querySelectorAll('tr[data-track]').forEach(row=>row.classList.toggle('current',row.dataset.track===state.current));
}
function pushRecent(id){state.recent=[id,...state.recent.filter(x=>x!==id)].slice(0,30);}
async function playTrack(id, queue=null, record=true){
  const t=tracks.get(id);if(!t)return;
  if(record && state.current && state.current!==id)history.push(state.current);
  if(queue){state.queue=[...new Set(queue.filter(x=>tracks.has(x)))];state.upNext=[];state.shuffleSeen=[];}
  if(!state.queue.includes(id))state.queue.push(id);
  if(state.shuffle){
    if(state.queue.length>0 && state.queue.every(x=>state.shuffleSeen.includes(x)) && state.repeat==='all' && !queue)state.shuffleSeen=[id];
    else if(!state.shuffleSeen.includes(id))state.shuffleSeen.push(id);
  }
  state.upNext=state.upNext.filter(x=>x!==id);
  pushRecent(id);
  if(state.current!==id || !audio.getAttribute('src')){
    state.current=id;state.time=0;audio.src=t.src;sourceGeneration++;
  }
  const generation=sourceGeneration;
  persist();syncPlayer();
  if('mediaSession' in navigator){
    navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:artists.get(t.artistId)?.name||'',album:albums.get(t.albumId)?.title||'',artwork:[{src:new URL(albums.get(t.albumId)?.cover||'',location.href).href}]});
  }
  try{await audio.play();}catch(e){if(generation===sourceGeneration && e.name!=='AbortError')toast('Playback could not start. Tap play to retry, or check your connection.');}
  syncPlayer();
}
function startList(ids,{shuffle=false}={}){
  const list=ids.filter(id=>tracks.has(id));
  if(!list.length){toast('No playable recordings in this collection yet.');return;}
  state.shuffle=shuffle;state.shuffleSeen=[];state.upNext=[];
  history=[];
  playTrack(list[0],list);
}
function shuffleAll(){startList(allIds(),{shuffle:true});toast('Shuffling every available song — no early repeats.');}
function toggleLike(id){if(!tracks.has(id))return;state.likes=state.likes.includes(id)?state.likes.filter(x=>x!==id):[...state.likes,id];persist();syncPlayer();if(location.hash==='#likes')render();}
function skip(direction=1,ended=false){
  if(direction<0 && audio.currentTime>3){audio.currentTime=0;return;}
  if(direction<0 && history.length){playTrack(history.pop(),null,false);return;}
  let id=nextId(state,direction,ended);
  if(!id && ended && direction>0 && state.continuous && state.repeat==='off'){
    const extended=extendQueue(state.queue,allIds());
    if(extended.length>state.queue.length){state.queue=extended;id=nextId(state,direction,ended);}
  }
  if(id){if(id===state.current)audio.currentTime=0;playTrack(id);}
  else{audio.pause();if(ended){state.time=0;audio.currentTime=0;persist();}syncPlayer();}
}
function albumCard(a){return `<article class="album"><a class="art-link" href="#album/${esc(a.id)}"><img src="${esc(a.cover)}" alt="${esc(a.title)} cover" loading="lazy"><span class="art-arrow" aria-hidden="true">↗</span></a><h3><a href="#album/${esc(a.id)}">${esc(a.title)}</a></h3><p>${esc(artists.get(a.artistId).name)} · ${esc(a.year)}</p><span class="badge ${a.tracks.length?'':'pending'}">${a.tracks.length===a.expectedTracks?'FULL RELEASE':a.tracks.length?`${a.tracks.length} TRACKS AVAILABLE`:'CATALOG ONLY'}</span></article>`;}
function cards(list,all=false){return `<div class="grid ${all?'all-albums':''}">${list.map(albumCard).join('')}</div>`;}
function artistCard(a){return `<a class="artist-card" href="#artist/${esc(a.id)}"><img src="${esc(a.image)}" alt="" loading="lazy"><div><h3>${esc(a.name)}</h3><p>${catalog.albums.filter(x=>x.artistId===a.id).length} releases · ${catalog.tracks.filter(x=>x.artistId===a.id).length} songs available</p></div><span aria-hidden="true">↗</span></a>`;}
function songTable(ids,{queue=false}={}){
  if(!ids.length)return '<p class="empty">Nothing saved here yet. Play some music, like a song, or build a playlist.</p>';
  return `<table class="tracks"><thead><tr><th scope="col">#</th><th scope="col">SONG / ARTIST</th><th scope="col" class="album-column">RELEASE</th><th scope="col" class="actions-column">ACTIONS</th></tr></thead><tbody>${ids.map((id,i)=>{
    const t=tracks.get(id),a=t&&albums.get(t.albumId);
    if(!t||!a)return '';
    const actions=queue?
      `<button class="icon-button" data-up="${i}" aria-label="Move ${esc(t.title)} up" title="Move up" ${i===0?'disabled':''}>↑</button><button class="icon-button" data-down="${i}" aria-label="Move ${esc(t.title)} down" title="Move down" ${i===ids.length-1?'disabled':''}>↓</button><button class="icon-button" data-remove="${i}" aria-label="Remove ${esc(t.title)} from queue" title="Remove">×</button>`:
      `<button class="icon-button" data-next="${esc(id)}" aria-label="Play ${esc(t.title)} next" title="Play next">↳</button><button class="icon-button" data-add="${esc(id)}" aria-label="Add ${esc(t.title)} to queue" title="Add to queue">+</button><button class="icon-button" data-save="${esc(id)}" aria-label="Save ${esc(t.title)} to a playlist" title="Save to playlist">▦</button>`;
    return `<tr data-track="${esc(id)}"><td>${String(i+1).padStart(2,'0')}</td><td><button class="song-title" data-play="${esc(id)}">${esc(t.title)}<small>${esc(artists.get(t.artistId)?.name||'Artist')}</small></button></td><td class="album-column"><a href="#album/${esc(a.id)}">${esc(a.title)}</a></td><td class="tools"><button class="icon-button heart" data-like="${esc(id)}" aria-label="Like ${esc(t.title)}" aria-pressed="false" title="Like song">♡</button>${actions}${t.downloadAllowed?`<a class="icon-button" href="${esc(t.src)}" download aria-label="Download ${esc(t.title)}">↓</a>`:''}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function heading(title,detail='',link=''){return `<div class="section-heading"><h2>${esc(title)}</h2>${link?`<a href="${link}">${esc(detail)} ↗</a>`:`<p>${esc(detail)}</p>`}</div>`;}
function restrictedFeature(){
  const f=catalog.feature,a=albums.get(f.albumId);
  return `<section class="hero restricted-hero"><img src="${esc(a.cover)}" alt="${esc(a.title)} — Cosmic Moose Sentinel artwork"><div class="hero-copy"><span class="tag"><span class="live-dot"></span> HEAVY MOOSE / ${esc(f.label)}</span><h1>Restricted.<br><em>Still playing.</em></h1><p>${esc(f.statement)}</p><button class="primary" data-start="${esc(a.id)}">▶ &nbsp; Play the album</button><a class="text-link" href="#album/${esc(a.id)}">All nine songs ↗</a></div><div class="hero-bottom">THE FEATURED ALBUM<strong>${esc(a.title)}</strong></div></section><section class="restricted-video" aria-labelledby="restricted-video-title"><button class="video-facade" data-video="${esc(f.videoId)}" aria-label="Play Bat Attack video"><img src="https://i.ytimg.com/vi/${esc(f.videoId)}/hqdefault.jpg" alt="Bat Attack video thumbnail" loading="lazy"><span class="video-play" aria-hidden="true">▶</span></button><div class="restricted-video-copy"><span class="tag">RESTRICTED / THE VIDEO</span><h2 id="restricted-video-title">${esc(f.videoTitle)}</h2><p>The third track from ${esc(a.title)}. Watch it here, then get into the full record.</p><a href="https://www.youtube.com/watch?v=${esc(f.videoId)}" target="_blank" rel="noopener">Watch on YouTube ↗</a><a href="https://goodflippinyikes.com/heavy-moose/distrokid" target="_blank" rel="noopener">The story behind Restricted ↗</a></div></section>`;
}
function render(){
  const q=$('#search').value.trim();
  const [route,id]=(location.hash.replace(/^#/,'')||'discover').split('?')[0].split('/');
  document.querySelectorAll('[data-view]').forEach(a=>{
    const active=a.dataset.view===route || (route==='album'&&a.dataset.view==='albums') ||
      (route==='artist'&&a.dataset.view==='artists') || (route==='playlist'&&a.dataset.view==='playlists');
    a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(q){
    const found=searchCatalog(catalog,q);
    main.innerHTML=`<h1 class="page-title">Find your frequency.</h1><p class="intro">Results for “${esc(q)}”</p>
      ${heading('Songs',found.tracks.length+' playable')}${songTable(found.tracks.map(t=>t.id))}
      ${heading('Releases',found.albums.length+' found')}${cards(found.albums,true)}`;
  }else if(route==='discover'){
    const available=catalog.albums.filter(a=>a.tracks.length);
    main.innerHTML=`<section class="quick-start" aria-label="Start listening"><div><span class="eyebrow">YOUR MUSIC. YOUR MOVE.</span><h2>Stay in the music.</h2><p>${catalog.tracks.length} playable songs across the room. No account or subscription.</p></div><div class="quick-buttons"><button class="primary" data-shuffle-all>⤨ &nbsp; Shuffle everything</button><button class="secondary" data-start="all">▶ &nbsp; Play all songs</button><button class="secondary" data-resume>↻ &nbsp; Resume</button></div></section>
    ${restrictedFeature()}${heading('Stay for the whole record.','Browse all releases','#albums')}${cards(available.slice(0,4))}
    ${heading('Different artists. Shared instinct.','Explore the roster','#artists')}
    <div class="artist-strip">${catalog.artists.map(artistCard).join('')}</div>
    ${heading('Fresh in the catalog.','Audio availability shown on each release')}${cards(catalog.albums.slice(0,4))}`;
  }else if(route==='albums'){
    const filter=new URLSearchParams(location.hash.split('?')[1]||'').get('available')==='1';
    main.innerHTML=`<span class="eyebrow">THE COLLECTION</span><h1 class="page-title">Every record has a world.</h1><p class="intro">${catalog.albums.length} releases in the catalog. ${catalog.tracks.length} full songs available now. Catalog-only releases will open as recordings arrive.</p>
      <div class="quick-buttons"><button class="primary" data-shuffle-all>⤨ Shuffle all songs</button><button class="secondary" data-start="all">▶ Play everything</button></div>
      <div class="pills"><a class="pill ${!filter?'active':''}" href="#albums">All releases</a><a class="pill ${filter?'active':''}" href="#albums?available=1">Available to play</a></div>${cards(catalog.albums.filter(a=>!filter||a.tracks.length),true)}`;
  }else if(route==='artists'){
    main.innerHTML=`<span class="eyebrow">THE PEOPLE BEHIND THE SOUND</span><h1 class="page-title">Independent by nature.</h1><p class="intro">Artists and collaborators from the Heavy Moose / Good Flippin Vibes catalog.</p><div class="artist-strip">${catalog.artists.map(artistCard).join('')}</div>`;
  }else if(route==='album'&&albums.has(id)){
    const a=albums.get(id);
    main.innerHTML=`<a class="eyebrow" href="#albums">← ALL RELEASES</a><div class="detail"><img src="${esc(a.cover)}" alt="${esc(a.title)} cover"><div><span class="eyebrow">${esc(a.genre)} / ${esc(a.year)}</span><h1>${esc(a.title)}</h1><p><a href="#artist/${esc(a.artistId)}">${esc(artists.get(a.artistId)?.name||'Artist')}</a> · ${a.tracks.length} of ${a.expectedTracks} songs available</p><div class="quick-buttons"><button class="primary" data-start="${esc(a.id)}" ${!a.tracks.length?'disabled':''}>▶ Play release</button><button class="secondary" data-shuffle-album="${esc(a.id)}" ${!a.tracks.length?'disabled':''}>⤨ Shuffle release</button></div></div></div>
    ${!a.tracks.length?'<p class="empty">This release is catalog-only. Recordings have not yet been supplied.</p>':`${a.tracks.length<a.expectedTracks?'<p class="intro">A selection from this release is available. Remaining songs have not been added yet.</p>':''}${songTable(a.tracks)}`}`;
  }else if(route==='artist'&&artists.has(id)){
    const a=artists.get(id),ids=allIds().filter(t=>tracks.get(t)?.artistId===id);
    main.innerHTML=`<a class="eyebrow" href="#artists">← ALL ARTISTS</a><div class="detail"><img src="${esc(a.image)}" alt="${esc(a.name)}"><div><span class="eyebrow">ARTIST / COLLABORATOR</span><h1>${esc(a.name)}</h1><p>${esc(a.description)}</p><div class="quick-buttons"><button class="primary" data-artist="${esc(id)}" ${!ids.length?'disabled':''}>▶ Play artist</button><button class="secondary" data-shuffle-artist="${esc(id)}" ${!ids.length?'disabled':''}>⤨ Shuffle artist</button></div></div></div>${heading('Discography')}${cards(catalog.albums.filter(a=>a.artistId===id),true)}`;
  }else if(route==='likes'){
    main.innerHTML=`<span class="eyebrow">YOUR OWN LITTLE COLLECTION</span><h1 class="page-title">The ones you come back to.</h1><p class="intro">${state.likes.length} liked songs, saved on this device. Tap the ♥ on any song to add or remove it.</p><div class="quick-buttons"><button class="primary" data-start="likes" ${!state.likes.length?'disabled':''}>▶ Play liked songs</button><button class="secondary" data-shuffle-collection="likes" ${!state.likes.length?'disabled':''}>⤨ Shuffle likes</button></div>${songTable(state.likes)}`;
  }else if(route==='recent'){
    main.innerHTML=`<span class="eyebrow">JUST PLAYED</span><h1 class="page-title">Your listening history.</h1><p class="intro">Your last ${state.recent.length} unique songs on this device. Nothing is sent to an account.</p><div class="quick-buttons"><button class="primary" data-start="recent" ${!state.recent.length?'disabled':''}>▶ Play recent</button><button class="secondary" data-clear="recent" ${!state.recent.length?'disabled':''}>Clear history</button></div>${songTable(state.recent)}`;
  }else if(route==='playlists'){
    const list=state.playlists.map(p=>`<article class="playlist-card"><div><h3><a href="#playlist/${esc(p.id)}">${esc(p.name)}</a></h3><p>${p.ids.length} songs · saved on this device</p></div><div class="quick-buttons"><a class="secondary" href="#playlist/${esc(p.id)}">Open ↗</a><button class="secondary" data-playlist-start="${esc(p.id)}" ${!p.ids.length?'disabled':''}>▶ Play</button></div></article>`).join('');
    main.innerHTML=`<span class="eyebrow">YOUR COLLECTIONS</span><h1 class="page-title">Your playlists.</h1><p class="intro">Organize favorite sounds without creating an account. Playlists stay in this browser, not in a cloud account.</p><form id="playlist-form" class="playlist-form"><label for="playlist-name">New playlist</label><input id="playlist-name" name="playlistName" maxlength="50" placeholder="Name your mix" required><button class="primary" type="submit">Create playlist</button></form><div class="quick-buttons"><button class="secondary" data-save-queue ${!state.queue.length?'disabled':''}>Save current queue as a playlist</button></div><div class="playlist-grid">${list||'<p class="empty">No playlists yet. Create one above or save your current queue.</p>'}</div>`;
  }else if(route==='playlist' && state.playlists.some(p=>p.id===id)){
    const p=state.playlists.find(p=>p.id===id);
    main.innerHTML=`<a class="eyebrow" href="#playlists">← MY PLAYLISTS</a><h1 class="page-title">${esc(p.name)}</h1><p class="intro">${p.ids.length} songs, saved only in this browser.</p><div class="quick-buttons"><button class="primary" data-playlist-start="${esc(p.id)}" ${!p.ids.length?'disabled':''}>▶ Play playlist</button><button class="secondary" data-shuffle-playlist="${esc(p.id)}" ${!p.ids.length?'disabled':''}>⤨ Shuffle playlist</button><button class="secondary" data-delete-playlist="${esc(p.id)}">Delete playlist</button></div>${songTable(p.ids)}`;
  }else if(route==='queue'){
    main.innerHTML=`<span class="eyebrow">COMING THROUGH THE SPEAKERS</span><h1 class="page-title">Your queue.</h1><p class="intro">${state.queue.length} tracks. Use ↑ and ↓ to reorder. Shuffle ${state.shuffle?'on':'off'} · Repeat ${state.repeat}.</p><div class="quick-buttons"><button class="primary" data-start="queue" ${!state.queue.length?'disabled':''}>▶ Play queue</button><button class="secondary" data-shuffle-all>⤨ Shuffle everything</button><button class="secondary" data-clear="queue" ${!state.queue.length?'disabled':''}>Clear queue</button></div><label class="setting-row"><input id="continuous" type="checkbox" ${state.continuous?'checked':''}><span><strong>Keep the music going</strong><small>After this queue ends, continue through the rest of the available library. Repeat All keeps the current queue looping instead.</small></span></label>${songTable(state.queue,{queue:true})}`;
  }else if(route==='about'){
    main.innerHTML=`<article class="about"><span class="eyebrow">WELCOME IN</span><h1 class="page-title">A room for the music.</h1><p>The Heavy Moose / Good Flippin Vibes listening room brings independent artists together. Free listening. No subscriptions or advertisements.</p><h2>Take your music further</h2><p>Play or shuffle the entire available catalog, make playlists, like songs, reorder your queue and continue into the next release automatically. These settings, your recent tracks and playback position are saved in this browser. Clearing browser data removes them; they do not sync between devices.</p><h2>On your phone or in the car</h2><p>Install from your browser’s Add to Home Screen option. Bluetooth and lock-screen playback controls use the browser’s Media Session support, which varies with device and Android version. A web app cannot provide native Android Auto album browsing or guarantee uninterrupted background playback, so test your phone and vehicle. Reopen the app and press Play if playback is interrupted.</p><h2>Listening-only recordings</h2><p>The app shell can load without a connection after your first visit, but streaming requires internet. Restricted recordings are not cached or available for offline downloads. A permitted download button appears only if an artist explicitly enables it.</p><p><a href="https://heavymoose.com" target="_blank" rel="noopener">Heavy Moose ↗</a> · <a href="https://goodflippinvibes.com" target="_blank" rel="noopener">Good Flippin Vibes ↗</a></p></article>`;
  }else{
    main.innerHTML='<h1 class="page-title">That frequency is quiet.</h1><p class="intro"><a href="#discover">Return to the listening room ↗</a></p>';
  }
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
    if(b.dataset.video && /^[a-zA-Z0-9_-]{11}$/.test(b.dataset.video)){audio.pause();const frame=document.createElement('iframe');frame.src=`https://www.youtube-nocookie.com/embed/${b.dataset.video}?autoplay=1&rel=0`;frame.title='Bat Attack — Heavy Moose';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';frame.className='video-frame';b.replaceWith(frame);}
    if(b.dataset.start){const key=b.dataset.start;startList(key==='all'?catalog.albums.flatMap(a=>a.tracks):key==='likes'?state.likes:key==='queue'?state.queue:albums.get(key)?.tracks||[]);}
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
