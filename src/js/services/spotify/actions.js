
var uiActions = require('../../services/ui/actions.js')
var helpers = require('../../helpers.js')

/**
 * Send an ajax request to the Spotify API
 *
 * @param dispatch obj
 * @param getState obj
 * @param endpoint string = the url to query (ie /albums/:uri)
 * @param method string
 * @param data mixed = request payload
 * @return Promise
 **/
const sendRequest = ( dispatch, getState, endpoint, method = 'GET', data = false) => {
    return new Promise( (resolve, reject) => {         
        getToken( dispatch, getState )
            .then( response => {

                // prepend the API baseurl, unless the endpoint already has it (ie pagination requests)
                var url = 'https://api.spotify.com/v1/'+endpoint
                if( endpoint.startsWith('https://api.spotify.com/') ) url = endpoint;

                // create our ajax request config
                var config = {
                    method: method,
                    url: url,
                    cached: true,
                    headers: {
                        Authorization: 'Bearer '+ response
                    }
                }

                // only if we've got data do we add it to the request (this prevents appending of "&false" to the URL)
                if (data) config.data = JSON.stringify(data)

                $.ajax(config).then( 
                        response => {
                            resolve(response)
                        },
                        (xhr, status, error) => {
                            var message = xhr.responseText
                            var response = JSON.parse(xhr.responseText)                            
                            if (response.error && response.error.message) message = response.error.message

                            dispatch(uiActions.createNotification('Spotify: '+message,'bad'))
                            console.error( endpoint+' failed', response)
                            reject(error)
                        }
                    )
            });
        }
    );
}


/**
* Check an access token validity
*
* @return Promise
**/
function getToken( dispatch, getState ){
    return new Promise( (resolve, reject) => {

        // token is okay for now, so just resolve with the current token
        if( getState().spotify.token_expiry && new Date().getTime() < getState().spotify.token_expiry ){
            resolve(getState().spotify.access_token)
            return
        }

        // token is expiring/expired, so go get a new one and resolve that
        refreshToken( dispatch, getState )
            .then(
                response => resolve(response.access_token),
                error => {
                    dispatch({ type: 'SPOTIFY_DISCONNECTED' })
                    reject(error)
                }
            );
    });
}

function refreshToken( dispatch, getState ){
    return new Promise( (resolve, reject) => {

        if( getState().spotify.authorized ){

            $.ajax({
                    method: 'GET',
                    url: '//jamesbarnsley.co.nz/auth.php?action=refresh&refresh_token='+getState().spotify.refresh_token,
                    dataType: "json",
                    timeout: 10000
                })
                .then(
                    response => {
                        response.token_expiry = new Date().getTime() + ( response.expires_in * 1000 )
                        response.source = 'spotify'
                        dispatch({
                            type: 'SPOTIFY_TOKEN_REFRESHED',
                            provider: 'spotify-http-api',
                            data: response
                        })
                        resolve(response)
                    },
                    error => {
                        dispatch({ type: 'SPOTIFY_DISCONNECTED' })
                        dispatch(uiActions.createNotification('Could not refresh token','bad'))
                        console.error('Could not refresh token', error)
                        reject(error)
                    }
                );

        }else{

            $.ajax({
                    method: 'GET',
                    url: '//'+getState().mopidy.host+':'+getState().mopidy.port+'/iris/http/refresh_spotify_token',
                    dataType: "json",
                    timeout: 10000
                })
                .then(
                    response => {
                        var token = response.spotify_token
                        token.token_expiry = new Date().getTime() + ( token.expires_in * 1000 );
                        token.source = 'mopidy';
                        dispatch({
                            type: 'SPOTIFY_TOKEN_REFRESHED',
                            provider: 'mopidy-spotify',
                            data: token
                        });
                        resolve(token);
                    },
                    error => {
                        dispatch({ type: 'SPOTIFY_DISCONNECTED' })
                        dispatch(uiActions.createNotification('Could not refresh token','bad'))
                        console.error('Could not refresh token', error)
                        reject(error)
                    }
                );
        }

    })
}


