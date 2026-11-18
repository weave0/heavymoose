const unique = values => [...new Set(values)];

export function restore(raw, tracks) {
  const ids = new Set(tracks.map(t => t.id));
  let saved = {};
  try { saved = JSON.parse(raw) || {}; } catch { /* Corrupt or first-run storage. */ }
  if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const valid = (values, max = 10000) => Array.isArray(values) ?
    unique(values.filter(id => ids.has(id))).slice(0, max) : [];
  const queue = valid(saved.queue);
  const playlists = Array.isArray(saved.playlists) ? saved.playlists.slice(0, 30)
    .filter(p => p && typeof p.id === 'string' && /^[a-z0-9-]{1,80}$/i.test(p.id) &&
      typeof p.name === 'string' && p.name.trim())
    .map(p => ({ id: p.id, name: p.name.trim().slice(0, 50), ids: valid(p.ids) })) : [];
  return {
    queue, upNext: valid(saved.upNext).filter(id => queue.includes(id)),
    current: ids.has(saved.current) ? saved.current : null,
    likes: valid(saved.likes), playlists, recent: valid(saved.recent, 30),
    shuffleSeen: valid(saved.shuffleSeen).filter(id => queue.includes(id)),
    shuffle: saved.shuffle === true,
    repeat: ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off',
    continuous: saved.continuous !== false,
    volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : .8,
    time: Number.isFinite(saved.time) ? Math.max(0, saved.time) : 0
  };
}

export function nextId(state, direction = 1, ended = false, random = Math.random) {
  const q = state.queue || [];
  if (!q.length) return null;
  if (ended && state.repeat === 'one') return state.current || q[0];
  if (direction > 0 && state.upNext?.length) return state.upNext[0];
  const index = q.indexOf(state.current);
  if (state.shuffle && direction > 0) {
    const seen = new Set(state.shuffleSeen || []);
    if (state.current) seen.add(state.current);
    let choices = q.filter(id => !seen.has(id));
    if (!choices.length && state.repeat === 'all') {
      choices = q.filter(id => id !== state.current);
    }
    if (!choices.length) return q.length === 1 && state.repeat === 'all' ? q[0] : null;
    const value = Number(random());
    const randomIndex = Number.isFinite(value) ? Math.min(choices.length - 1, Math.floor(Math.max(0, value) * choices.length)) : 0;
    return choices[randomIndex];
  }
  const next = index + direction;
  if (next >= 0 && next < q.length) return q[next];
  if (state.repeat === 'all') return direction > 0 ? q[0] : q[q.length - 1];
  return null;
}

export function enqueueNext(queue, current, id) {
  const next = queue.filter(item => item !== id);
  const index = next.indexOf(current);
  next.splice(index < 0 ? 0 : index + 1, 0, id);
  return next;
}

export function moveInQueue(queue, index, direction) {
  const to = index + direction;
  if (index < 0 || to < 0 || index >= queue.length || to >= queue.length) return [...queue];
  const result = [...queue];
  [result[index], result[to]] = [result[to], result[index]];
  return result;
}

// Preserve the requested album order, then add the rest of the available library once.
export function extendQueue(queue, library) {
  const seen = new Set(queue);
  return [...queue, ...library.filter(id => !seen.has(id) && (seen.add(id), true))];
}

export function searchCatalog(catalog, query) {
  const q = query.toLocaleLowerCase().trim();
  const artists = new Map(catalog.artists.map(a => [a.id, a]));
  const albums = new Map(catalog.albums.map(a => [a.id, a]));
  return {
    albums: catalog.albums.filter(a => `${a.title} ${artists.get(a.artistId)?.name} ${a.genre}`.toLocaleLowerCase().includes(q)),
    tracks: catalog.tracks.filter(t => `${t.title} ${artists.get(t.artistId)?.name} ${albums.get(t.albumId)?.title}`.toLocaleLowerCase().includes(q))
  };
}
