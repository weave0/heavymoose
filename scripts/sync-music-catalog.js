#!/usr/bin/env node
/**
 * Refresh music-catalog.json (iTunes lookup) and media-library.json (YouTube).
 *
 * Usage:
 *   npm run catalog:sync
 *   node scripts/sync-music-catalog.js
 *
 * Sources:
 *   - iTunes: https://itunes.apple.com/lookup?id=1895530727&entity=album&limit=200
 *   - YouTube RSS (latest 15 only): https://www.youtube.com/feeds/videos.xml?channel_id=UCrGqGbSQYxxNAjsvlQ8tT8g
 *   - Official Music Videos playlist: https://www.youtube.com/playlist?list=PLqKeZP1HGoZmqeR60aYzywnEJDY227xgZ
 *
 * RSS is a 15-entry window. This script MERGES: existing media-library.json videos
 * are kept, newer RSS items are added, and nothing older than the RSS window is dropped.
 * Playlist membership is refreshed from YouTube and used as the /videos source of truth.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'assets/data/music-catalog.json');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');

const ITUNES_URL = 'https://itunes.apple.com/lookup?id=1895530727&entity=album&limit=200';
const YT_RSS_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCrGqGbSQYxxNAjsvlQ8tT8g';
const YT_BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
const HEAVY_MOOSE_ITUNES_ID = 1895530727;
const HEAVY_MOOSE_CHANNEL_ID = 'UCrGqGbSQYxxNAjsvlQ8tT8g';
const OFFICIAL_PLAYLIST_ID = 'PLqKeZP1HGoZmqeR60aYzywnEJDY227xgZ';
const TOPIC_CHANNEL_IDS = new Set(['UClXJsYy8qljXchec1hbWLTg']);

const FEATURE_VIDEO_IDS = new Set([
    'AVBnhx2jA7c', // Stuff and Things (Bobba)
    'hoN657bntjg', // Sorry ('bout your wall)
    'sXHNn1w04uo', // Give the Nuns One
    'OXXuboDQ2Qk'  // Every Night
]);

const WATCH_PAGE_BY_VIDEO = {
    _AlTynB84dE: 'video-wiggle-pit-it.html',
    spupt7sFlVs: 'video-well-deep.html',
    'ggsk-w-rzvA': 'video-have-a-waffle.html',
    HNascZ8Eflo: 'video-try-meh.html',
    'W33Yw2o-Yaw': 'video-jack.html',
    '4pLOb0lknOk': 'video-missed-some-80s.html',
    '8UTeaFOOWPw': 'video-no.html',
    NM4Nrv9zyN8: 'video-lux-laugh-protocol.html',
    jA9QxKiTnUc: 'video-move-then-prove.html'
};

const KNOWN_VIDEO_ASSOCIATIONS = {
    _AlTynB84dE: { associatedReleaseSlug: 'double-t-moose' },
    'ggsk-w-rzvA': { associatedReleaseSlug: 'whisp', associatedTrackTitle: 'Have a Waffle' },
    HNascZ8Eflo: { associatedReleaseSlug: 'meh' },
    qPbUA9RziPo: { associatedReleaseSlug: 'yippee-ki-yay', associatedTrackTitle: 'Que Tal (Sun)' },
    'W33Yw2o-Yaw': { associatedReleaseSlug: 'jack' },
    '2qa2wZcODV8': { associatedReleaseSlug: 'yippee-ki-yay' },
    '1ZUs-jUahqE': { associatedReleaseSlug: 'pas-de-l-art' },
    'y-55hCaxNlk': { associatedReleaseSlug: 'moose-pudding' },
    '80p8JL7b1J0': { associatedReleaseSlug: 'welp' },
    WJjpcPs6YsU: { associatedReleaseSlug: 'welp' },
    OXXuboDQ2Qk: { associatedReleaseSlug: 'temper', associatedTrackTitle: 'Every Night' },
    '8UTeaFOOWPw': { associatedReleaseSlug: 'temper', associatedTrackTitle: 'NO' },
    NM4Nrv9zyN8: { associatedReleaseSlug: 'floor-witness', associatedTrackTitle: 'Lux Laugh Protocol' },
    lrK4cAsJYeA: { associatedReleaseSlug: 'floor-witness', associatedTrackTitle: 'Air Punch Ceremony' }
};

const WEB_CLIENT = {
    clientName: 'WEB',
    clientVersion: '2.20260101.00.00',
    hl: 'en',
    gl: 'US'
};

function curlText(url) {
    const result = spawnSync('curl', ['-fsSL', '-A', 'HeavyMooseCatalogSync/1.0', url], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });
    if (result.status !== 0) {
        throw new Error('Failed to fetch ' + url + ': ' + (result.stderr || result.status));
    }
    return result.stdout;
}

function curlJson(url) {
    return JSON.parse(curlText(url));
}

function curlJsonPost(url, payload) {
    const result = spawnSync(
        'curl',
        [
            '-fsSL',
            '-A', 'HeavyMooseCatalogSync/1.0',
            '-H', 'Content-Type: application/json',
            '-H', 'Origin: https://www.youtube.com',
            '-H', 'Referer: https://www.youtube.com/',
            '--data-binary', '@-',
            url
        ],
        {
            input: JSON.stringify(payload),
            encoding: 'utf8',
            maxBuffer: 20 * 1024 * 1024
        }
    );
    if (result.status !== 0) {
        throw new Error('Failed to POST ' + url + ': ' + (result.stderr || result.status));
    }
    return JSON.parse(result.stdout);
}

function curlFile(url, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const result = spawnSync('curl', ['-fsSL', '-A', 'HeavyMooseCatalogSync/1.0', '-o', dest, url], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });
    if (result.status !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 100) {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        throw new Error('Failed to download ' + url);
    }
}

function slugifyTitle(title) {
    return String(title)
        .replace(/ - (Single|EP)$/i, '')
        .toLowerCase()
        .replace(/['’]/g, '-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function cleanDisplayTitle(title) {
    return String(title)
        .replace(/\s*#[^\s#].*$/u, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function releaseTypeFromName(name) {
    if (/ - Single$/i.test(name)) return 'single';
    if (/ - EP$/i.test(name)) return 'ep';
    return 'album';
}

function artworkUrl800(artworkUrl100) {
    if (!artworkUrl100) return '';
    return artworkUrl100.replace(/\/\d+x\d+bb\./, '/800x800bb.');
}

function isTopicChannel(authorName, authorUrl) {
    const name = String(authorName || '');
    const url = String(authorUrl || '');
    if (TOPIC_CHANNEL_IDS.has(url.split('/').pop())) return true;
    if (/ - Topic$/i.test(name)) return true;
    if (/\/channel\/UClXJsYy8qljXchec1hbWLTg/.test(url)) return true;
    return false;
}

function classifyVideo(rawTitle, description) {
    const haystack = (rawTitle + ' ' + (description || '')).toLowerCase();
    if (/\bbf\b/.test(haystack) && /america got ya/.test(haystack)) {
        return {
            catalogClass: 'collaboration',
            heavyMooseRole: 'collaborator',
            includeInLatestMusicVideos: false
        };
    }
    if (/\(feat\.?\s*heavy moose\)/i.test(rawTitle) || /feat\.?\s*heavy moose/i.test(rawTitle)) {
        return {
            catalogClass: 'feature-appearance',
            heavyMooseRole: 'featured-artist',
            includeInLatestMusicVideos: false
        };
    }
    return {
        catalogClass: 'primary-release',
        heavyMooseRole: 'primary-artist',
        includeInLatestMusicVideos: true
    };
}

function matchRelease(title, description, catalog) {
    const haystack = (title + ' ' + (description || '')).toLowerCase();
    const ranked = catalog.releases
        .map(function (release) {
            const needle = release.title.replace(/ - (Single|EP)$/i, '').toLowerCase();
            if (needle.length < 3) return null;
            if (haystack.indexOf(needle) === -1 && haystack.indexOf(release.slug.replace(/-/g, ' ')) === -1) {
                return null;
            }
            return { release: release, score: needle.length };
        })
        .filter(Boolean)
        .sort(function (a, b) { return b.score - a.score; });
    return ranked[0] ? ranked[0].release : null;
}

function parseRss(xml) {
    const entries = [];
    const blocks = xml.split(/<entry>/i).slice(1);
    blocks.forEach(function (block) {
        const id = (block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
        const title = (block.match(/<title>([^<]+)<\/title>/) || [])[1];
        const published = (block.match(/<published>([^<]+)<\/published>/) || [])[1];
        const description = (block.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || '';
        const author = (block.match(/<name>([^<]+)<\/name>/) || [])[1] || '';
        const channelId = (block.match(/<yt:channelId>([^<]+)<\/yt:channelId>/) || [])[1] || '';
        if (!id || !title) return;
        entries.push({
            videoId: id,
            rawTitle: title.trim(),
            publishedAt: published,
            description: description.trim(),
            authorName: author,
            channelId: channelId
        });
    });
    return entries;
}

function findContinuationToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.continuationCommand && obj.continuationCommand.token) {
        return obj.continuationCommand.token;
    }
    const values = Array.isArray(obj) ? obj : Object.keys(obj).map(function (key) { return obj[key]; });
    for (let i = 0; i < values.length; i += 1) {
        const found = findContinuationToken(values[i]);
        if (found) return found;
    }
    return null;
}

function collectPlaylistLockups(obj, collected) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.lockupViewModel && obj.lockupViewModel.contentId) {
        const vm = obj.lockupViewModel;
        const videoId = vm.contentId;
        if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
            const title = ((((vm.metadata || {}).lockupMetadataViewModel || {}).title) || {}).content || '';
            collected.push({
                videoId: videoId,
                rawTitle: title,
                playlistIndex: collected.length
            });
        }
    }
    const values = Array.isArray(obj) ? obj : Object.keys(obj).map(function (key) { return obj[key]; });
    values.forEach(function (value) {
        collectPlaylistLockups(value, collected);
    });
}

function fetchOfficialPlaylist() {
    const items = [];
    const seen = new Set();
    let payload = {
        context: { client: WEB_CLIENT },
        browseId: 'VL' + OFFICIAL_PLAYLIST_ID
    };
    let guard = 0;
    while (payload && guard < 8) {
        guard += 1;
        const data = curlJsonPost(YT_BROWSE_URL, payload);
        const pageItems = [];
        collectPlaylistLockups(data, pageItems);
        pageItems.forEach(function (item) {
            if (seen.has(item.videoId)) return;
            seen.add(item.videoId);
            items.push({
                videoId: item.videoId,
                rawTitle: item.rawTitle,
                playlistIndex: items.length
            });
        });
        const token = findContinuationToken(data);
        payload = token
            ? { context: { client: WEB_CLIENT }, continuation: token }
            : null;
    }
    return items;
}

function fetchOEmbed(videoId) {
    const url = 'https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId) + '&format=json';
    try {
        return curlJson(url);
    } catch (err) {
        console.warn('oembed skip', videoId, err.message);
        return null;
    }
}

function buildVideoRecord(entry, catalog, current) {
    const rawTitle = entry.rawTitle || (current && current.rawTitle) || entry.videoId;
    const title = current ? current.title : cleanDisplayTitle(rawTitle);
    const classified = current
        ? {
            catalogClass: current.catalogClass,
            heavyMooseRole: current.heavyMooseRole,
            includeInLatestMusicVideos: current.includeInLatestMusicVideos
        }
        : classifyVideo(rawTitle, entry.description || '');
    const known = KNOWN_VIDEO_ASSOCIATIONS[entry.videoId] || {};
    const matched = matchRelease(title + ' ' + rawTitle, entry.description || '', catalog);
    const associatedReleaseSlug = current && current.associatedReleaseSlug
        ? current.associatedReleaseSlug
        : (known.associatedReleaseSlug || (matched && matched.slug) || null);
    const associated = associatedReleaseSlug
        ? catalog.releases.find(function (release) { return release.slug === associatedReleaseSlug; })
        : null;
    return {
        title: title,
        rawTitle: rawTitle,
        slug: current ? current.slug : slugifyTitle(title),
        videoId: entry.videoId,
        publishedAt: entry.publishedAt || (current && current.publishedAt) || '',
        watchUrl: 'https://www.youtube.com/watch?v=' + entry.videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + entry.videoId,
        thumbnailUrl: 'https://i.ytimg.com/vi/' + entry.videoId + '/hqdefault.jpg',
        description: entry.description || (current && current.description) || '',
        catalogClass: classified.catalogClass,
        heavyMooseRole: classified.heavyMooseRole,
        associatedTrackTitle: current && current.associatedTrackTitle
            ? current.associatedTrackTitle
            : (known.associatedTrackTitle || null),
        associatedReleaseSlug: associatedReleaseSlug,
        associatedReleaseTitle: associated ? associated.title : (current && current.associatedReleaseTitle) || null,
        associatedArtwork: associated ? associated.artwork : (current && current.associatedArtwork) || null,
        watchPage: WATCH_PAGE_BY_VIDEO[entry.videoId] || (current && current.watchPage) || null,
        isLatestUpload: false,
        includeInLatestMusicVideos: classified.includeInLatestMusicVideos,
        inOfficialMusicVideosPlaylist: false,
        officialPlaylistIndex: null,
        includeInFeaturesGroup: false
    };
}

function syncCatalog(existing) {
    const payload = curlJson(ITUNES_URL);
    const byId = new Map();
    existing.releases.forEach(function (release) {
        byId.set(Number(release.appleMusicId), release);
    });

    (payload.results || []).forEach(function (item) {
        if (item.wrapperType !== 'collection') return;
        if (item.artistId !== HEAVY_MOOSE_ITUNES_ID) return;
        const appleMusicId = item.collectionId;
        const appleMusicUrl = String(item.collectionViewUrl || '').replace(/\?uo=4$/, '');
        const releaseDate = String(item.releaseDate || '').slice(0, 10);
        const artworkSource = artworkUrl800(item.artworkUrl100);
        const current = byId.get(appleMusicId);
        const slug = current ? current.slug : slugifyTitle(item.collectionName);
        const artworkRel = current && current.artwork
            ? current.artwork
            : 'assets/images/releases/' + slug + '.jpg';
        const dest = path.join(ROOT, artworkRel);
        if (artworkSource && !fs.existsSync(dest)) {
            try {
                curlFile(artworkSource, dest);
                console.log('artwork', artworkRel);
            } catch (err) {
                console.warn('artwork skip', slug, err.message);
            }
        }
        const next = {
            title: current ? current.title : item.collectionName.replace(/\u2010/g, '-'),
            slug: slug,
            type: current ? current.type : releaseTypeFromName(item.collectionName),
            releaseDate: releaseDate || (current && current.releaseDate) || '',
            trackCount: item.trackCount || (current && current.trackCount) || 0,
            genre: item.primaryGenreName || (current && current.genre) || 'Electronic',
            appleMusicId: appleMusicId,
            appleMusicUrl: appleMusicUrl || (current && current.appleMusicUrl),
            artwork: artworkRel,
            artworkSource: artworkSource || (current && current.artworkSource) || ''
        };
        byId.set(appleMusicId, next);
    });

    const releases = Array.from(byId.values()).sort(function (a, b) {
        if (a.releaseDate === b.releaseDate) return a.title.localeCompare(b.title);
        return a.releaseDate < b.releaseDate ? 1 : -1;
    });

    const latest = releases[0];
    return {
        artist: existing.artist,
        source: ITUNES_URL,
        updatedAt: new Date().toISOString(),
        releases: releases,
        latest: latest
    };
}

function upsertVideo(byId, entry, catalog) {
    if (isTopicChannel(entry.authorName, entry.authorUrl) || TOPIC_CHANNEL_IDS.has(entry.channelId)) {
        console.warn('skip topic-channel video', entry.videoId);
        return;
    }
    const current = byId.get(entry.videoId);
    byId.set(entry.videoId, buildVideoRecord(entry, catalog, current));
}

function syncMedia(existing, catalog) {
    const xml = curlText(YT_RSS_URL);
    const rssVideos = parseRss(xml);
    const byId = new Map();

    existing.videos.forEach(function (video) {
        byId.set(video.videoId, Object.assign({}, video, {
            isLatestUpload: false,
            inOfficialMusicVideosPlaylist: false,
            officialPlaylistIndex: null,
            includeInFeaturesGroup: false
        }));
    });

    rssVideos.forEach(function (entry) {
        upsertVideo(byId, entry, catalog);
    });

    let playlistItems = [];
    try {
        playlistItems = fetchOfficialPlaylist();
        console.log('official playlist', playlistItems.length, 'videos');
    } catch (err) {
        console.warn('playlist fetch failed; keeping existing membership flags', err.message);
        existing.videos.forEach(function (video) {
            const current = byId.get(video.videoId);
            if (!current) return;
            current.inOfficialMusicVideosPlaylist = Boolean(video.inOfficialMusicVideosPlaylist);
            current.officialPlaylistIndex = video.officialPlaylistIndex;
            current.includeInFeaturesGroup = Boolean(video.includeInFeaturesGroup);
        });
    }

    playlistItems.forEach(function (item) {
        if (!byId.has(item.videoId)) {
            upsertVideo(byId, {
                videoId: item.videoId,
                rawTitle: item.rawTitle,
                description: ''
            }, catalog);
        }
        const record = byId.get(item.videoId);
        if (!record) return;
        record.inOfficialMusicVideosPlaylist = true;
        record.officialPlaylistIndex = item.playlistIndex;
        record.includeInFeaturesGroup = false;
        if (item.rawTitle && (!record.rawTitle || record.rawTitle === item.videoId)) {
            record.rawTitle = item.rawTitle;
            if (!record.title || record.title === item.videoId) {
                record.title = cleanDisplayTitle(item.rawTitle);
            }
        }
    });

    FEATURE_VIDEO_IDS.forEach(function (videoId) {
        if (!byId.has(videoId)) {
            const oembed = fetchOEmbed(videoId);
            if (!oembed) return;
            if (isTopicChannel(oembed.author_name, oembed.author_url)) {
                console.warn('skip topic-channel feature', videoId);
                return;
            }
            upsertVideo(byId, {
                videoId: videoId,
                rawTitle: oembed.title,
                description: '',
                authorName: oembed.author_name,
                authorUrl: oembed.author_url
            }, catalog);
        }
        const record = byId.get(videoId);
        if (!record) return;
        if (!record.inOfficialMusicVideosPlaylist) {
            record.includeInFeaturesGroup = true;
            record.includeInLatestMusicVideos = false;
        }
    });

    byId.forEach(function (video) {
        if (WATCH_PAGE_BY_VIDEO[video.videoId]) {
            video.watchPage = WATCH_PAGE_BY_VIDEO[video.videoId];
        }
        if (!video.inOfficialMusicVideosPlaylist && FEATURE_VIDEO_IDS.has(video.videoId)) {
            video.includeInFeaturesGroup = true;
        }
    });

    const videos = Array.from(byId.values()).sort(function (a, b) {
        const aDate = String(a.publishedAt || '');
        const bDate = String(b.publishedAt || '');
        if (aDate && bDate && aDate !== bDate) {
            return bDate < aDate ? -1 : 1;
        }
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        const aIdx = a.officialPlaylistIndex;
        const bIdx = b.officialPlaylistIndex;
        if (aIdx != null && bIdx != null && aIdx !== bIdx) return aIdx - bIdx;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });

    const officialNewest = videos
        .filter(function (video) { return video.inOfficialMusicVideosPlaylist; })
        .sort(function (a, b) {
            if (a.officialPlaylistIndex != null && b.officialPlaylistIndex != null) {
                return a.officialPlaylistIndex - b.officialPlaylistIndex;
            }
            return String(b.publishedAt || '') < String(a.publishedAt || '') ? -1 : 1;
        })[0];
    const fallbackNewest = videos[0];
    const latestOfficial = officialNewest || fallbackNewest;
    if (latestOfficial) {
        latestOfficial.isLatestUpload = true;
    }

    const latestAlbum = catalog.releases[0];
    return {
        artist: existing.artist,
        source: {
            itunes: ITUNES_URL,
            youtubeRss: YT_RSS_URL,
            officialPlaylist: 'https://www.youtube.com/playlist?list=' + OFFICIAL_PLAYLIST_ID,
            officialPlaylistId: OFFICIAL_PLAYLIST_ID,
            youtubeChannelId: HEAVY_MOOSE_CHANNEL_ID
        },
        releasesUpdatedAt: catalog.updatedAt,
        latestReleaseSlug: latestAlbum ? latestAlbum.slug : existing.latestReleaseSlug,
        latestReleaseTitle: latestAlbum ? latestAlbum.title : existing.latestReleaseTitle,
        latestReleaseDate: latestAlbum ? latestAlbum.releaseDate : existing.latestReleaseDate,
        latestMusicVideoId: latestOfficial ? latestOfficial.videoId : existing.latestMusicVideoId,
        latestUploadVideoId: latestOfficial ? latestOfficial.videoId : existing.latestUploadVideoId,
        officialPlaylistId: OFFICIAL_PLAYLIST_ID,
        officialPlaylistCount: playlistItems.length || videos.filter(function (video) { return video.inOfficialMusicVideosPlaylist; }).length,
        videosUpdatedAt: new Date().toISOString(),
        videos: videos
    };
}

function main() {
    const catalogExisting = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const mediaExisting = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
    const existingCount = (mediaExisting.videos || []).length;

    const catalogSynced = syncCatalog(catalogExisting);
    const latest = catalogSynced.latest;
    delete catalogSynced.latest;
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalogSynced, null, 2) + '\n');
    console.log('catalog', catalogSynced.releases.length, 'releases; latest', latest && latest.title, latest && latest.releaseDate);

    const mediaSynced = syncMedia(mediaExisting, catalogSynced);
    fs.writeFileSync(MEDIA_PATH, JSON.stringify(mediaSynced, null, 2) + '\n');
    const officialCount = mediaSynced.videos.filter(function (video) { return video.inOfficialMusicVideosPlaylist; }).length;
    const featureCount = mediaSynced.videos.filter(function (video) { return video.includeInFeaturesGroup; }).length;
    console.log(
        'videos', mediaSynced.videos.length, 'entries (was', existingCount + ');',
        'official playlist', officialCount + ';',
        'features', featureCount + ';',
        'latest', mediaSynced.latestUploadVideoId
    );
    if (mediaSynced.videos.length < existingCount) {
        throw new Error('Refusing to write a smaller video list. Merge should never drop existing media-library entries.');
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