/**
 * Actions and Action Creators
 **/

export function setConfig( config ){
    return {
        type: 'SPOTIFY_SET_CONFIG',
        config: config
    }
}

export function connect(){
    return (dispatch, getState) => {

        dispatch({ type: 'SPOTIFY_CONNECTING' });

        // send a generic request to ensure spotify is up and running
        // there is no 'test' or 'ping' endpoint on the Spotify API
        sendRequest( dispatch, getState, 'browse/categories?limit=1' )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_CONNECTED'
                });
            });
    }
}


/**
 * Handle authorization process
 **/

export function authorizationGranted( data ){
    data.token_expiry = new Date().getTime() + data.expires_in;
    return { type: 'SPOTIFY_AUTHORIZATION_GRANTED', data: data }
}

export function authorizationRevoked(){
    return { type: 'SPOTIFY_AUTHORIZATION_REVOKED' }
}

export function refreshingToken(){
    return (dispatch, getState) => {
        dispatch({ type: 'SPOTIFY_TOKEN_REFRESHING' });
        refreshToken( dispatch, getState );
    }
}


/**
 * Get current user
 **/
export function getMe(){
    return (dispatch, getState) => {

        // flush out the previous store value
        dispatch({ type: 'SPOTIFY_ME_LOADED', data: false });

        sendRequest( dispatch, getState, 'me' )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_ME_LOADED',
                    data: response
                });
            });
    }
}


/**
 * Get a single track
 *
 * @param uri string
 **/
export function getTrack( uri ){
    return (dispatch, getState) => {

        // flush out the previous store value
        dispatch({ type: 'SPOTIFY_TRACK_LOADED', data: false });

        sendRequest( dispatch, getState, 'tracks/'+ helpers.getFromUri('trackid', uri) )
            .then( response => {
                    dispatch({
                        type: 'SPOTIFY_TRACK_LOADED',
                        data: response
                    });
                }
            );
    }
}

export function getLibraryTracks(){
    return (dispatch, getState) => {

        dispatch({ type: 'SPOTIFY_LIBRARY_TRACKS_LOADED', data: false });

        sendRequest( dispatch, getState, 'me/tracks?limit=50' )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_LIBRARY_TRACKS_LOADED',
                    data: response
                });
            });
    }
}

export function getFeaturedPlaylists(){
    return (dispatch, getState) => {

        dispatch({ type: 'SPOTIFY_FEATURED_PLAYLISTS_LOADED', data: false });

        var date = new Date();
        var year = date.getFullYear();
        var month = date.getMonth();
        if( month < 10 ) month = '0'+month;
        var day = date.getDay();
        if( day < 10 ) day = '0'+day;
        var hour = date.getHours();
        if( hour < 10 ) hour = '0'+hour;
        var min = date.getMinutes();
        if( min < 10 ) min = '0'+min;
        var sec = date.getSeconds();
        if( sec < 10 ) sec = '0'+sec;

        var timestamp = year+'-'+month+'-'+day+'T'+hour+':'+min+':'+sec;

        sendRequest( dispatch, getState, 'browse/featured-playlists?timestamp='+timestamp+'&country='+getState().spotify.country+'&limit=50&locale='+getState().spotify.locale )
            .then( response => {

                var playlists = []
                for (var i = 0; i < response.playlists.items.length; i++){
                    playlists.push(Object.assign(
                        {},
                        response.playlists.items[i],
                        {
                            can_edit: (getState().spotify.me && response.playlists.items[i].owner.id == getState().spotify.me.id),
                            tracks_total: response.playlists.items[i].tracks.total
                        }
                    ))
                }

                dispatch({
                    type: 'PLAYLISTS_LOADED',
                    playlists: playlists
                });  
                dispatch({
                    type: 'SPOTIFY_FEATURED_PLAYLISTS_LOADED',
                    data: {
                        message: response.message,
                        playlists: helpers.asURIs(response.playlists.items)
                    }
                });
            });
    }
}

