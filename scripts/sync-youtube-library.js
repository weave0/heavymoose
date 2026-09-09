#!/usr/bin/env node
/**
 * Refresh the Heavy Moose YouTube library from public YouTube metadata.
 *
 * We intentionally do not trust every video renderer returned by the Uploads
 * browse surface: YouTube can mix recommendations into that response. Every
 * candidate must resolve through player metadata to the canonical Heavy Moose
 * channel before it can enter the channel library or popularity ranking.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');
const CHANNEL_ID = 'UCrGqGbSQYxxNAjsvlQ8tT8g';
const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);
const BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const MIN_VERIFIED = 10;
const CLIENT = {
    clientName: 'WEB',
    clientVersion: '2.20260101.00.00',
    hl: 'en',
    gl: 'US'
};

function postJson(url, payload) {
    const result = spawnSync('curl', [
        '-fsSL',
        '-A', 'HeavyMooseYouTubeSync/1.1',
        '-H', 'Content-Type: application/json',
        '-H', 'Origin: https://www.youtube.com',
        '-H', 'Referer: https://www.youtube.com/',
        '--data-binary', '@-',
        url
    ], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        maxBuffer: 25 * 1024 * 1024
    });

    if (result.status !== 0) {
        throw new Error('YouTube request failed: ' + (result.stderr || result.status));
    }
    return JSON.parse(result.stdout);
}

function textValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.runs)) {
        return value.runs.map(function (run) { return run.text || ''; }).join('');
    }
    return '';
}

function continuationToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.continuationCommand && obj.continuationCommand.token) {
        return obj.continuationCommand.token;
    }
    const values = Array.isArray(obj) ? obj : Object.keys(obj).map(function (key) { return obj[key]; });
    for (let i = 0; i < values.length; i += 1) {
        const found = continuationToken(values[i]);
        if (found) return found;
    }
    return null;
}

function collectCandidates(obj, out) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.lockupViewModel && obj.lockupViewModel.contentId) {
        const vm = obj.lockupViewModel;
        if (/^[A-Za-z0-9_-]{11}$/.test(vm.contentId)) {
            out.push({
                videoId: vm.contentId,
                title: ((((vm.metadata || {}).lockupMetadataViewModel || {}).title) || {}).content || ''
            });
        }
    }

    ['playlistVideoRenderer', 'videoRenderer', 'gridVideoRenderer'].forEach(function (key) {
        const renderer = obj[key];
        if (!renderer || !/^[A-Za-z0-9_-]{11}$/.test(renderer.videoId || '')) return;
        out.push({ videoId: renderer.videoId, title: textValue(renderer.title) });
    });

    const values = Array.isArray(obj) ? obj : Object.keys(obj).map(function (key) { return obj[key]; });
    values.forEach(function (value) { collectCandidates(value, out); });
}

function fetchCandidates() {
    const result = [];
    const seen = new Set();
    let payload = { context: { client: CLIENT }, browseId: 'VL' + UPLOADS_PLAYLIST_ID };
    let pages = 0;

    while (payload && pages < 20) {
        pages += 1;
        const data = postJson(BROWSE_URL, payload);
        const page = [];
        collectCandidates(data, page);
        page.forEach(function (item) {
            if (seen.has(item.videoId)) return;
            seen.add(item.videoId);
            result.push(item);
        });
        const token = continuationToken(data);
        payload = token ? { context: { client: CLIENT }, continuation: token } : null;
    }

    return result;
}

function fetchPlayer(videoId) {
    return postJson(PLAYER_URL, {
        context: { client: CLIENT },
        videoId: videoId,
        contentCheckOk: true,
        racyCheckOk: true
    });
}

function slugify(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/['’]/g, '-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function publishedAt(data, current) {
    const micro = data && data.microformat && data.microformat.playerMicroformatRenderer;
    const raw = (micro && (micro.publishDate || micro.uploadDate)) || (current && current.publishedAt) || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00+00:00' : raw;
}

function verifiedRecord(videoId, current, data, now, channelIndex) {
    const details = data && data.videoDetails;
    if (!details || details.channelId !== CHANNEL_ID) return null;

    const micro = data.microformat && data.microformat.playerMicroformatRenderer;
    const thumbnails = details.thumbnail && details.thumbnail.thumbnails;
    const fallbackThumb = Array.isArray(thumbnails) && thumbnails.length
        ? thumbnails[thumbnails.length - 1].url
        : 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
    const title = (current && current.title) || details.title || videoId;
    const views = Number(details.viewCount);

    return Object.assign({
        title: title,
        rawTitle: details.title || title,
        slug: slugify(title),
        videoId: videoId,
        publishedAt: publishedAt(data, current),
        watchUrl: 'https://www.youtube.com/watch?v=' + videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId,
        thumbnailUrl: fallbackThumb,
        description: (micro && micro.description && textValue(micro.description)) || '',
        catalogClass: 'primary-release',
        heavyMooseRole: 'primary-artist',
        associatedTrackTitle: null,
        associatedReleaseSlug: null,
        associatedReleaseTitle: null,
        associatedArtwork: null,
        watchPage: null,
        isLatestUpload: false,
        includeInLatestMusicVideos: true,
        inOfficialMusicVideosPlaylist: false,
        officialPlaylistIndex: null,
        includeInFeaturesGroup: false
    }, current || {}, {
        videoId: videoId,
        publishedAt: publishedAt(data, current),
        watchUrl: 'https://www.youtube.com/watch?v=' + videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId,
        thumbnailUrl: (current && current.thumbnailUrl) || fallbackThumb,
        inChannelUploads: true,
        channelUploadIndex: channelIndex,
        youtubeViewCount: Number.isFinite(views) ? views : (current && current.youtubeViewCount),
        youtubeMetricsUpdatedAt: now,
        youtubePlayable: Boolean(data.playabilityStatus && data.playabilityStatus.status === 'OK'),
        youtubeDurationSeconds: Number(details.lengthSeconds) || (current && current.youtubeDurationSeconds) || null
    });
}

function main() {
    const media = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
    const previous = new Map();
    (media.videos || []).forEach(function (video) {
        previous.set(video.videoId, Object.assign({}, video, {
            isLatestUpload: false,
            youtubePopularityRank: null
        }));
    });

    const candidates = fetchCandidates();
    if (candidates.length < MIN_VERIFIED) {
        throw new Error('Only ' + candidates.length + ' YouTube browse candidates were returned.');
    }

    const now = new Date().toISOString();
    const verified = [];
    let foreignOrUnverifiable = 0;
    let requestFailures = 0;

    candidates.forEach(function (candidate) {
        const current = previous.get(candidate.videoId) || null;
        try {
            const record = verifiedRecord(candidate.videoId, current, fetchPlayer(candidate.videoId), now, verified.length);
            if (!record) {
                foreignOrUnverifiable += 1;
                return;
            }
            verified.push(record);
        } catch (error) {
            requestFailures += 1;
            if (current && current.inChannelUploads) {
                verified.push(Object.assign({}, current, {
                    isLatestUpload: false,
                    inChannelUploads: true,
                    channelUploadIndex: verified.length,
                    youtubePopularityRank: null
                }));
                console.warn('preserved previously verified upload', candidate.videoId, error.message);
                return;
            }
            foreignOrUnverifiable += 1;
            console.warn('ignored unverifiable candidate', candidate.videoId, error.message);
        }
    });

    if (verified.length < MIN_VERIFIED) {
        throw new Error('Only ' + verified.length + ' verified Heavy Moose uploads remained.');
    }
    if (media.channelUploadCount && verified.length < media.channelUploadCount) {
        throw new Error('Refusing smaller channel library: ' + verified.length + ' < ' + media.channelUploadCount + '.');
    }

    const ranked = verified
        .filter(function (video) { return Number.isFinite(Number(video.youtubeViewCount)); })
        .sort(function (a, b) {
            const views = Number(b.youtubeViewCount) - Number(a.youtubeViewCount);
            return views || Number(a.channelUploadIndex) - Number(b.channelUploadIndex);
        });

    if (ranked.length < MIN_VERIFIED) {
        throw new Error('Only ' + ranked.length + ' verified uploads exposed public view counts.');
    }

    ranked.forEach(function (video, index) {
        video.youtubePopularityRank = index + 1;
        video.youtubeViewCountText = Number(video.youtubeViewCount).toLocaleString('en-US') + ' views';
    });

    verified.sort(function (a, b) {
        return Number(a.channelUploadIndex) - Number(b.channelUploadIndex);
    });
    verified[0].isLatestUpload = true;

    const verifiedIds = new Set(verified.map(function (video) { return video.videoId; }));
    const extras = Array.from(previous.values()).filter(function (video) {
        return !verifiedIds.has(video.videoId);
    }).map(function (video) {
        return Object.assign({}, video, {
            isLatestUpload: false,
            inChannelUploads: false,
            channelUploadIndex: null,
            youtubePopularityRank: null
        });
    });

    media.source = Object.assign({}, media.source || {}, {
        youtubeUploadsPlaylist: 'https://www.youtube.com/playlist?list=' + UPLOADS_PLAYLIST_ID,
        youtubeUploadsPlaylistId: UPLOADS_PLAYLIST_ID,
        youtubePlayerMetadata: PLAYER_URL
    });
    media.channelUploadCount = verified.length;
    media.latestUploadVideoId = verified[0].videoId;
    media.youtubeMetricsUpdatedAt = now;
    media.youtubeRequestFailures = requestFailures;
    media.youtubeForeignCandidatesIgnored = foreignOrUnverifiable;
    media.videos = verified.concat(extras);

    fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2) + '\n');

    console.log('verified uploads:', verified.length);
    console.log('latest:', verified[0].videoId, '-', verified[0].title);
    console.log('ignored browse candidates:', foreignOrUnverifiable, 'request failures:', requestFailures);
    console.log('top 10:');
    ranked.slice(0, 10).forEach(function (video) {
        console.log(video.youtubePopularityRank + '.', video.videoId, video.youtubeViewCount, '-', video.title);
    });
}

if (require.main === module) main();
module.exports = { main };
