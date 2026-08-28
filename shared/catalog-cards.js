/**
 * Cover-led catalog cards driven by assets/data/music-catalog.json.
 * Used in the browser to hydrate grids, and by scripts/bake-catalog-html.js
 * so the same markup is baked into HTML for crawlers / noscript.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.HeavyMooseCatalog = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var YT_FALLBACK = 'https://www.youtube.com/@HeavyMoose/releases';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatType(type) {
        if (!type) return 'Release';
        if (type === 'ep') return 'EP';
        return type.charAt(0).toUpperCase() + type.slice(1);
    }

    function formatDate(value, options) {
        if (!value) return '';
        var date = new Date(value + (String(value).indexOf('T') === -1 ? 'T12:00:00' : ''));
        if (isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString('en-US', options || {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function trackLabel(count) {
        var n = Number(count) || 0;
        return n + (n === 1 ? ' track' : ' tracks');
    }

    function youtubeFor(release, mediaLibrary, artist) {
        var videos = (mediaLibrary && mediaLibrary.videos) || [];
        var match = null;
        for (var i = 0; i < videos.length; i++) {
            if (videos[i].associatedReleaseSlug === release.slug) {
                match = videos[i];
                break;
            }
        }
        if (match && match.watchUrl) return match.watchUrl;
        return (artist && artist.youtubeUrl) || YT_FALLBACK;
    }

    function youtubeMap(mediaLibrary) {
        var map = {};
        var videos = (mediaLibrary && mediaLibrary.videos) || [];
        for (var i = 0; i < videos.length; i++) {
            var video = videos[i];
            if (video.associatedReleaseSlug && !map[video.associatedReleaseSlug]) {
                map[video.associatedReleaseSlug] = video.watchUrl;
            }
        }
        return map;
    }

    function coverCardHtml(release, youtubeUrl, options) {
        var opts = options || {};
        var title = release.title || 'Untitled';
        var artwork = release.artwork || '';
        var apple = release.appleMusicUrl || '#';
        var youtube = youtubeUrl || YT_FALLBACK;
        var kind = (release.type === 'single' || release.type === 'ep') ? 'single' : 'album';
        var loading = opts.eager ? 'eager' : 'lazy';
        var kicker = opts.kicker
            ? '<span class="origin-kicker">' + escapeHtml(opts.kicker) + '</span>'
            : '';

        return (
            '<article class="cover-card" data-slug="' + escapeHtml(release.slug || '') + '" data-kind="' + kind + '">' +
                '<a class="cover-card-art" href="' + escapeHtml(apple) + '" target="_blank" rel="noopener">' +
                    '<img src="' + escapeHtml(artwork) + '" alt="' + escapeHtml(title) + ' cover art" width="800" height="800" loading="' + loading + '">' +
                '</a>' +
                '<div class="cover-card-body">' +
                    kicker +
                    '<p class="cover-card-date">' + escapeHtml(formatDate(release.releaseDate)) + '</p>' +
                    '<h3>' + escapeHtml(title) + '</h3>' +
                    '<p class="cover-card-meta">' + escapeHtml(formatType(release.type) + ' · ' + trackLabel(release.trackCount) + (release.genre ? ' · ' + release.genre : '')) + '</p>' +
                    '<div class="cover-card-links">' +
                        '<a href="' + escapeHtml(apple) + '" target="_blank" rel="noopener" aria-label="Open ' + escapeHtml(title) + ' on Apple Music">Apple</a>' +
                        '<a href="' + escapeHtml(youtube) + '" target="_blank" rel="noopener" aria-label="Open ' + escapeHtml(title) + ' on YouTube">YouTube</a>' +
                    '</div>' +
                '</div>' +
            '</article>'
        );
    }

    function catalogCardHtml(release, youtubeUrl, options) {
        var opts = options || {};
        var title = release.title || 'Untitled';
        var artwork = release.artwork || '';
        var apple = release.appleMusicUrl || '#';
        var youtube = youtubeUrl || YT_FALLBACK;
        var kind = (release.type === 'single' || release.type === 'ep') ? 'single' : 'album';
        var loading = opts.eager ? 'eager' : 'lazy';

        return (
            '<article class="catalog-card" data-slug="' + escapeHtml(release.slug || '') + '" data-kind="' + kind + '">' +
                '<img src="' + escapeHtml(artwork) + '" alt="Heavy Moose — ' + escapeHtml(title) + ' cover art" width="600" height="600" loading="' + loading + '">' +
                '<div class="catalog-card-body">' +
                    '<p class="catalog-card-date">' + escapeHtml(formatDate(release.releaseDate)) + '</p>' +
                    '<h3>' + escapeHtml(title) + '</h3>' +
                    '<p class="catalog-card-meta">' + escapeHtml(trackLabel(release.trackCount) + (release.genre ? ' · ' + release.genre : '')) + '</p>' +
                    '<div class="catalog-card-links">' +
                        '<a class="catalog-card-link" href="' + escapeHtml(apple) + '" target="_blank" rel="noopener" aria-label="Open ' + escapeHtml(title) + ' on Apple Music">Apple</a>' +
                        '<a class="catalog-card-link" href="' + escapeHtml(youtube) + '" target="_blank" rel="noopener" aria-label="Open ' + escapeHtml(title) + ' on YouTube">YouTube</a>' +
                    '</div>' +
                '</div>' +
            '</article>'
        );
    }

    function latestCardHtml(release, youtubeUrl, index) {
        var title = release.title || 'Untitled';
        var artwork = release.artwork || '';
        var apple = release.appleMusicUrl || '#';
        var youtube = youtubeUrl || YT_FALLBACK;
        var feature = index === 0 ? ' latest-release-card--feature' : '';
        var loading = index === 0 ? 'eager' : 'lazy';

        return (
            '<article class="latest-release-card reveal visible' + feature + '" data-slug="' + escapeHtml(release.slug || '') + '">' +
                '<img class="latest-release-art" src="' + escapeHtml(artwork) + '" alt="' + escapeHtml(title) + ' album cover" width="600" height="600" loading="' + loading + '">' +
                '<div class="latest-release-body">' +
                    '<span class="latest-release-kicker">' + escapeHtml(formatType(release.type) + ' · ' + formatDate(release.releaseDate)) + '</span>' +
                    '<h3>' + escapeHtml(title) + '</h3>' +
                    '<p class="latest-release-meta">' + escapeHtml(trackLabel(release.trackCount) + (release.genre ? ' · ' + release.genre : '')) + '</p>' +
                    '<div class="latest-release-actions">' +
                        '<a class="stream-btn primary" href="' + escapeHtml(apple) + '" target="_blank" rel="noopener">Apple Music</a>' +
                        '<a class="stream-btn" href="' + escapeHtml(youtube) + '" target="_blank" rel="noopener">YouTube</a>' +
                    '</div>' +
                '</div>' +
            '</article>'
        );
    }

    function stripHtml(releases) {
        return releases.map(function (release, index) {
            return '<img src="' + escapeHtml(release.artwork || '') + '" alt="" width="400" height="400"' + (index > 3 ? ' loading="lazy"' : '') + '>';
        }).join('');
    }

    function renderGrid(releases, youtubeBySlug, artist, variant) {
        var fallback = (artist && artist.youtubeUrl) || YT_FALLBACK;
        return releases.map(function (release, index) {
            var youtube = (youtubeBySlug && youtubeBySlug[release.slug]) || fallback;
            if (variant === 'catalog') return catalogCardHtml(release, youtube, { eager: index < 4 });
            if (variant === 'latest') return latestCardHtml(release, youtube, index);
            return coverCardHtml(release, youtube, { eager: index === 0 });
        }).join('\n');
    }

    function replaceBetween(source, startMark, endMark, inner) {
        var start = source.indexOf(startMark);
        var end = source.indexOf(endMark);
        if (start === -1 || end === -1 || end < start) {
            throw new Error('Missing bake markers ' + startMark + ' / ' + endMark);
        }
        return source.slice(0, start + startMark.length) + '\n' + inner + '\n                    ' + source.slice(end);
    }

    return {
        escapeHtml: escapeHtml,
        formatDate: formatDate,
        formatType: formatType,
        trackLabel: trackLabel,
        youtubeFor: youtubeFor,
        youtubeMap: youtubeMap,
        coverCardHtml: coverCardHtml,
        catalogCardHtml: catalogCardHtml,
        latestCardHtml: latestCardHtml,
        stripHtml: stripHtml,
        renderGrid: renderGrid,
        replaceBetween: replaceBetween,
        YT_FALLBACK: YT_FALLBACK
    };
}));
