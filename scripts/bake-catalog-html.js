#!/usr/bin/env node
/**
 * Bake current Apple catalog cards into index.html and music.html
 * so crawlers / noscript see titles and artwork, not only JS placeholders.
 *
 * Usage:
 *   node scripts/bake-catalog-html.js
 *
 * catalog:sync runs this after refreshing JSON.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const catalogCards = require('../shared/catalog-cards.js');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'assets/data/music-catalog.json');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function bakeFile(filePath, replacements) {
    let html = fs.readFileSync(filePath, 'utf8');
    replacements.forEach(function (item) {
        html = catalogCards.replaceBetween(html, item.start, item.end, item.inner);
    });
    fs.writeFileSync(filePath, html);
}

function main() {
    const catalog = readJson(CATALOG_PATH);
    const media = fs.existsSync(MEDIA_PATH) ? readJson(MEDIA_PATH) : { videos: [] };
    const releases = catalog.releases || [];
    const artist = catalog.artist || {};
    const youtubeBySlug = catalogCards.youtubeMap(media);
    const latest = releases.slice(0, 8);
    const strip = releases.slice(0, 8);

    bakeFile(path.join(ROOT, 'index.html'), [
        {
            start: '<!-- COVER_STRIP_START -->',
            end: '<!-- COVER_STRIP_END -->',
            inner: '                    ' + catalogCards.stripHtml(strip)
        },
        {
            start: '<!-- CATALOG_GRID_START -->',
            end: '<!-- CATALOG_GRID_END -->',
            inner: catalogCards.renderGrid(releases, youtubeBySlug, artist, 'cover')
                .split('\n')
                .map(function (line) { return '                    ' + line; })
                .join('\n')
        }
    ]);

    bakeFile(path.join(ROOT, 'music.html'), [
        {
            start: '<!-- LATEST_GRID_START -->',
            end: '<!-- LATEST_GRID_END -->',
            inner: catalogCards.renderGrid(latest, youtubeBySlug, artist, 'latest')
                .split('\n')
                .map(function (line) { return '                    ' + line; })
                .join('\n')
        },
        {
            start: '<!-- CATALOG_GRID_START -->',
            end: '<!-- CATALOG_GRID_END -->',
            inner: catalogCards.renderGrid(releases, youtubeBySlug, artist, 'catalog')
                .split('\n')
                .map(function (line) { return '                    ' + line; })
                .join('\n')
        }
    ]);

    console.log('baked', releases.length, 'catalog cards and', latest.length, 'latest cards');
}

if (require.main === module) {
    main();
}

module.exports = { main };
