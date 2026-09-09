#!/usr/bin/env node
/**
 * Verify and rank the Heavy Moose media inventory using public YouTube watch-page
 * metadata. Inventory discovery remains in sync-music-catalog.js, which already
 * merges the channel RSS window with the official Music Videos playlist and keeps
 * older known entries instead of truncating them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');
const CHANNEL_ID = 'UCrGqGbSQYxxNAjsvlQ8tT8g';
const MIN_VERIFIED = 10;

function fetchText(url) {
    const result = spawnSync('curl', [
        '-fsSL',
        '--compressed',
        '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36',
        '-H', 'Accept-Language: en-US,en;q=0.9',
        '-H', 'Cookie: SOCS=CAI; CONSENT=YES+cb',
        url
    ], {
        encoding: 'utf8',
        maxBuffer: 25 * 1024 * 1024
    });
    if (result.status !== 0) {
        throw new Error('YouTube watch-page request failed: ' + (result.stderr || result.status));
    }
    return result.stdout;
}

function extractBalancedObject(text, startIndex) {
    const open = text.indexOf('{', startIndex);
    if (open === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = open; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
        } else if (ch === '{') {
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(open, i + 1);
        }
    }
    return null;
}

function extractPlayerResponse(html) {
    const markers = [
        'ytInitialPlayerResponse =',
        'ytInitialPlayerResponse=',
        'var ytInitialPlayerResponse ='
    ];

    for (let i = 0; i < markers.length; i += 1) {
        const index = html.indexOf(markers[i]);
        if (index === -1) continue;
        const raw = extractBalancedObject(html, index + markers[i].length);
        if (!raw) continue;
        try {
            return JSON.parse(raw);
        } catch (error) {
            // Try the next representation if YouTube changed the surrounding script.
        }
    }

    const escapedMarker = '"playerResponse":"';
    const escapedIndex = html.indexOf(escapedMarker);
    if (escapedIndex !== -1) {
        let i = escapedIndex + escapedMarker.length;
        let escaped = false;
        let raw = '';
        for (; i < html.length; i += 1) {
            const ch = html[i];
            if (!escaped && ch === '"') break;
            raw += ch;
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
        }
        try {
            return JSON.parse(JSON.parse('"' + raw + '"'));
        } catch (error) {
            return null;
        }
    }

    return null;
}

function publicMetadata(videoId) {
    const html = fetchText('https://www.youtube.com/watch?v=' + videoId + '&hl=en&gl=US');
    const player = extractPlayerResponse(html);
    const details = player && player.videoDetails;
    if (!details) return null;
    if (details.videoId && details.videoId !== videoId) return null;
    if (details.channelId !== CHANNEL_ID) return null;

    const views = Number(details.viewCount);
    return {
        viewCount: Number.isFinite(views) ? views : null,
        title: details.title || '',
        lengthSeconds: Number(details.lengthSeconds) || null,
        playable: !player.playabilityStatus || player.playabilityStatus.status === 'OK'
    };
}

function candidateVideo(video) {
    if (!video || !video.videoId) return false;
    if (video.catalogClass === 'feature-appearance' || video.catalogClass === 'collaboration') return false;
    if (video.heavyMooseRole && video.heavyMooseRole !== 'primary-artist') return false;
    return Boolean(video.inOfficialMusicVideosPlaylist || video.includeInLatestMusicVideos || video.inChannelUploads);
}

function newestFirst(a, b) {
    const aDate = String(a.publishedAt || '');
    const bDate = String(b.publishedAt || '');
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aIndex = a.officialPlaylistIndex == null ? Number.MAX_SAFE_INTEGER : Number(a.officialPlaylistIndex);
    const bIndex = b.officialPlaylistIndex == null ? Number.MAX_SAFE_INTEGER : Number(b.officialPlaylistIndex);
    return aIndex - bIndex;
}

function main() {
    const media = JSON.parse(fs.readFileSync(MEDIA_PATH, 'utf8'));
    const now = new Date().toISOString();
    const videos = (media.videos || []).map(function (video) {
        return Object.assign({}, video, {
            isLatestUpload: false,
            inChannelUploads: false,
            channelUploadIndex: null,
            youtubePopularityRank: null
        });
    });

    const candidates = videos.filter(candidateVideo).sort(newestFirst);
    const verified = [];
    let unavailable = 0;

    candidates.forEach(function (video) {
        try {
            const meta = publicMetadata(video.videoId);
            if (!meta) {
                unavailable += 1;
                return;
            }
            video.inChannelUploads = true;
            video.channelUploadIndex = verified.length;
            video.youtubeViewCount = meta.viewCount;
            video.youtubeViewCountText = meta.viewCount == null
                ? ''
                : meta.viewCount.toLocaleString('en-US') + ' views';
            video.youtubeMetricsUpdatedAt = now;
            video.youtubePlayable = meta.playable;
            video.youtubeDurationSeconds = meta.lengthSeconds || video.youtubeDurationSeconds || null;
            if (!video.title && meta.title) video.title = meta.title;
            verified.push(video);
        } catch (error) {
            unavailable += 1;
            console.warn('watch-page metadata unavailable', video.videoId, error.message);
        }
    });

    if (verified.length < MIN_VERIFIED) {
        throw new Error('Only ' + verified.length + ' Heavy Moose uploads could be verified from public watch pages.');
    }

    const ranked = verified
        .filter(function (video) { return Number.isFinite(Number(video.youtubeViewCount)); })
        .sort(function (a, b) {
            const viewDelta = Number(b.youtubeViewCount) - Number(a.youtubeViewCount);
            return viewDelta || Number(a.channelUploadIndex) - Number(b.channelUploadIndex);
        });

    if (ranked.length < MIN_VERIFIED) {
        throw new Error('Only ' + ranked.length + ' verified uploads exposed public YouTube view counts.');
    }

    ranked.forEach(function (video, index) {
        video.youtubePopularityRank = index + 1;
    });

    verified.sort(function (a, b) { return Number(a.channelUploadIndex) - Number(b.channelUploadIndex); });
    verified[0].isLatestUpload = true;

    const verifiedIds = new Set(verified.map(function (video) { return video.videoId; }));
    const remainder = videos.filter(function (video) { return !verifiedIds.has(video.videoId); });

    media.source = Object.assign({}, media.source || {}, {
        youtubeMetrics: 'public watch-page ytInitialPlayerResponse',
        youtubeChannelId: CHANNEL_ID
    });
    media.channelUploadCount = verified.length;
    media.latestUploadVideoId = verified[0].videoId;
    media.youtubeMetricsUpdatedAt = now;
    media.youtubeMetadataUnavailableCount = unavailable;
    media.videos = verified.concat(remainder);

    fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2) + '\n');

    console.log('verified channel uploads:', verified.length, 'unavailable:', unavailable);
    console.log('latest:', verified[0].videoId, '-', verified[0].title);
    console.log('top 10 by public YouTube views:');
    ranked.slice(0, 10).forEach(function (video) {
        console.log(video.youtubePopularityRank + '.', video.youtubeViewCount, video.videoId, '-', video.title);
    });
}

if (require.main === module) main();
module.exports = { main };