export function getCategories(){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'browse/categories?limit=50&country='+getState().spotify.country+'&locale='+getState().spotify.locale )
            .then( response => {
                dispatch({
                    type: 'CATEGORIES_LOADED',
                    categories: response.categories.items
                });
            });
    }
}

export function getCategory( id ){
    return (dispatch, getState) => {

        dispatch({
            type: 'CATEGORY_LOADED',
            key: 'category:'+id,
            category: {
                playlists_uris: null
            }
        });

        // get the category
        sendRequest( dispatch, getState, 'browse/categories/'+id+'?country='+getState().spotify.country+'&locale='+getState().spotify.locale )
            .then( response => {
                var category = Object.assign({}, response)
                dispatch({
                    type: 'CATEGORY_LOADED',
                    key: 'category:'+id,
                    category: Object.assign({}, response)
                });
            })

        // and the category's playlists
        sendRequest( dispatch, getState, 'browse/categories/'+id+'/playlists?limit=50&country='+getState().spotify.country+'&locale='+getState().spotify.locale )
            .then( response => {

                var playlists = []
                for (var i = 0; i < response.playlists.items.length; i++){
                    playlists.push(Object.assign(
                        {},
                        response.playlists.items[i],
                        {
                            tracks: null,
                            tracks_more: null,
                            tracks_total: response.playlists.items[i].tracks.total
                        }
                    ))
                }

                dispatch({
                    type: 'PLAYLISTS_LOADED',
                    playlists: playlists
                });

                dispatch({
                    type: 'SPOTIFY_CATEGORY_PLAYLISTS_LOADED',
                    key: 'category:'+id,
                    data: response
                });                
            })
    }
}

export function getNewReleases(){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'browse/new-releases?country='+getState().spotify.country+'&limit=50' )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_NEW_RELEASES_LOADED',
                    data: response
                });
            });
    }
}

export function getURL( url, action_name, key = false ){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, url )
            .then( response => {
                dispatch({
                    type: action_name,
                    key: key,
                    data: response
                });
            });
    }
}

export function getSearchResults( query, type = 'album,artist,playlist,track', limit = 50, offset = 0 ){
	return (dispatch, getState) => {

        var url = 'search?q='+query
        url += '&type='+type
        url += '&country='+getState().spotify.country
        url += '&limit='+limit
        url += '&offset='+offset

        sendRequest( dispatch, getState, url )
            .then( response => {
                
                dispatch({
                    type: 'ARTISTS_LOADED',
                    artists: response.artists.items
                });

                dispatch({
                    type: 'ALBUMS_LOADED',
                    albums: response.albums.items
                });

                var playlists = []
                for (var i = 0; i < response.playlists.items.length; i++){
                    playlists.push(Object.assign(
                        {},
                        response.playlists.items[i],
                        {
                            can_edit: (getState().spotify.me && response.playlists.items[i].owner.id == getState().spotify.me.id),
                            tracks_total: response.playlists.items[i].tracks.total
                        }
                    ))
                }
                dispatch({
                    type: 'PLAYLISTS_LOADED',
                    playlists: playlists
                });

                dispatch({
                    type: 'SEARCH_RESULTS_LOADED',
                    playlists_uris: helpers.asURIs(playlists),
                    playlists_more: response.playlists.next,
                    artists_uris: helpers.asURIs(response.artists.items),
                    artists_more: response.artists.next,
                    albums_uris: helpers.asURIs(response.albums.items),
                    albums_more: response.albums.next,
                    tracks: response.tracks.items,
                    tracks_more: response.tracks.next
                });
            });
	}
}

