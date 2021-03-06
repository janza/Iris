
import React, { PropTypes } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'

import Track from './Track'
import ContextMenuTrigger from './ContextMenuTrigger'

import * as helpers from '../helpers'
import * as mopidyActions from '../services/mopidy/actions'
import * as uiActions from '../services/ui/actions'

class TrackList extends React.Component{

	constructor(props) {
		super(props);

		this._touch_threshold = 10
		this._touch_x = null
		this._touch_y = null

		this.state = {
			tracks: [],
			lastSelectedTrack: false
		}

		this.handleKeyUp = this.handleKeyUp.bind(this)
	}

	componentWillMount(){
		window.addEventListener("keyup", this.handleKeyUp, false);
	}

	componentWillUnmount(){
		window.removeEventListener("keyup", this.handleKeyUp, false);
	}

	componentDidMount(){
		this.setState({ tracks: this.keyifyTracks(this.props.tracks) })
	}

	componentWillReceiveProps(nextProps){
		this.setState({ tracks: this.keyifyTracks(nextProps.tracks) });
	}

	handleKeyUp(e){
		if( this.selectedTracks().length <= 0 ) return;

		switch(e.keyCode){
			
			case 13: // enter
				 this.playTracks();
				break;
			
			case 46: // delete
				 this.removeTracks();
				break;
		}
	}

	handleTouchStart(e,index){
		this._touch_x = Math.round(e.changedTouches[0].pageX)
		this._touch_y = Math.round(e.changedTouches[0].pageY)
	}

	handleTouchEnd(e,index){
		var pageX = Math.round(e.changedTouches[0].pageX)
		var pageY = Math.round(e.changedTouches[0].pageY)

		// make sure our touch was within the threshold of the touch start
		// this helps us differentiate between taps and drags but doesn't consider
		// multi-finger touches
		if( this._touch_x < ( pageX + this._touch_threshold ) &&
			this._touch_x > ( pageX - this._touch_threshold ) &&
			this._touch_y < ( pageY + this._touch_threshold ) &&
			this._touch_y > ( pageY - this._touch_threshold ) ){
				this.handleTouchContextMenu(e,index)
		}

		e.preventDefault()
	}

	handleDoubleClick(e,index){
		if (this.props.context_menu) this.props.uiActions.hideContextMenu()
		this.playTracks()
	}

	handleMouseDown(e,index){
		if (this.props.emulate_touch){
			this.handleTouchContextMenu(e,index)
		}else{
			if (this.props.context_menu) this.props.uiActions.hideContextMenu()
			if (!this.state.tracks[index].selected && !this.isRightClick(e) && !e.ctrlKey) this.toggleTrackSelections(e, index)

			var selected_tracks = this.selectedTracks()
			this.props.uiActions.dragStart( e, this.props.context, this.props.uri, selected_tracks, this.tracksIndexes(selected_tracks) )
		}
	}

	handleMouseUp(e,index){

		// right-clicking on an un-highlighted track
		if( !this.state.tracks[index].selected && this.isRightClick(e) ){
			this.toggleTrackSelections(e, index)

		// selected track, regular click
		}else if( this.state.tracks[index].selected && !this.isRightClick(e) ){
			this.toggleTrackSelections(e, index)

		// ctrl key
		}else if( e.ctrlKey ){
			this.toggleTrackSelections(e, index)
		}

		if( this.props.dragger && this.props.dragger.active ){
		
			// if this tracklist handles sorting, handle it
			if( typeof(this.props.reorderTracks) !== 'undefined' ){
				var indexes = this.props.dragger.victims_indexes
				return this.props.reorderTracks( indexes, index );
			}
		}
	}

	handleContextMenu(e,index){
		var selected_tracks = this.selectedTracks()
		var data = {
			e: e,
			context: (this.props.context ? this.props.context : 'track'),
			tracklist_uri: (this.props.uri ? this.props.uri : null),
			items: selected_tracks,
			uris: helpers.asURIs(selected_tracks),
			indexes: this.tracksIndexes(selected_tracks)
		}
		this.props.uiActions.showContextMenu(data)
	}

	handleTouchContextMenu(e,index){

		// toggle selection
		var tracks = this.state.tracks
		tracks[index].selected = !tracks[index].selected
		this.setState({ tracks: tracks, lastSelectedTrack: index })

		// update our context menu to hide/show
		var selected_tracks = this.selectedTracks()
		if( selected_tracks.length > 0 ){
			var data = {
				context: (this.props.context ? this.props.context : 'track'),
				tracklist_uri: (this.props.uri ? this.props.uri : null),
				items: selected_tracks,
				uris: helpers.asURIs(selected_tracks),
				indexes: this.tracksIndexes(selected_tracks)
			}
			this.props.uiActions.showTouchContextMenu(data)
		}else{
			this.props.uiActions.hideTouchContextMenu()
		}
	}

