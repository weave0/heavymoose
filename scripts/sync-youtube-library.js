#!/usr/bin/env node
/**
 * Enrich media-library.json from the canonical Heavy Moose YouTube channel.
 *
 * Responsibilities:
 *   - enumerate the complete channel Uploads playlist (not only the 15-entry RSS window)
 *   - hydrate missing uploads from YouTube's public player metadata
 *   - capture public view counts and rank the most-watched uploads
 *   - set latestUploadVideoId to the newest actual channel upload
 *
 * The script is deliberately fail-closed on channel enumeration. If YouTube cannot
 * return a credible uploads list, the deployment should keep serving the last known
 * good library rather than publish a partially refreshed one.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');
const HEAVY_MOOSE_CHANNEL_ID = 'UCrGqGbSQYxxNAjsvlQ8tT8g';
const UPLOADS_PLAYLIST_ID = 'UU' + HEAVY_MOOSE_CHANNEL_ID.slice(2);
const YT_BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
const YT_PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const MIN_EXPECTED_UPLOADS = 10;

const WEB_CLIENT = {
    clientName: 'WEB',
    clientVersion: '2.20260101.00.00',
    hl: 'en',
    gl: 'US'
};

function curlJsonPost(url, payload) {
    const result = spawnSync(
        'curl',
        [
            '-fsSL',
            '-A', 'HeavyMooseYouTubeSync/1.0',
            '-H', 'Content-Type: application/json',
            '-H', 'Origin: https://www.youtube.com',
            '-H', 'Referer: https://www.youtube.com/',
            '--data-binary', '@-',
            url
        ],
        {
            input: JSON.stringify(payload),
            encoding: 'utf8',
            maxBuffer: 25 * 1024 * 1024
        }
    );

    if (result.status !== 0) {
        throw new Error('Failed to POST ' + url + ': ' + (result.stderr || result.status));
    }

    return JSON.parse(result.stdout);
}

function textValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) {
        return value.runs.map(function (run) { return run.text || ''; }).join('');
    }
    if (typeof value.content === 'string') return value.content;
    return '';
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

function collectUploadItems(obj, collected) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.lockupViewModel && obj.lockupViewModel.contentId) {
        const vm = obj.lockupViewModel;
        const videoId = vm.contentId;
        if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
            const title = ((((vm.metadata || {}).lockupMetadataViewModel || {}).title) || {}).content || '';
            collected.push({ videoId: videoId, rawTitle: title });
        }
    }

    ['playlistVideoRenderer', 'videoRenderer', 'gridVideoRenderer'].forEach(function (key) {
        const renderer = obj[key];
        if (!renderer || !renderer.videoId || !/^[A-Za-z0-9_-]{11}$/.test(renderer.videoId)) return;
        collected.push({
            videoId: renderer.videoId,
            rawTitle: textValue(renderer.title)
        });
    });

    const values = Array.isArray(obj) ? obj : Object.keys(obj).map(function (key) { return obj[key]; });
    values.forEach(function (value) {
        collectUploadItems(value, collected);
    });
}

function fetchUploadsPlaylist() {
    const items = [];
    const seen = new Set();
    let payload = {
        context: { client: WEB_CLIENT },
        browseId: 'VL' + UPLOADS_PLAYLIST_ID
    };
    let guard = 0;

    while (payload && guard < 20) {
        guard += 1;
        const data = curlJsonPost(YT_BROWSE_URL, payload);
        const pageItems = [];
        collectUploadItems(data, pageItems);

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

function fetchPlayer(videoId) {
    return curlJsonPost(YT_PLAYER_URL, {
        context: { client: WEB_CLIENT },
        videoId: videoId,
        contentCheckOk: true,
        racyCheckOk: true
    });
}

function slugifyTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/['’]/g, '-')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizePublishedAt(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value + 'T00:00:00+00:00';
    return value;
}

function playerRecord(videoId, playlistIndex, current, data, now) {
    const details = data && data.videoDetails;
    const playability = data && data.playabilityStatus;
    const micro = data && data.microformat && data.microformat.playerMicroformatRenderer;

    if (!details || details.channelId !== HEAVY_MOOSE_CHANNEL_ID) {
        throw new Error('Player metadata did not resolve to the Heavy Moose channel for ' + videoId);
    }

    const publishedAt = normalizePublishedAt(
        (micro && (micro.publishDate || micro.uploadDate)) ||
        (current && current.publishedAt) ||
        ''
    );
    const title = (current && current.title) || details.title || videoId;
    const thumbnails = details.thumbnail && details.thumbnail.thumbnails;
    const thumbnail = Array.isArray(thumbnails) && thumbnails.length
        ? thumbnails[thumbnails.length - 1].url
        : 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
    const parsedViews = Number(details.viewCount);
    const viewCount = Number.isFinite(parsedViews) ? parsedViews : (current && current.youtubeViewCount);

    return Object.assign({
        title: title,
        rawTitle: details.title || title,
        slug: slugifyTitle(title),
        videoId: videoId,
        publishedAt: publishedAt,
        watchUrl: 'https://www.youtube.com/watch?v=' + videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId,
        thumbnailUrl: thumbnail,
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
        publishedAt: publishedAt || (current && current.publishedAt) || '',
        watchUrl: 'https://www.youtube.com/watch?v=' + videoId,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId,
        thumbnailUrl: (current && current.thumbnailUrl) || thumbnail,
        inChannelUploads: true,
        channelUploadIndex: playlistIndex,
        youtubeViewCount: viewCount,
        youtubeViewCountText: Number.isFinite(Number(viewCount))
            ? new Intl.NumberFormat('en-US').format(Number(viewCount)) + ' views'
            : (current && current.youtubeViewCountText) || '',
        youtubeMetricsUpdatedAt: now,
        youtubePlayable: Boolean(playability && playability.status === 'OK'),
        youtubeDurationSeconds: Number(details.lengthSeconds) || (current && current.youtubeDurationSeconds) || null
    });
}

function main() {
    const media = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
    const videos = media.videos || [];
    const previousChannelCount = Number(media.channelUploadCount || 0);
    const uploads = fetchUploadsPlaylist();

    if (uploads.length < MIN_EXPECTED_UPLOADS) {
        throw new Error('Refusing partial YouTube sync: only ' + uploads.length + ' uploads were enumerated.');
    }
    if (previousChannelCount && uploads.length < previousChannelCount) {
        throw new Error(
            'Refusing smaller YouTube upload library: got ' + uploads.length + ', previously had ' + previousChannelCount + '.'
        );
    }

    const now = new Date().toISOString();
    const byId = new Map();
    videos.forEach(function (video) {
        byId.set(video.videoId, Object.assign({}, video, {
            isLatestUpload: false,
            inChannelUploads: false,
            channelUploadIndex: null,
            youtubePopularityRank: null
        }));
    });

    let metricFailures = 0;
    uploads.forEach(function (item) {
        const current = byId.get(item.videoId) || null;
        try {
            const data = fetchPlayer(item.videoId);
            const merged = playerRecord(item.videoId, item.playlistIndex, current, data, now);
            byId.set(item.videoId, merged);
        } catch (err) {
            metricFailures += 1;
            if (!current) {
                throw err;
            }
            console.warn('player metadata fallback', item.videoId, err.message);
            byId.set(item.videoId, Object.assign({}, current, {
                inChannelUploads: true,
                channelUploadIndex: item.playlistIndex
            }));
        }
    });

    const channelVideos = Array.from(byId.values())
        .filter(function (video) { return video.inChannelUploads; });

    const withViews = channelVideos
        .filter(function (video) { return Number.isFinite(Number(video.youtubeViewCount)); })
        .sort(function (a, b) {
            const delta = Number(b.youtubeViewCount) - Number(a.youtubeViewCount);
            if (delta) return delta;
            return Number(a.channelUploadIndex) - Number(b.channelUploadIndex);
        });

    if (withViews.length < MIN_EXPECTED_UPLOADS) {
        throw new Error('Refusing YouTube ranking with fewer than ' + MIN_EXPECTED_UPLOADS + ' measured uploads.');
    }

    withViews.forEach(function (video, index) {
        video.youtubePopularityRank = index + 1;
    });

    channelVideos.forEach(function (video) {
        if (!Number.isFinite(Number(video.youtubePopularityRank))) {
            video.youtubePopularityRank = null;
        }
    });

    const newest = channelVideos
        .slice()
        .sort(function (a, b) {
            const aIdx = Number.isFinite(Number(a.channelUploadIndex)) ? Number(a.channelUploadIndex) : Number.MAX_SAFE_INTEGER;
            const bIdx = Number.isFinite(Number(b.channelUploadIndex)) ? Number(b.channelUploadIndex) : Number.MAX_SAFE_INTEGER;
            if (aIdx !== bIdx) return aIdx - bIdx;
            return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
        })[0];

    if (!newest) {
        throw new Error('YouTube sync produced no newest upload.');
    }
    newest.isLatestUpload = true;

    const allVideos = Array.from(byId.values()).sort(function (a, b) {
        if (a.inChannelUploads && b.inChannelUploads) {
            return Number(a.channelUploadIndex) - Number(b.channelUploadIndex);
        }
        if (a.inChannelUploads) return -1;
        if (b.inChannelUploads) return 1;
        return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    });

    media.source = Object.assign({}, media.source || {}, {
        youtubeUploadsPlaylist: 'https://www.youtube.com/playlist?list=' + UPLOADS_PLAYLIST_ID,
        youtubeUploadsPlaylistId: UPLOADS_PLAYLIST_ID,
        youtubePlayerMetadata: YT_PLAYER_URL
    });
    media.channelUploadCount = channelVideos.length;
    media.latestUploadVideoId = newest.videoId;
    media.youtubeMetricsUpdatedAt = now;
    media.youtubeMetricFailures = metricFailures;
    media.videos = allVideos;

    fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2) + '\n');

    console.log(
        'youtube channel', channelVideos.length, 'uploads;',
        'ranked', withViews.length + ';',
        'latest', newest.videoId + ';',
        'metric fallbacks', metricFailures
    );
    console.log(
        'top 10',
        withViews.slice(0, 10).map(function (video) {
            return video.youtubePopularityRank + ':' + video.videoId + ':' + video.youtubeViewCount;
        }).join(' | ')
    );
}

if (require.main === module) {
    main();
}

module.exports = { main };