export function following(uri, method = 'GET'){
    return (dispatch, getState) => {

        if( method == 'PUT' ) var is_following = true
        if( method == 'DELETE' ) var is_following = false

        var asset_name = helpers.uriType(uri);
        var endpoint, data
        switch( asset_name ){
            case 'album':
                if( method == 'GET'){
                    endpoint = 'me/albums/contains/?ids='+ helpers.getFromUri('albumid', uri)
                }else{               
                    endpoint = 'me/albums/?ids='+ helpers.getFromUri('albumid', uri) 
                }
                break
            case 'artist':
                if( method == 'GET' ){
                    endpoint = 'me/following/contains?type=artist&ids='+ helpers.getFromUri('artistid', uri)   
                }else{
                    endpoint = 'me/following?type=artist&ids='+ helpers.getFromUri('artistid', uri)
                    data = {}                
                }
                break
            case 'user':
                if( method == 'GET' ){
                    endpoint = 'me/following/contains?type=user&ids='+ helpers.getFromUri('userid', uri)   
                }else{
                    endpoint = 'me/following?type=user&ids='+ helpers.getFromUri('userid', uri)
                    data = {}                
                }
                break
            case 'playlist':
                if( method == 'GET' ){
                    endpoint = 'users/'+ helpers.getFromUri('userid',uri) +'/playlists/'+ helpers.getFromUri('playlistid',uri) +'/followers/contains?ids='+ getState().spotify.me.id
                }else{
                    endpoint = 'users/'+ helpers.getFromUri('userid',uri) +'/playlists/'+ helpers.getFromUri('playlistid',uri) +'/followers'        
                }
                break
        }

        sendRequest( dispatch, getState, endpoint, method, data )
            .then( response => {
                if( response ) is_following = response
                if( typeof(is_following) === 'object' ) is_following = is_following[0]
                dispatch({
                    type: 'SPOTIFY_'+asset_name.toUpperCase()+'_FOLLOWING_LOADED',
                    key: uri,
                    is_following: is_following
                });
            });
    }
}

/**
 * Resolve radio seeds into full objects
 *
 * @param radio object
 **/
export function resolveRadioSeeds( radio ){
    return (dispatch, getState) => {

        if (radio.seed_artists.length > 0){
            var artist_ids = '';
            for (var i = 0; i < radio.seed_artists.length; i++){
                if (i > 0) artist_ids += ','
                artist_ids += helpers.getFromUri('artistid', radio.seed_artists[i])
            }

            sendRequest( dispatch, getState, 'artists/'+ artist_ids )
            .then( response => {
                if (!(response instanceof Array)) response = [response]
                dispatch({
                    type: 'ARTISTS_LOADED',
                    artists: response
                })
            })
        }

        if (radio.seed_tracks.length > 0){
            var track_ids = '';
            for (var i = 0; i < radio.seed_tracks.length; i++){
                if (i > 0) track_ids += ','
                track_ids += helpers.getFromUri('trackid', radio.seed_tracks[i])
            }
            
            sendRequest( dispatch, getState, 'tracks?ids='+ track_ids )
            .then( response => {
                dispatch({
                    type: 'TRACKS_LOADED',
                    tracks: response.tracks
                })
            })
        }
    }
}


/**
 * =============================================================== DISCOVER =============
 * ======================================================================================
 **/


/**
 * Get our recommendations
 * This is based off our 'favorites' and then we use those as seeds
 *
 * @param uri string
 **/
