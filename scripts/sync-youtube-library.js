#!/usr/bin/env node
/**
 * Refresh the Heavy Moose YouTube library with the official YouTube Data API v3.
 *
 * Source of truth:
 *   1. channels.list(contentDetails) -> canonical uploads playlist
 *   2. playlistItems.list -> every public upload, newest first
 *   3. videos.list(snippet,statistics,status) -> verified channel ownership + views
 *
 * Requires YOUTUBE_API_KEY. No OAuth is required because this reads public data.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');
const CHANNEL_ID = 'UCrGqGbSQYxxNAjsvlQ8tT8g';
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const BATCH_SIZE = 50;
const MIN_VERIFIED = 10;
const REQUEST_TIMEOUT_MS = 15000;

function requireApiKey() {
    const key = String(process.env.YOUTUBE_API_KEY || '').trim();
    if (!key) {
        throw new Error('YOUTUBE_API_KEY is required for the live YouTube library refresh.');
    }
    return key;
}

async function getJson(pathname, params, apiKey) {
    const url = new URL(API_BASE + pathname);
    Object.entries(params || {}).forEach(function ([key, value]) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    url.searchParams.set('key', apiKey);

    const response = await fetch(url, {
        headers: { 'user-agent': 'HeavyMooseLibrarySync/2.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error('YouTube Data API ' + response.status + ': ' + body.slice(0, 800));
    }
    return response.json();
}

async function getUploadsPlaylistId(apiKey) {
    const data = await getJson('/channels', {
        part: 'contentDetails',
        id: CHANNEL_ID,
        maxResults: 1
    }, apiKey);

    const channel = data.items && data.items[0];
    const uploads = channel && channel.contentDetails && channel.contentDetails.relatedPlaylists && channel.contentDetails.relatedPlaylists.uploads;
    if (!uploads) {
        throw new Error('YouTube Data API did not return the Heavy Moose uploads playlist.');
    }
    return uploads;
}

async function getAllUploads(uploadsPlaylistId, apiKey) {
    const uploads = [];
    const seen = new Set();
    let pageToken = '';

    do {
        const data = await getJson('/playlistItems', {
            part: 'snippet,contentDetails,status',
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            pageToken: pageToken
        }, apiKey);

        (data.items || []).forEach(function (item) {
            const videoId = (item.contentDetails && item.contentDetails.videoId) ||
                (item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId);
            if (!videoId || seen.has(videoId)) return;
            if (item.status && item.status.privacyStatus && item.status.privacyStatus !== 'public') return;
            seen.add(videoId);
            uploads.push({
                videoId: videoId,
                playlistPosition: item.snippet && Number.isFinite(Number(item.snippet.position))
                    ? Number(item.snippet.position)
                    : uploads.length,
                playlistPublishedAt: item.contentDetails && item.contentDetails.videoPublishedAt ||
                    item.snippet && item.snippet.publishedAt || ''
            });
        });

        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return uploads;
}

function chunks(values, size) {
    const result = [];
    for (let i = 0; i < values.length; i += size) {
        result.push(values.slice(i, i + size));
    }
    return result;
}

async function getVideoDetails(uploadIds, apiKey) {
    const byId = new Map();
    const batches = chunks(uploadIds, BATCH_SIZE);

    for (const batch of batches) {
        const data = await getJson('/videos', {
            part: 'snippet,statistics,status,contentDetails',
            id: batch.join(','),
            maxResults: BATCH_SIZE
        }, apiKey);

        (data.items || []).forEach(function (item) {
            if (!item || !item.id || !item.snippet) return;
            if (item.snippet.channelId !== CHANNEL_ID) return;
            if (item.status && item.status.privacyStatus && item.status.privacyStatus !== 'public') return;
            byId.set(item.id, item);
        });
    }

    return byId;
}

function bestThumbnail(snippet, videoId) {
    const thumbs = snippet && snippet.thumbnails || {};
    const preferred = thumbs.maxres || thumbs.standard || thumbs.high || thumbs.medium || thumbs.default;
    return preferred && preferred.url || 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
}

function parseDurationSeconds(isoDuration) {
    if (!isoDuration) return null;
    const match = String(isoDuration).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!match) return null;
    return (Number(match[1] || 0) * 86400) +
        (Number(match[2] || 0) * 3600) +
        (Number(match[3] || 0) * 60) +
        Number(match[4] || 0);
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/['’]/g, '-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function buildVideo(upload, item, current, now) {
    const snippet = item.snippet || {};
    const statistics = item.statistics || {};
    const status = item.status || {};
    const contentDetails = item.contentDetails || {};
    const viewCount = Number(statistics.viewCount);
    const publishedAt = snippet.publishedAt || upload.playlistPublishedAt || current && current.publishedAt || '';
    const title = current && current.title || snippet.title || upload.videoId;

    return Object.assign({
        title: title,
        rawTitle: snippet.title || title,
        slug: slugify(title),
        videoId: upload.videoId,
        publishedAt: publishedAt,
        watchUrl: 'https://www.youtube.com/watch?v=' + upload.videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + upload.videoId,
        thumbnailUrl: bestThumbnail(snippet, upload.videoId),
        description: snippet.description || '',
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
        title: title,
        rawTitle: snippet.title || title,
        publishedAt: publishedAt,
        watchUrl: 'https://www.youtube.com/watch?v=' + upload.videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + upload.videoId,
        thumbnailUrl: current && current.thumbnailUrl || bestThumbnail(snippet, upload.videoId),
        inChannelUploads: true,
        channelUploadIndex: upload.playlistPosition,
        isLatestUpload: false,
        youtubeViewCount: Number.isFinite(viewCount) ? viewCount : null,
        youtubeViewCountText: Number.isFinite(viewCount) ? viewCount.toLocaleString('en-US') + ' views' : '',
        youtubeMetricsUpdatedAt: now,
        youtubePlayable: status.uploadStatus === 'processed' && status.privacyStatus === 'public',
        youtubeDurationSeconds: parseDurationSeconds(contentDetails.duration),
        youtubePopularityRank: null
    });
}

async function main() {
    const apiKey = requireApiKey();
    const media = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
    const now = new Date().toISOString();
    const existing = new Map((media.videos || []).map(function (video) {
        return [video.videoId, video];
    }));

    const uploadsPlaylistId = await getUploadsPlaylistId(apiKey);
    const uploads = await getAllUploads(uploadsPlaylistId, apiKey);
    if (uploads.length < MIN_VERIFIED) {
        throw new Error('YouTube returned only ' + uploads.length + ' public Heavy Moose uploads; refusing partial refresh.');
    }

    uploads.sort(function (a, b) { return a.playlistPosition - b.playlistPosition; });
    const detailById = await getVideoDetails(uploads.map(function (upload) { return upload.videoId; }), apiKey);

    const verified = uploads
        .filter(function (upload) { return detailById.has(upload.videoId); })
        .map(function (upload) {
            return buildVideo(upload, detailById.get(upload.videoId), existing.get(upload.videoId) || null, now);
        });

    if (verified.length < MIN_VERIFIED) {
        throw new Error('Only ' + verified.length + ' Heavy Moose uploads passed Data API channel/privacy verification.');
    }
    if (verified.length !== uploads.length) {
        throw new Error('Upload/detail mismatch: ' + uploads.length + ' uploads but ' + verified.length + ' verified video records.');
    }

    verified.forEach(function (video, index) {
        video.channelUploadIndex = index;
    });
    verified[0].isLatestUpload = true;

    const ranked = verified.slice().sort(function (a, b) {
        return Number(b.youtubeViewCount || 0) - Number(a.youtubeViewCount || 0) ||
            Number(a.channelUploadIndex) - Number(b.channelUploadIndex);
    });
    ranked.forEach(function (video, index) {
        video.youtubePopularityRank = index + 1;
    });

    const verifiedIds = new Set(verified.map(function (video) { return video.videoId; }));
    const remainder = (media.videos || [])
        .filter(function (video) { return !verifiedIds.has(video.videoId); })
        .map(function (video) {
            return Object.assign({}, video, {
                isLatestUpload: false,
                inChannelUploads: false,
                channelUploadIndex: null,
                youtubePopularityRank: null
            });
        });

    media.source = Object.assign({}, media.source || {}, {
        youtubeChannel: 'https://www.youtube.com/@HeavyMoose',
        youtubeChannelId: CHANNEL_ID,
        youtubeUploadsPlaylistId: uploadsPlaylistId,
        youtubeMetrics: 'YouTube Data API v3 public channel, playlistItems, and video statistics'
    });
    media.channelUploadCount = verified.length;
    media.latestUploadVideoId = verified[0].videoId;
    media.youtubeMetricsUpdatedAt = now;
    media.videos = verified.concat(remainder);

    fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2) + '\n');

    console.log('verified public channel uploads:', verified.length);
    console.log('latest:', verified[0].videoId, '-', verified[0].title);
    console.log('top 10 by public YouTube views:');
    ranked.slice(0, 10).forEach(function (video) {
        console.log(video.youtubePopularityRank + '.', video.youtubeViewCount, video.videoId, '-', video.title);
    });
}

if (require.main === module) {
    main().catch(function (error) {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { main };