	toggleTrackSelections(e,index){
		var tracks = this.state.tracks
		var lastSelectedTrack = this.state.lastSelectedTrack

		if( e.ctrlKey ){

			if (tracks[index].selected){
				tracks[index].selected = false
			} else {
				tracks[index].selected = true
				lastSelectedTrack = index
			}

		}else if( e.shiftKey ){

			if( this.state.lastSelectedTrack < index ){
				var start = this.state.lastSelectedTrack
				var end = index
			}else{
				var start = index
				var end = this.state.lastSelectedTrack
			}

			if (start !== false && end !== false){
				for( var i = start; i <= end; i++ ){
					tracks[i].selected = true
					lastSelectedTrack = index
				}
			}

		}else{

			for( var i = 0; i < tracks.length; i++ ){
				tracks[i].selected = false
			}

			tracks[index].selected = true
			lastSelectedTrack = index
		}

		this.setState({ tracks: tracks, lastSelectedTrack: lastSelectedTrack })
	}

	isRightClick(e){
		if( 'which' in e ) 
			return e.which == 3
		if( 'button' in e ) 
			return e.button == 2
		return false
	}

	keyifyTracks( tracks ){
		for( var i = 0; i < tracks.length; i++ ){
			tracks[i] = Object.assign(
				{}, 
				tracks[i], 
				{
					key: i+'_'+tracks[i].uri
				})
		}
		return tracks
	}

	selectedTracks(){
		function isSelected( track ){
			return ( typeof(track.selected) !== 'undefined' && track.selected );
		}
		return this.state.tracks.filter(isSelected)
	}

	tracksIndexes(tracks){
		var indexes = []
		for( var i = 0; i < tracks.length; i++ ){
			indexes.push( this.props.tracks.indexOf(tracks[i]))
		}
		return indexes
	}

	playTracks(){

		var tracks = this.selectedTracks();

		// if we've got a specific action, run it
		if( typeof(this.props.playTracks) !== 'undefined' ){
			return this.props.playTracks( tracks );
		}

		// default to playing a bunch of uris
		var uris = [];
		for( var i = 0; i < tracks.length; i++ ){
			uris.push( tracks[i].uri )
		}
		return this.props.mopidyActions.playURIs( uris, this.props.uri )
	}

	removeTracks(){
		
		// if this tracklist handles removal, handle it
		if( typeof(this.props.removeTracks) !== 'undefined' ){
			var tracks = this.selectedTracks();
			var tracks_indexes = this.tracksIndexes(tracks);
			return this.props.removeTracks( tracks_indexes );
		}

		// by default, do nothing
	}

	renderHeader(){
		if( this.props.noheader ) return null
		
		switch (this.props.context){

			case 'history':
				return (
					<div className="list-item header track">
						<span className="col name">Name</span>
						<span className="col played_at">Started playing</span>
					</div>
				)
				break

			case 'queue':
				return (
					<div className="list-item header track">
						<span className="col name">Name</span>
						<span className="col artists">Artists</span>
						<span className="col album">Album</span>
						<span className="col added">Added by</span>
						<span className="col duration">Length</span>
					</div>
				)
				break

			default:
				return (
					<div className="list-item header track">
						<span className="col name">Name</span>
						<span className="col artists">Artists</span>
						<span className="col album">Album</span>
						<span className="col duration">Length</span>
					</div>
				)
		}
	}

	render(){
		if( !this.state.tracks || Object.prototype.toString.call(this.state.tracks) !== '[object Array]' ) return null

		let self = this;
		return (
			<div className={this.props.context+" track-list"}>
				{ this.renderHeader() }
				{
					this.state.tracks.map(
						(track, index) => {
							return <Track
									show_source_icon={ this.props.show_source_icon }
									key={track.key} 
									track={track} 
									context={this.props.context} 
									handleDoubleClick={ e => self.handleDoubleClick(e, index)}
									handleMouseUp={ e => self.handleMouseUp(e, index)}
									handleMouseDown={ e => self.handleMouseDown(e, index)}
									handleTouchStart={ e => self.handleTouchStart(e, index)}
									handleTouchEnd={ e => self.handleTouchEnd(e, index)}
									handleContextMenu={ e => self.handleContextMenu(e, index)} />
						}
					)
				}
				{this.selectedTracks().length > 0 ? <ContextMenuTrigger onTrigger={e => this.handleContextMenu(e)} /> : null}
			</div>
		);
	}
}


/**
 * Export our component
 *
 * We also integrate our global store, using connect()
 **/

const mapStateToProps = (state, ownProps) => {
	return {
		dragger: state.ui.dragger,
		emulate_touch: state.ui.emulate_touch,
		current_track: state.ui.current_track,
		context_menu: state.ui.context_menu
	}
}

const mapDispatchToProps = (dispatch) => {
	return {
		mopidyActions: bindActionCreators(mopidyActions, dispatch),
		uiActions: bindActionCreators(uiActions, dispatch)
	}
}

export default connect(mapStateToProps, mapDispatchToProps)(TrackList)