export function getDiscover(){
    return (dispatch, getState) => {

        dispatch({ type: 'SPOTIFY_DISCOVER_LOADED', data: false })

        // get favorite tracks
        sendRequest( dispatch, getState, 'me/top/tracks?limit=50&time_range=long_term' )
            .then( response => {

                var favorite_tracks_uris = helpers.asURIs(response.items)
                favorite_tracks_uris = favorite_tracks_uris.sort(() => .5 - Math.random())
                favorite_tracks_uris = favorite_tracks_uris.slice(0,10)

                for (var i = 0; i < favorite_tracks_uris.length; i++){

                    var seed_id = helpers.getFromUri('trackid',favorite_tracks_uris[i] )

                    $.when(

                        sendRequest( dispatch, getState, 'recommendations?seed_tracks='+seed_id ),
                        sendRequest( dispatch, getState, 'tracks/'+seed_id )

                    ).then( ( tracks_response, seed_response ) => {
                        dispatch({
                            type: 'SPOTIFY_DISCOVER_LOADED',
                            data: {
                                tracks: tracks_response.tracks,
                                seed: seed_response
                            }
                        });
                    });
                }
            })
    }
}




/**
 * =============================================================== ARTIST(S) ============
 * ======================================================================================
 **/

/**
 * Get a single artist
 *
 * @param uri string
 **/
export function getArtist( uri ){
    return (dispatch, getState) => {

        var artist = {};

        // get both the artist and the top tracks
        $.when(

            sendRequest( dispatch, getState, 'artists/'+ helpers.getFromUri('artistid', uri) )
                .then( response => {
                    Object.assign(artist, response);
                }),

            sendRequest( dispatch, getState, 'artists/'+ helpers.getFromUri('artistid', uri) +'/top-tracks?country='+getState().spotify.country )
                .then( response => {
                    Object.assign(artist, response);
                }),

            sendRequest( dispatch, getState, 'artists/'+ helpers.getFromUri('artistid', uri) +'/related-artists' )
                .then( response => {
                    dispatch({
                        type: 'ARTISTS_LOADED',
                        artists: response.artists
                    }); 
                    Object.assign(artist, { related_artists_uris: helpers.asURIs(response.artists) });
                })

        ).then( () => {
            dispatch({
                type: 'ARTIST_LOADED',
                key: artist.uri,
                artist: artist
            });

            // now go get our artist albums
            sendRequest( dispatch, getState, 'artists/'+ helpers.getFromUri('artistid', uri) +'/albums?market='+getState().spotify.country )
                .then( response => {
                    dispatch({
                        type: 'SPOTIFY_ARTIST_ALBUMS_LOADED',
                        data: response,
                        key: uri
                    });
                })
        });
    }
}

export function getArtists( uris ){
    return (dispatch, getState) => {

        // now get all the artists for this album (full objects)
        var ids = '';
        for( var i = 0; i < uris.length; i++ ){
            if( ids != '' ) ids += ','
            ids += helpers.getFromUri( 'artistid', uris[i] );
        }

        sendRequest( dispatch, getState, 'artists/?ids='+ids )
            .then( response => {
                for (var i = i; i < response.length; i++){
                    var artist = response
                    for (var i = 0; i < artist.albums.length; i++){
                        dispatch({
                            type: 'ALBUM_LOADED',
                            album: artist.albums[i]
                        }); 
                    }
                    artist.albums = helpers.asURIs(artist.albums)
                    artist.albums_more = artist.albums.next
                    dispatch({
                        type: 'ARTIST_LOADED',
                        artist: artist
                    });                    
                }
            });
    }
}


export function getLibraryArtists(){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'me/following?type=artist&limit=50' )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_LIBRARY_ARTISTS_LOADED',
                    data: response
                })
            });
    }
}



/**
 * =============================================================== USER(S) ==============
 * ======================================================================================
 **/

export function getUser( uri ){
    return (dispatch, getState) => {

        // get the user
        sendRequest( dispatch, getState, 'users/'+ helpers.getFromUri('userid',uri) )
            .then( response => {
                dispatch({
                    type: 'USER_LOADED',
                    key: response.uri,
                    user: response
                });
            })

        // get the first page of playlists
        sendRequest( dispatch, getState, 'users/'+ helpers.getFromUri('userid', uri) +'/playlists?limit=40' )
            .then( response => {

                var playlists = []
                for (var i = 0; i < response.items.length; i++){
                    playlists.push(Object.assign(
                        {},
                        response.items[i],
                        {
                            can_edit: (getState().spotify.me && response.items[i].owner.id == getState().spotify.me.id),
                            tracks_total: response.items[i].tracks.total
                        }
                    ))
                }

                dispatch({
                    type: 'PLAYLISTS_LOADED',
                    playlists: playlists
                });

                dispatch({
                    type: 'SPOTIFY_USER_PLAYLISTS_LOADED',
                    key: uri,
                    data: response
                });
            })
    }
}




