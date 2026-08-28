#!/usr/bin/env node
/**
 * Refresh music-catalog.json (iTunes lookup) and media-library.json (YouTube RSS).
 *
 * Usage:
 *   node scripts/sync-catalogs.js
 *
 * Sources:
 *   - iTunes: https://itunes.apple.com/lookup?id=1895530727&entity=album&limit=200
 *   - YouTube RSS (latest 15): https://www.youtube.com/feeds/videos.xml?channel_id=UCrGqGbSQYxxNAjsvlQ8tT8g
 *
 * Existing JSON entries are preserved and merged. New Apple artwork is saved under
 * assets/images/releases/. New videos inherit catalogClass rules from current records.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'assets/data/music-catalog.json');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');
const ARTWORK_DIR = path.join(ROOT, 'assets/images/releases');

const ITUNES_URL = 'https://itunes.apple.com/lookup?id=1895530727&entity=album&limit=200';
const YT_RSS_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCrGqGbSQYxxNAjsvlQ8tT8g';
const HEAVY_MOOSE_ITUNES_ID = 1895530727;

const KNOWN_VIDEO_ASSOCIATIONS = {
    _AlTynB84dE: { associatedReleaseSlug: 'double-t-moose' },
    'ggsk-w-rzvA': { associatedReleaseSlug: 'whisp', associatedTrackTitle: 'Have a Waffle' },
    HNascZ8Eflo: { associatedReleaseSlug: 'meh' },
    qPbUA9RziPo: { associatedReleaseSlug: 'yippee-ki-yay', associatedTrackTitle: 'Que Tal (Sun)' }
};

function curlJson(url) {
    const result = spawnSync('curl', ['-fsSL', '-A', 'HeavyMooseCatalogSync/1.0', url], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });
    if (result.status !== 0) {
        throw new Error('Failed to fetch ' + url + ': ' + (result.stderr || result.status));
    }
    return result.stdout;
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
        if (!id || !title) return;
        entries.push({
            videoId: id,
            rawTitle: title.trim(),
            publishedAt: published,
            description: description.trim()
        });
    });
    return entries;
}

function syncCatalog(existing) {
    const payload = JSON.parse(curlJson(ITUNES_URL));
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

function syncMedia(existing, catalog) {
    const xml = curlJson(YT_RSS_URL);
    const rssVideos = parseRss(xml);
    const byId = new Map();
    existing.videos.forEach(function (video) {
        byId.set(video.videoId, Object.assign({}, video, { isLatestUpload: false }));
    });

    rssVideos.forEach(function (entry) {
        const current = byId.get(entry.videoId);
        const title = current ? current.title : cleanDisplayTitle(entry.rawTitle);
        const classified = current
            ? {
                catalogClass: current.catalogClass,
                heavyMooseRole: current.heavyMooseRole,
                includeInLatestMusicVideos: current.includeInLatestMusicVideos
            }
            : classifyVideo(entry.rawTitle, entry.description);
        const known = KNOWN_VIDEO_ASSOCIATIONS[entry.videoId] || {};
        const matched = matchRelease(title + ' ' + entry.rawTitle, entry.description, catalog);
        const associatedReleaseSlug = current && current.associatedReleaseSlug
            ? current.associatedReleaseSlug
            : (known.associatedReleaseSlug || (matched && matched.slug) || null);
        const associated = associatedReleaseSlug
            ? catalog.releases.find(function (release) { return release.slug === associatedReleaseSlug; })
            : null;
        const next = {
            title: title,
            rawTitle: entry.rawTitle,
            slug: current ? current.slug : slugifyTitle(title),
            videoId: entry.videoId,
            publishedAt: entry.publishedAt || (current && current.publishedAt),
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
            isLatestUpload: false,
            includeInLatestMusicVideos: classified.includeInLatestMusicVideos
        };
        byId.set(entry.videoId, next);
    });

    const videos = Array.from(byId.values()).sort(function (a, b) {
        return String(b.publishedAt || '') < String(a.publishedAt || '') ? -1 : 1;
    });
    const latest = videos[0];
    if (latest) {
        latest.isLatestUpload = true;
    }

    const latestAlbum = catalog.releases[0];
    return {
        artist: existing.artist,
        releasesUpdatedAt: catalog.updatedAt,
        latestReleaseSlug: latestAlbum ? latestAlbum.slug : existing.latestReleaseSlug,
        latestReleaseTitle: latestAlbum ? latestAlbum.title : existing.latestReleaseTitle,
        latestReleaseDate: latestAlbum ? latestAlbum.releaseDate : existing.latestReleaseDate,
        latestMusicVideoId: latest ? latest.videoId : existing.latestMusicVideoId,
        latestUploadVideoId: latest ? latest.videoId : existing.latestUploadVideoId,
        videosUpdatedAt: new Date().toISOString(),
        videos: videos
    };
}

function main() {
    const catalogExisting = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const mediaExisting = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));

    const catalogSynced = syncCatalog(catalogExisting);
    const latest = catalogSynced.latest;
    delete catalogSynced.latest;
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalogSynced, null, 2) + '\n');
    console.log('catalog', catalogSynced.releases.length, 'releases; latest', latest && latest.title, latest && latest.releaseDate);

    const mediaSynced = syncMedia(mediaExisting, catalogSynced);
    fs.writeFileSync(MEDIA_PATH, JSON.stringify(mediaSynced, null, 2) + '\n');
    console.log('videos', mediaSynced.videos.length, 'entries; latest', mediaSynced.latestUploadVideoId);
}

main();
