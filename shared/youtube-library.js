(function () {
    'use strict';

    var officialGrid = document.querySelector('[data-hm-youtube-library-grid]') || document.getElementById('official-video-grid');
    if (!officialGrid || !window.fetch) return;

    function formatDate(value) {
        if (!value) return '';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function formatViews(value) {
        var count = Number(value);
        if (!Number.isFinite(count)) return '';
        return count.toLocaleString('en-US') + ' views';
    }

    function metaText(video, rank) {
        var bits = [];
        if (rank) bits.push('#' + rank);
        var views = formatViews(video.youtubeViewCount);
        var date = formatDate(video.publishedAt);
        if (views) bits.push(views);
        if (date) bits.push(date);
        return bits.join(' · ');
    }

    function addText(parent, tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = text;
        parent.appendChild(node);
        return node;
    }

    function bindPlay(button, card, video) {
        button.addEventListener('click', function () {
            var iframe = document.createElement('iframe');
            iframe.src = (video.embedUrl || ('https://www.youtube-nocookie.com/embed/' + video.videoId)) + '?autoplay=1&rel=0';
            iframe.title = video.title || 'Heavy Moose video';
            iframe.loading = 'lazy';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.allowFullscreen = true;
            card.classList.add('is-playing');
            button.replaceWith(iframe);
        }, { once: true });
    }

    function buildCard(video, kicker, rank) {
        var card = document.createElement('article');
        card.className = 'video-card';
        card.setAttribute('data-video-id', video.videoId);

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'video-facade';
        button.setAttribute('aria-label', 'Play ' + (video.title || 'Heavy Moose video'));

        var image = document.createElement('img');
        image.src = video.thumbnailUrl || ('https://i.ytimg.com/vi/' + video.videoId + '/hqdefault.jpg');
        image.alt = '';
        image.width = 480;
        image.height = 360;
        image.loading = 'lazy';
        button.appendChild(image);

        var play = document.createElement('span');
        play.className = 'video-play';
        play.setAttribute('aria-hidden', 'true');
        button.appendChild(play);
        card.appendChild(button);

        var body = document.createElement('div');
        body.className = 'video-card-body';
        addText(body, 'div', 'video-kicker', kicker);
        addText(body, 'h2', '', video.title || 'Heavy Moose');
        addText(body, 'p', 'video-meta', metaText(video, rank));

        if (video.watchPage) {
            var localLink = document.createElement('a');
            localLink.href = video.watchPage;
            localLink.textContent = 'Open watch page';
            body.appendChild(localLink);
        }

        var youtubeLink = document.createElement('a');
        youtubeLink.href = video.watchUrl || ('https://www.youtube.com/watch?v=' + video.videoId);
        youtubeLink.target = '_blank';
        youtubeLink.rel = 'noopener';
        youtubeLink.textContent = 'Watch on YouTube';
        body.appendChild(youtubeLink);

        card.appendChild(body);
        bindPlay(button, card, video);
        return card;
    }

    function buildSection(id, label, title, intro, videos, kicker, ranked) {
        var section = document.createElement('section');
        section.className = 'video-group';
        section.id = id;

        addText(section, 'span', 'section-label', label);
        var heading = addText(section, 'h2', '', title);
        heading.id = id + '-title';
        section.setAttribute('aria-labelledby', heading.id);
        if (intro) addText(section, 'p', 'section-intro', intro);

        var grid = document.createElement('div');
        grid.className = 'video-grid';
        videos.forEach(function (video, index) {
            grid.appendChild(buildCard(video, kicker, ranked ? index + 1 : null));
        });
        section.appendChild(grid);
        return section;
    }

    function sortNewest(videos) {
        return videos.slice().sort(function (a, b) {
            var aIdx = Number.isFinite(Number(a.channelUploadIndex)) ? Number(a.channelUploadIndex) : Number.MAX_SAFE_INTEGER;
            var bIdx = Number.isFinite(Number(b.channelUploadIndex)) ? Number(b.channelUploadIndex) : Number.MAX_SAFE_INTEGER;
            if (aIdx !== bIdx) return aIdx - bIdx;
            return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
        });
    }

    function sortPopular(videos) {
        return videos.slice().sort(function (a, b) {
            var aRank = Number.isFinite(Number(a.youtubePopularityRank)) ? Number(a.youtubePopularityRank) : Number.MAX_SAFE_INTEGER;
            var bRank = Number.isFinite(Number(b.youtubePopularityRank)) ? Number(b.youtubePopularityRank) : Number.MAX_SAFE_INTEGER;
            if (aRank !== bRank) return aRank - bRank;
            return Number(b.youtubeViewCount || 0) - Number(a.youtubeViewCount || 0);
        });
    }

    window.fetch('assets/data/media-library.json', { cache: 'no-store' })
        .then(function (response) {
            if (!response.ok) throw new Error('media-library fetch failed: ' + response.status);
            return response.json();
        })
        .then(function (media) {
            var videos = Array.isArray(media.videos) ? media.videos : [];
            var uploads = videos.filter(function (video) { return video.inChannelUploads; });
            if (!uploads.length) return;

            var newest = sortNewest(uploads);
            var popular = sortPopular(uploads).filter(function (video) {
                return Number.isFinite(Number(video.youtubeViewCount));
            });
            var officialGroup = officialGrid.closest('.video-group');
            if (!officialGroup) return;

            var newestSection = buildSection(
                'youtube-newest',
                'Latest channel uploads',
                'Newest on YouTube',
                'The most recent Heavy Moose uploads, refreshed from the channel itself.',
                newest.slice(0, 10),
                'Latest upload',
                false
            );
            officialGroup.parentNode.insertBefore(newestSection, officialGroup);

            if (popular.length >= 10) {
                var popularSection = buildSection(
                    'youtube-popular',
                    'Most watched · public YouTube views',
                    'Top 10 on YouTube',
                    'Heavy Moose uploads ranked by current public YouTube view count.',
                    popular.slice(0, 10),
                    'Most watched',
                    true
                );
                officialGroup.parentNode.insertBefore(popularSection, officialGroup);
            }

            officialGrid.replaceChildren();
            newest.forEach(function (video) {
                officialGrid.appendChild(buildCard(video, 'Heavy Moose channel', null));
            });

            var groupLabel = officialGroup.querySelector('.section-label');
            var groupHeading = officialGroup.querySelector('h2');
            if (groupLabel) groupLabel.textContent = uploads.length + ' channel uploads';
            if (groupHeading) groupHeading.textContent = 'Complete YouTube library';

            var intro = document.querySelector('.page-intro');
            if (intro) {
                var introLabel = intro.querySelector('.section-label');
                var introText = intro.querySelector('p');
                var primaryAction = intro.querySelector('.btn-primary');
                if (introLabel) introLabel.textContent = 'Heavy Moose on YouTube';
                if (introText) introText.textContent = 'Newest uploads first, the current top 10 by public YouTube views, and the complete Heavy Moose channel library. Click any thumbnail to play in-page.';
                if (primaryAction) {
                    primaryAction.href = 'https://www.youtube.com/@HeavyMoose/videos';
                    primaryAction.textContent = 'Open the channel';
                }
            }

            var featureGroup = document.getElementById('features');
            if (featureGroup) featureGroup.hidden = true;
        })
        .catch(function (error) {
            console.warn('Heavy Moose YouTube library enhancement unavailable; keeping baked fallback.', error);
        });
})();
