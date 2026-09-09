#!/usr/bin/env node
/**
 * Refresh the Apple/iTunes release catalog while tolerating failures that happen
 * later in the legacy combined sync's YouTube phase.
 *
 * sync-music-catalog.js writes music-catalog.json before it begins YouTube work.
 * If that later YouTube work fails, this wrapper verifies that the release catalog
 * really advanced, then promotes the new release state into media-library.json and
 * bakes the HTML. A failure before the release catalog advances remains fatal.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'assets/data/music-catalog.json');
const MEDIA_PATH = path.join(ROOT, 'assets/data/media-library.json');
const LEGACY_SYNC = path.join(__dirname, 'sync-music-catalog.js');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
    const beforeCatalog = readJson(CATALOG_PATH);
    const beforeUpdatedAt = beforeCatalog.updatedAt || '';

    const result = spawnSync(process.execPath, [LEGACY_SYNC], {
        cwd: ROOT,
        stdio: 'inherit'
    });

    const catalog = readJson(CATALOG_PATH);
    const afterUpdatedAt = catalog.updatedAt || '';
    const catalogAdvanced = Boolean(afterUpdatedAt && afterUpdatedAt !== beforeUpdatedAt);

    if (result.status !== 0 && !catalogAdvanced) {
        throw new Error(
            'Release refresh failed before the catalog advanced; refusing to publish stale release state.'
        );
    }

    const releases = Array.isArray(catalog.releases) ? catalog.releases : [];
    const latest = releases[0];
    if (!latest || !latest.slug || !latest.title || !latest.releaseDate) {
        throw new Error('Release catalog has no valid latest release.');
    }

    const media = readJson(MEDIA_PATH);
    media.source = Object.assign({}, media.source || {}, {
        itunes: catalog.source || (media.source && media.source.itunes) || ''
    });
    media.releasesUpdatedAt = catalog.updatedAt || new Date().toISOString();
    media.latestReleaseSlug = latest.slug;
    media.latestReleaseTitle = latest.title;
    media.latestReleaseDate = latest.releaseDate;

    fs.writeFileSync(MEDIA_PATH, JSON.stringify(media, null, 2) + '\n');
    require('./bake-catalog-html.js').main();

    if (result.status !== 0) {
        console.warn(
            'Legacy YouTube phase failed after release catalog refresh; continuing because the official YouTube API sync runs separately.'
        );
    }

    console.log(
        'release state:',
        releases.length,
        'releases; latest',
        latest.title,
        latest.releaseDate
    );
}

if (require.main === module) {
    main();
}

module.exports = { main };
