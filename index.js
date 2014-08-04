/*
 * An example song source for CSH DJ. Searches and fetches audio from YouTube.
 *
 * Configuration:
 *  auth: {
 *    type: "key:oauth":
 *    key: "API_KEY (if type is key)",
 *    token: "API_TOKEN (if type is oauth)"
 *  }
 */
/*jshint es5: true */

var Q = require('q');
var Youtube = require('youtube-api');
var ytdl = require('ytdl-core');
var fs = require('fs');

/**
 * This module's logging object.
 */
var log;

/**
 * Name of song source to display in search results.
 */
exports.display_name = 'Youtube';

/**
 * Formats a result from the Youtube API format to DJ search result format.
 *
 * @param result Object from the Youtube API search result JSON.
 * @return Object for the result formatted for DJ search results.
 */
function format_result(result) {
  return {
    id: result.id.videoId,
    title: result.snippet.title,
    artist: result.snippet.channelTitle,
    thumbnail_url: result.snippet.thumbnails.default.url,
    image_url: result.snippet.thumbnails.high.url
  };
}

/**
 * Initialize the song source.
 *
 * @param log Logger object. Call functions debug/info/warn/error to log.
 * @param config Configuration object, which is empty if no configuration is
 *               provided.
 * @return Promise resolving when initialization is complete, and rejecting
 *                 with an Error object if an error has occured.
 */
exports.init = function(_log, config) {
  var deferred = Q.defer();

  log = _log;

  Youtube.authenticate(config.auth);

  deferred.resolve();
  return deferred.promise;
};

/**
 * Get song result for a search string.
 *
 * @param max_results Maximum number of results to return.
 * @param query String which is a partial match of either title, album, or
 *              artist. This function should match this string to any position
 *              within these properties.
 * @return Promise resolving with an array of result objects, or rejecting
 *                 with an error. If no results were found, resolve with an
 *                 empty array.
 *                 Objects in the results array should have the following:
 *                  id: Unique identifier of the song. This should be whatever
 *                      makes the most sense for your service. It must be
 *                      unique among all songs available in your service.
 *                  title: Title of the song.
 *                  artist: Artist of the song. (optional)
 *                  album: Album of the song. (optional)
 *                  image_url: URL of the high-res album art image. (optional)
 *                  thumbnail_url: URL of the low-res album art image for the
 *                                 search result thumbnail. (optional)
 */
exports.search = function(max_results, query) {
  var deferred = Q.defer();

  Youtube.search.list({
    part: 'snippet',
    type: 'video',
    q: encodeURIComponent(query),
    maxResults: max_results
  }, function(err, data) {
    if (err) {
      deferred.reject(err);
      return;
    }

    deferred.resolve(data.items.map(format_result));
  });

  return deferred.promise;
};

/**
 * Fetches the song of the specified id.
 *
 * @param id String of the song's ID to fetch. This is the ID your service
 *           returned in the search results.
 * @param download_location Directory to store the song file in temporarily.
 * @return Promise resolving with full path of the downloaded song file. If
 *         there was an error, the promise is rejected with an Error object.
 */
exports.fetch = function(id, download_location) {
  var deferred = Q.defer();

  id = encodeURIComponent(id);
  var url = 'http://www.youtube.com/watch?v=' + id;
  var download_path = download_location + id + '.webm';

  var ws = fs.createWriteStream(download_path);

  ytdl.getInfo(url, function(err, info) {
    if (err) {
      deferred.reject(err);
      return;
    }

    if (info && info.length_seconds > 10 * 60) {
      deferred.reject(new Error('Requested video exceeded 10 minutes.'));
      return;
    }

    var dl = ytdl(url, {
      quality: 'lowest',
      filter: function(format) {
        // Only download a webm file whose itag is in the audio-only range.
        // http://en.wikipedia.org/wiki/YouTube#Quality_and_codecs
        var itag = parseInt(format.itag, 10);
        return format.container === 'webm' && itag >= 139 && itag <= 172;
      }
    });

    dl.pipe(ws);

    dl.on('end', function() {
      log('Downloaded: ' + url);
      deferred.resolve(download_path);
    });

    dl.on('error', function(err) {
      log.error('Failed to download ' + url + ': ' + (err.message || err));
      deferred.reject(err);
    });
  });

  return deferred.promise;
};