/**
 * =============================================================== ALBUM(S) =============
 * ======================================================================================
 **/

/**
 * Single album
 *
 * @oaram uri string
 **/
export function getAlbum( uri ){
    return (dispatch, getState) => {

        // get the album
        sendRequest( dispatch, getState, 'albums/'+ helpers.getFromUri('albumid', uri) )
            .then( response => {

                // dispatch our loaded artists (simple objects)
                dispatch({
                    type: 'ARTISTS_LOADED',
                    artists: response.artists
                });

                var album = Object.assign(
                    {},
                    response,
                    {
                        artists_uris: helpers.asURIs(response.artists),
                        tracks: response.tracks.items,
                        tracks_more: response.tracks.next,
                        tracks_total: response.tracks.total
                    }
                )

                // add our album to all the tracks
                for (var i = 0; i < album.tracks.length; i++){
                    album.tracks[i].album = {
                        name: album.name,
                        uri: album.uri
                    }
                }

                dispatch({
                    type: 'ALBUM_LOADED',
                    key: album.uri,
                    album: album
                });

                // now get all the artists for this album (full objects)
                // we do this to get the artist artwork
                var artist_ids = [];
                for( var i = 0; i < response.artists.length; i++ ){
                    artist_ids.push( helpers.getFromUri( 'artistid', response.artists[i].uri ) )
                }

                // get all album artists as full objects
                sendRequest( dispatch, getState, 'artists/?ids='+artist_ids )
                    .then( response => {
                        dispatch({
                            type: 'ARTISTS_LOADED',
                            artists: response.artists
                        });
                    });

            })
    }
}

export function getLibraryAlbums(){
    return (dispatch, getState) => {

        dispatch({ type: 'LIBRARY_ALBUMS_LOADED', uris: false });

        sendRequest( dispatch, getState, 'me/albums?limit=40' )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_LIBRARY_ALBUMS_LOADED',
                    data: response
                })
            });
    }
}

export function toggleAlbumInLibrary( uri, method ){
    if( method == 'PUT' ) var new_state = 1
    if( method == 'DELETE' ) var new_state = 0

    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'me/albums?ids='+ helpers.getFromUri('albumid',uri), method )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_ALBUM_FOLLOWING',
                    key: uri,
                    data: new_state
                });
            });
    }
}





/**
 * =============================================================== PLAYLIST(S) ==========
 * ======================================================================================
 **/

export function createPlaylist( name, is_public ){
    return (dispatch, getState) => {

        sendRequest( dispatch, getState, 'users/'+ getState().spotify.me.id +'/playlists/', 'POST', { name: name, public: is_public } )
        .then( response => {

            dispatch({
                type: 'PLAYLIST_LOADED',
                key: response.uri,
                playlist: Object.assign(
                    {},
                    response,
                    {
                        can_edit: true,
                        tracks: [],
                        tracks_more: null,
                        tracks_total: 0
                    })
            });

            dispatch({
                type: 'LIBRARY_PLAYLISTS_LOADED',
                uris: [response.uri]
            });
        })
    }
}

export function savePlaylist( uri, name, is_public ){
    return (dispatch, getState) => {

        sendRequest( dispatch, getState, 'users/'+ getState().spotify.me.id +'/playlists/'+ helpers.getFromUri('playlistid',uri), 'PUT', { name: name, public: is_public } )
        .then( response => {
            dispatch({
                type: 'PLAYLIST_UPDATED',
                playlist: {
                    name: name,
                    public: is_public
                }
            });
        })
    }
}

