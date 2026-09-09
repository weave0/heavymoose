#!/usr/bin/env node
/**
 * Refresh the complete known Heavy Moose YouTube library without a private API key.
 * The public browser API key/client version are discovered from the Heavy Moose
 * channel page itself, then candidate video IDs are verified against the canonical
 * channel before view counts or newest-upload status are accepted.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');
const CHANNEL_ID = 'UCrGqGbSQYxxNAjsvlQ8tT8g';
const CHANNEL_URL = 'https://www.youtube.com/@HeavyMoose/videos?hl=en&gl=US';
const MIN_VERIFIED = 10;
const CONCURRENCY = 6;
const TIMEOUT_MS = 12000;

async function request(url, options) {
    const response = await fetch(url, Object.assign({
        redirect: 'follow',
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
            'accept-language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
    }, options || {}));
    if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
    return response;
}

function firstMatch(text, regex, label) {
    const match = text.match(regex);
    if (!match) throw new Error('Could not discover ' + label + ' from YouTube channel page.');
    return match[1];
}

async function discoverBrowserClient() {
    const html = await (await request(CHANNEL_URL)).text();
    const apiKey = firstMatch(html, /"INNERTUBE_API_KEY":"([^"]+)"/, 'INNERTUBE_API_KEY');
    const clientVersion = firstMatch(html, /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/, 'INNERTUBE_CLIENT_VERSION');
    const ids = [];
    const seen = new Set();
    const regex = /"videoId":"([A-Za-z0-9_-]{11})"/g;
    let match;
    while ((match = regex.exec(html)) && ids.length < 100) {
        if (seen.has(match[1])) continue;
        seen.add(match[1]);
        ids.push(match[1]);
    }
    return { apiKey: apiKey, clientVersion: clientVersion, channelPageVideoIds: ids };
}

async function playerMetadata(videoId, client) {
    const response = await request(
        'https://www.youtube.com/youtubei/v1/player?key=' + encodeURIComponent(client.apiKey) + '&prettyPrint=false',
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
                'origin': 'https://www.youtube.com',
                'referer': CHANNEL_URL
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: client.clientVersion,
                        hl: 'en',
                        gl: 'US'
                    }
                },
                videoId: videoId,
                contentCheckOk: true,
                racyCheckOk: true
            })
        }
    );
    const data = await response.json();
    const details = data && data.videoDetails;
    if (!details || details.channelId !== CHANNEL_ID) return null;

    const micro = data.microformat && data.microformat.playerMicroformatRenderer;
    const thumbs = details.thumbnail && details.thumbnail.thumbnails;
    const published = micro && (micro.publishDate || micro.uploadDate);
    return {
        videoId: videoId,
        title: details.title || videoId,
        description: details.shortDescription || '',
        publishedAt: published ? published + (/^\d{4}-\d{2}-\d{2}$/.test(published) ? 'T00:00:00+00:00' : '') : '',
        viewCount: Number.isFinite(Number(details.viewCount)) ? Number(details.viewCount) : null,
        durationSeconds: Number(details.lengthSeconds) || null,
        thumbnailUrl: Array.isArray(thumbs) && thumbs.length ? thumbs[thumbs.length - 1].url : 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
        playable: !data.playabilityStatus || data.playabilityStatus.status === 'OK'
    };
}

function slugify(value) {
    return String(value || '').toLowerCase().replace(/['’]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function asVideo(meta, current, now) {
    return Object.assign({
        title: meta.title,
        rawTitle: meta.title,
        slug: slugify(meta.title),
        videoId: meta.videoId,
        publishedAt: meta.publishedAt,
        watchUrl: 'https://www.youtube.com/watch?v=' + meta.videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + meta.videoId,
        thumbnailUrl: meta.thumbnailUrl,
        description: meta.description,
        catalogClass: 'primary-release',
        heavyMooseRole: 'primary-artist',
        associatedTrackTitle: null,
        associatedReleaseSlug: null,
        associatedReleaseTitle: null,
        associatedArtwork: null,
        watchPage: null,
        includeInLatestMusicVideos: true,
        inOfficialMusicVideosPlaylist: false,
        officialPlaylistIndex: null,
        includeInFeaturesGroup: false
    }, current || {}, {
        title: (current && current.title) || meta.title,
        rawTitle: meta.title,
        publishedAt: meta.publishedAt || (current && current.publishedAt) || '',
        watchUrl: 'https://www.youtube.com/watch?v=' + meta.videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + meta.videoId,
        thumbnailUrl: (current && current.thumbnailUrl) || meta.thumbnailUrl,
        inChannelUploads: true,
        isLatestUpload: false,
        youtubeViewCount: meta.viewCount,
        youtubeViewCountText: meta.viewCount == null ? '' : meta.viewCount.toLocaleString('en-US') + ' views',
        youtubeMetricsUpdatedAt: now,
        youtubePlayable: meta.playable,
        youtubeDurationSeconds: meta.durationSeconds,
        youtubePopularityRank: null
    });
}

async function main() {
    const media = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
    const now = new Date().toISOString();
    const existing = new Map((media.videos || []).map(function (video) { return [video.videoId, video]; }));
    const client = await discoverBrowserClient();

    const candidates = [];
    const seen = new Set();
    function add(id) {
        if (!id || seen.has(id)) return;
        seen.add(id);
        candidates.push(id);
    }
    client.channelPageVideoIds.forEach(add);
    (media.videos || []).forEach(function (video) {
        if (video.heavyMooseRole === 'primary-artist' || video.inOfficialMusicVideosPlaylist || video.includeInLatestMusicVideos) add(video.videoId);
    });

    const results = new Array(candidates.length);
    let cursor = 0;
    async function worker() {
        while (true) {
            const index = cursor++;
            if (index >= candidates.length) return;
            const id = candidates[index];
            try {
                results[index] = await playerMetadata(id, client);
            } catch (error) {
                console.warn('metadata unavailable', id, error.message);
                results[index] = null;
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

    const verified = results.filter(Boolean).map(function (meta) {
        return asVideo(meta, existing.get(meta.videoId) || null, now);
    });
    if (verified.length < MIN_VERIFIED) {
        throw new Error('Only ' + verified.length + ' Heavy Moose uploads were verified through YouTube.');
    }

    verified.sort(function (a, b) {
        return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    });
    verified.forEach(function (video, index) { video.channelUploadIndex = index; });
    verified[0].isLatestUpload = true;

    const ranked = verified.filter(function (video) {
        return Number.isFinite(Number(video.youtubeViewCount));
    }).sort(function (a, b) {
        return Number(b.youtubeViewCount) - Number(a.youtubeViewCount) || Number(a.channelUploadIndex) - Number(b.channelUploadIndex);
    });
    if (ranked.length < MIN_VERIFIED) throw new Error('Fewer than 10 verified uploads exposed public view counts.');
    ranked.forEach(function (video, index) { video.youtubePopularityRank = index + 1; });

    const verifiedIds = new Set(verified.map(function (video) { return video.videoId; }));
    const remainder = (media.videos || []).filter(function (video) { return !verifiedIds.has(video.videoId); }).map(function (video) {
        return Object.assign({}, video, { isLatestUpload: false, inChannelUploads: false, channelUploadIndex: null, youtubePopularityRank: null });
    });

    media.source = Object.assign({}, media.source || {}, {
        youtubeChannel: CHANNEL_URL,
        youtubeChannelId: CHANNEL_ID,
        youtubeMetrics: 'YouTube public Innertube browser player metadata'
    });
    media.channelUploadCount = verified.length;
    media.latestUploadVideoId = verified[0].videoId;
    media.youtubeMetricsUpdatedAt = now;
    media.youtubeCandidateCount = candidates.length;
    media.videos = verified.concat(remainder);
    fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2) + '\n');

    console.log('verified channel uploads:', verified.length, 'candidates:', candidates.length);
    console.log('latest:', verified[0].videoId, '-', verified[0].title);
    console.log('top 10 by public YouTube views:');
    ranked.slice(0, 10).forEach(function (video) {
        console.log(video.youtubePopularityRank + '.', video.youtubeViewCount, video.videoId, '-', video.title);
    });
}

if (require.main === module) {
    main().catch(function (error) { console.error(error); process.exitCode = 1; });
}
module.exports = { main };
