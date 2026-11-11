export function restore(raw, tracks) {
  const ids = new Set(tracks.map(t=>t.id));
  let s = {};try { s=JSON.parse(raw)||{}; } catch { /* Fresh state after corrupted storage. */ }
  const queue = Array.isArray(s.queue)?[...new Set(s.queue.filter(id=>ids.has(id)))]:[];
  return {queue,current:ids.has(s.current)?s.current:null,likes:Array.isArray(s.likes)?[...new Set(s.likes.filter(id=>ids.has(id)))]:[],shuffle:s.shuffle===true,repeat:['off','all','one'].includes(s.repeat)?s.repeat:'off',volume:Number.isFinite(s.volume)?Math.max(0,Math.min(1,s.volume)):.8,time:Number.isFinite(s.time)?Math.max(0,s.time):0};
}
export function nextId(state, direction=1, ended=false, random=Math.random) {
  const q=state.queue;
  if(!q.length)return null;
  if(ended && state.repeat==='one')return state.current || q[0];
  const index=q.indexOf(state.current);
  if(state.shuffle && q.length>1 && direction>0) {
    const choices=q.filter(id=>id!==state.current);
    return choices[Math.floor(random()*choices.length)];
  }
  const next=index+direction;
  if(next>=0 && next<q.length)return q[next];
  if(state.repeat==='all')return direction>0?q[0]:q[q.length-1];
  return null;
}
export function searchCatalog(catalog, query) {
  const q=query.toLocaleLowerCase().trim();
  const artists=new Map(catalog.artists.map(a=>[a.id,a]));
  const albums=new Map(catalog.albums.map(a=>[a.id,a]));
  return {albums:catalog.albums.filter(a=>`${a.title} ${artists.get(a.artistId)?.name} ${a.genre}`.toLocaleLowerCase().includes(q)),tracks:catalog.tracks.filter(t=>`${t.title} ${artists.get(t.artistId)?.name} ${albums.get(t.albumId)?.title}`.toLocaleLowerCase().includes(q))};
}