export function getPlaylist( uri ){
    return (dispatch, getState) => {

        // get the main playlist object
        sendRequest( dispatch, getState, 'users/'+ helpers.getFromUri('userid',uri) +'/playlists/'+ helpers.getFromUri('playlistid',uri) +'?market='+getState().spotify.country )
        .then( response => {

            var playlist = Object.assign(
                {},
                response,
                {
                    can_edit: (getState().spotify.me && response.owner.id == getState().spotify.me.id),
                    tracks: helpers.flattenTracks(response.tracks.items),
                    tracks_more: response.tracks.next,
                    tracks_total: response.tracks.total
                }
            )

            dispatch({
                type: 'PLAYLIST_LOADED',
                key: playlist.uri,
                playlist: playlist
            })
        })
    }
}

function loadNextPlaylistsBatch( dispatch, getState, playlists, lastResponse ){
    if( lastResponse.next ){
        sendRequest( dispatch, getState, lastResponse.next )
            .then( response => {
                playlists = [...playlists, ...response.items]
                loadNextPlaylistsBatch( dispatch, getState, playlists, response )
            });
    }else{
        dispatch({
            type: 'SPOTIFY_LIBRARY_PLAYLISTS_LOADED',
            playlists: playlists
        });
    }
}

export function getAllLibraryPlaylists(){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'me/playlists?limit=50' )
            .then( response => {
                loadNextPlaylistsBatch( dispatch, getState, response.items, response )
            });
    }
}

export function toggleFollowingPlaylist( uri, method ){
    if( method == 'PUT' ) var new_state = 1
    if( method == 'DELETE' ) var new_state = 0

    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'users/'+ helpers.getFromUri('userid',uri) + '/playlists/'+ helpers.getFromUri('playlistid',uri) + '/followers', method )
            .then( response => {
                dispatch({
                    type: 'SPOTIFY_PLAYLIST_FOLLOWING_LOADED',
                    key: uri,
                    is_following: new_state
                });
            });
    }
}

export function addTracksToPlaylist( uri, tracks_uris ){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'users/'+ helpers.getFromUri('userid',uri) + '/playlists/'+ helpers.getFromUri('playlistid',uri) + '/tracks', 'POST', { uris: tracks_uris } )
            .then( response => {
                dispatch({
                    type: 'PLAYLIST_TRACKS_ADDED',
                    key: uri,
                    tracks_uris: tracks_uris,
                    snapshot_id: response.snapshot_id
                });
            });
    }
}

export function deleteTracksFromPlaylist( uri, snapshot_id, tracks_indexes ){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'users/'+ helpers.getFromUri('userid',uri) + '/playlists/'+ helpers.getFromUri('playlistid',uri) + '/tracks', 'DELETE', { snapshot_id: snapshot_id, positions: tracks_indexes } )
            .then( response => {
                dispatch({
                    type: 'PLAYLIST_TRACKS_REMOVED',
                    key: uri,
                    tracks_indexes: tracks_indexes,
                    snapshot_id: response.snapshot_id
                });
            });
    }
}

export function reorderPlaylistTracks( uri, range_start, range_length, insert_before, snapshot_id ){
    return (dispatch, getState) => {
        sendRequest( dispatch, getState, 'users/'+ helpers.getFromUri('userid',uri) + '/playlists/'+ helpers.getFromUri('playlistid',uri) + '/tracks', 'PUT', { uri: uri, range_start: range_start, range_length: range_length, insert_before: insert_before, snapshot_id: snapshot_id } )
            .then( response => {
                dispatch({
                    type: 'PLAYLIST_TRACKS_REORDERED',
                    key: uri,
                    range_start: range_start,
                    range_length: range_length,
                    insert_before: insert_before,
                    snapshot_id: response.snapshot_id
                });
            });
    }
}