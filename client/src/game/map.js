import * as PIXI from 'pixi.js-legacy'
import gameContainer from './container'
import Background from './background'
import Star from './star'
import Carrier from './carrier'
import Waypoints from './waypoints'
import RulerPoints from './rulerPoints'
import Territories from './territories'
import EventEmitter from 'events'
import GameHelper from '../services/gameHelper'
import AnimationService from './animation'

class Map extends EventEmitter {
  // Represents the current game mode, these are as follows:
  // galaxy - Normal galaxy view
  // waypoints - Displays waypoints overlay for a given carrier
  mode = 'galaxy'

  constructor (app, store) {
    super()

    this.store = store

    this.app = app
    this.container = new PIXI.Container()

    this.stars = []
    this.carriers = []

    this.zoomPercent = 0
  }

  _setupContainers () {
    this.backgroundContainer = new PIXI.Container()
    this.starContainer = new PIXI.Container()
    this.carrierContainer = new PIXI.Container()
    this.waypointContainer = new PIXI.Container()
    this.rulerPointContainer = new PIXI.Container()
    this.territoryContainer = new PIXI.Container()

    this.container.addChild(this.backgroundContainer)
    this.container.addChild(this.territoryContainer)
    this.container.addChild(this.rulerPointContainer)
    this.container.addChild(this.waypointContainer)
    this.container.addChild(this.starContainer)
    this.container.addChild(this.carrierContainer)
  }

  setup (game, userSettings) {
    this.game = game
    
    // Cleanup events
    this.stars.forEach(s => s.removeAllListeners())
    this.carriers.forEach(s => s.removeAllListeners())

    this.container.removeChildren()
    this._setupContainers()

    // Reset the canvas
    this.stars = []
    this.carriers = []

    // Add stars
    for (let i = 0; i < game.galaxy.stars.length; i++) {
      this.setupStar(game, userSettings, game.galaxy.stars[i])
    }

    // Add carriers
    for (let i = 0; i < game.galaxy.carriers.length; i++) {
      this.setupCarrier(game, userSettings, game.galaxy.carriers[i])
    }

    // -----------
    // Setup Waypoints
    if (this.waypoints) {
      this.waypoints.removeAllListeners()
    }

    this.waypoints = new Waypoints()
    this.waypoints.setup(game)
    this.waypoints.onWaypointCreatedHandler = this.waypoints.on('onWaypointCreated', this.onWaypointCreated.bind(this))

    this.waypointContainer.addChild(this.waypoints.container)

    // -----------
    // Setup Ruler Points
    if (this.rulerPoints) {
      this.rulerPoints.removeAllListeners()
    }

    this.rulerPoints = new RulerPoints()
    this.rulerPoints.setup(game)
    this.rulerPoints.onRulerPointCreatedHandler = this.rulerPoints.on('onRulerPointCreated', this.onRulerPointCreated.bind(this))
    this.rulerPoints.onRulerPointsClearedHandler = this.rulerPoints.on('onRulerPointsCleared', this.onRulerPointsCleared.bind(this))

    this.rulerPointContainer.addChild(this.rulerPoints.container)

    // -----------
    // Setup Territories
    this.territories = new Territories()
    this.territories.setup(game)

    this.territoryContainer.addChild(this.territories.container)
    this.territories.draw()

    // -----------
    // Setup Background
    this.background = new Background()
    this.background.setup(game, userSettings)

    this.backgroundContainer.addChild(this.background.container)
    this.background.draw()
  }

  setupStar (game, userSettings, starData) {
    let star = this.stars.find(x => x.data._id === starData._id)

    if (!star) {
      star = new Star(this.app)
      this.stars.push(star)

      this.starContainer.addChild(star.container)
      this.starContainer.addChild(star.fixedContainer)

      star.on('onStarClicked', this.onStarClicked.bind(this))
      star.on('onStarRightClicked', this.onStarRightClicked.bind(this))
    }

    star.setup(starData, userSettings, game.galaxy.players, game.galaxy.carriers, game.constants.distances.lightYear)

    return star
  }

  setupCarrier (game, userSettings, carrierData) {
    let existing = this.carriers.find(x => x.data._id === carrierData._id)

    if (existing) {
      existing.off('onCarrierClicked', this.onCarrierClicked.bind(this))
      existing.off('onCarrierRightClicked', this.onCarrierRightClicked.bind(this))
      existing.off('onCarrierMouseOver', this.onCarrierMouseOver.bind(this))
      existing.off('onCarrierMouseOut', this.onCarrierMouseOut.bind(this))

      this.carrierContainer.removeChild(existing.container)
      this.carrierContainer.removeChild(existing.fixedContainer)

      this.carriers.splice(this.carriers.indexOf(existing), 1)
    }

    let carrier = new Carrier()
    let player = GameHelper.getPlayerById(game, carrierData.ownedByPlayerId)

    carrier.setup(carrierData, userSettings, this.stars, player, game.constants.distances.lightYear)

    this.carriers.push(carrier)

    this.carrierContainer.addChild(carrier.container)
    this.carrierContainer.addChild(carrier.fixedContainer)

    carrier.on('onCarrierClicked', this.onCarrierClicked.bind(this))
    carrier.on('onCarrierRightClicked', this.onCarrierRightClicked.bind(this))
    carrier.on('onCarrierMouseOver', this.onCarrierMouseOver.bind(this))
    carrier.on('onCarrierMouseOut', this.onCarrierMouseOut.bind(this))

    return carrier
  }

  draw () {
    this.drawStars()
    this.drawCarriers()

    if (this.mode === 'waypoints') {
      this.drawWaypoints()
    } else {
      this.clearWaypoints()
    }

    if (this.mode === 'ruler') {
      this.drawRulerPoints()
    } else {
      this.clearRulerPoints()
    }
  }

  reloadGame (game, userSettings) {
    // Update all of the stars.
    for (let i = 0; i < game.galaxy.stars.length; i++) {
      let starData = game.galaxy.stars[i]
      let existing = this.stars.find(x => x.data._id === starData._id)

      existing.setup(starData, userSettings, game.galaxy.players, game.galaxy.carriers, game.constants.distances.lightYear)
      existing.draw()
    }

    // Remove any carriers that have been destroyed and add new ones that have been built.
    for (let i = 0; i < game.galaxy.carriers.length; i++) {
      let carrierData = game.galaxy.carriers[i]

      let existing = this.carriers.find(x => x.data._id === carrierData._id)

      if (existing) {
        let player = GameHelper.getPlayerById(game, carrierData.ownedByPlayerId)

        existing.setup(carrierData, userSettings, this.stars, player, game.constants.distances.lightYear)
      } else {
        existing = this.setupCarrier(game, userSettings, carrierData)
      }

      existing.draw()
    }

    this.territories.setup(game)
    this.territories.draw()
  }


  _disableCarriersInteractivity() {
    this.carriers.forEach( c => c.disableInteractivity() )
  }

  _enableCarriersInteractivity() {
    this.carriers.forEach( c => c.enableInteractivity() )
  }


  setMode (mode, args) {
    this.mode = mode
    this.modeArgs = args

    if (this.mode !== 'galaxy') {
      this.unselectAllCarriers()
      this.unselectAllStars()
    }
    if (this.mode == 'waypoints') {
      this._disableCarriersInteractivity()
    }
    else {
      this._enableCarriersInteractivity()
    }

    this.draw()
  }

  resetMode () {
    this.setMode( 'galaxy', this.modeArgs )
  }

  drawStars () {
    for (let i = 0; i < this.stars.length; i++) {
      let star = this.stars[i]

      this.drawStar(star)
    }
  }

  drawStar (star) {
    star.draw()
  }

  drawCarriers () {
    for (let i = 0; i < this.carriers.length; i++) {
      let carrier = this.carriers[i]

      this.drawCarrier(carrier)
    }
  }

  drawCarrier (carrier) {
    carrier.draw()
  }

  undrawCarrier (carrierData) {
    let existing = this.carriers.find(x => x.data._id === carrierData._id)

    if (existing) {
      existing.off('onCarrierClicked', this.onCarrierClicked.bind(this))
      existing.off('onCarrierRightClicked', this.onCarrierRightClicked.bind(this))
      existing.off('onCarrierMouseOver', this.onCarrierMouseOver.bind(this))
      existing.off('onCarrierMouseOut', this.onCarrierMouseOut.bind(this))

      this.carrierContainer.removeChild(existing.container)
      this.carrierContainer.removeChild(existing.fixedcontainer)

      this.carriers.splice(this.carriers.indexOf(existing), 1)
    }
  }

  drawWaypoints () {
    this.waypoints.draw(this.modeArgs)
  }

  clearWaypoints () {
    this.waypoints.clear()
  }

  drawRulerPoints () {
    this.rulerPoints.draw(this.modeArgs)
  }

  clearRulerPoints () {
    this.rulerPoints.setup(this.game)
  }

  panToPlayer (game, player) {
    // Find the home star the player owns.
    let homeStar = game.galaxy.stars.find(x => {
      return x._id === player.homeStarId
    })

    if (!homeStar) {
      return
    }

    gameContainer.viewport.moveCenter(homeStar.location.x, homeStar.location.y)

    let zoomPercent = gameContainer.getViewportZoomPercentage()

    this.refreshZoom(zoomPercent)
  }

  panToUser (game) {
    let player = GameHelper.getUserPlayer(game)

    if (!player) {
      this.panToLocation({ x: 0, y: 0 })
      return
    }

    this.panToPlayer(game, player)
  }

  panToStar (star) {
    this.panToLocation(star.location)
  }

  panToCarrier (carrier) {
    this.panToLocation(carrier.location)
  }

  panToLocation (location) {
    gameContainer.viewport.moveCenter(location.x, location.y)
  }

  clickStar (starId) {
    let star = this.stars.find(s => s.data._id === starId)

    star.onClicked()
    star.isSelected = true
  }

  clickCarrier (carrierId) {
    let carrier = this.carriers.find(s => s.data._id === carrierId)

    carrier.onClicked()
    carrier.isSelected = true
  }

  unselectAllStars () {
    this.stars
      .forEach(s => {
        s.isSelected = false
        s.updateVisibility() // Should be fine to pass in false for force
      })
  }

  unselectAllCarriers () {
    this.carriers
      .forEach(c => {
        c.isSelected = false
        c.updateVisibility()
      })
  }

  unselectAllStarsExcept (star) {
    this.stars
      .filter(s => s.isSelected || s.data._id === star.data._id) // Get only stars that are selected or the e star.
      .forEach(s => {
        // Set all other stars to unselected.
        if (s.data._id !== star.data._id) {
          s.isSelected = false
        }

        s.updateVisibility()
      })
  }

  unselectAllCarriersExcept (carrier) {
    this.carriers
      .filter(c => c.isSelected || c.data._id === carrier.data._id) // Get only stars that are selected or the e star.
      .forEach(c => {
        // Set all other carriers to unselected.
        if (c.data._id !== carrier.data._id) {
          c.isSelected = false
        }

        c.updateVisibility()
      })
  }

  onTick(deltaTime) {
    let viewportWidth = gameContainer.viewport.right - gameContainer.viewport.left
    let viewportHeight = gameContainer.viewport.bottom - gameContainer.viewport.top
    
    let viewportXRadius = viewportWidth / 2.0
    let viewportYRadius = viewportHeight / 2.0
    
    let viewportCenter = gameContainer.viewport.center

    let zoomPercent = (gameContainer.viewport.screenWidth/viewportWidth) * 100

    let viewportData = {
      center: viewportCenter,
      xradius: viewportXRadius,
      yradius: viewportYRadius
    }

    let clampedScaling = this.store.state.settings.map.objectsScaling == 'clamped'

    this.stars.forEach(s => s.onTick(deltaTime, zoomPercent, viewportData, clampedScaling))
    this.carriers.forEach(c => c.onTick(deltaTime, zoomPercent, viewportData, clampedScaling))

    this.background.onTick(deltaTime, viewportData)
  }

  onViewportPointerDown(e) {
    //need Object.assign, wich is weird since pixie says it creates a new point each time
    this.lastPointerDownPosition = Object.assign({}, e.data.global)
  }

  //not sure where to put this func
  isDragMotion(position) {
    let DRAG_THRESHOLD = 8 //max distance in pixels
    let dxSquared = Math.pow(Math.abs(this.lastPointerDownPosition.x - position.x),2)
    let dySquared = Math.pow(Math.abs(this.lastPointerDownPosition.y - position.y),2)
    let distance = Math.sqrt(dxSquared+dySquared)
    
    return (distance > DRAG_THRESHOLD)
  }

  onStarClicked (dic) {
    // ignore clicks if its a drag motion
    let e = dic.starData
    if (dic.eventData && this.isDragMotion(dic.eventData.global)) { return }
    
    // Clicking stars should only raise events to the UI if in galaxy mode.
    if (this.mode === 'galaxy') {
      let selectedStar = this.stars.find(x => x.data._id === e._id)
      selectedStar.isSelected = !selectedStar.isSelected

      this.unselectAllCarriers()
      this.unselectAllStarsExcept(selectedStar)
      
      if (!this.tryMultiSelect(e.location)) {
        this.emit('onStarClicked', e)
      } else {
        selectedStar.isSelected = false // If multi-select then do not select the star.
      }
    } else if (this.mode === 'waypoints') {
      this.waypoints.onStarClicked(e)
    } else if (this.mode === 'ruler') {
      this.rulerPoints.onStarClicked(e)
    }

    AnimationService.drawSelectedCircle(this.app, this.container, e.location)
  }

  onStarRightClicked (e) {
    if (this.mode === 'galaxy') {
      this.emit('onStarRightClicked', e)
    }
  }

  onCarrierClicked (dic) {
    // ignore clicks if its a drag motion
    if (dic.eventData && this.isDragMotion(dic.eventData.global)) { return }
    
    let e = dic.carrierData
    // Clicking carriers should only raise events to the UI if in galaxy mode.
    if (this.mode === 'galaxy') {
      // If the carrier is in orbit, pass the click over to the star instead.
      if (e.orbiting) {
        let star = this.stars.find(x => x.data._id === e.orbiting)
        let eventData = dic ? dic.eventData : null
  
        return this.onStarClicked({starData: star.data, eventData})
      }

      let selectedCarrier = this.carriers.find(x => x.data._id === e._id)
      selectedCarrier.isSelected = !selectedCarrier.isSelected

      this.unselectAllStars()
      this.unselectAllCarriersExcept(selectedCarrier)
      
      if (!this.tryMultiSelect(e.location)) {
        this.emit('onCarrierClicked', e)
      } else {
        selectedCarrier.isSelected = false
      }
    } else if (this.mode === 'ruler') {
      this.rulerPoints.onCarrierClicked(e)
    }

    AnimationService.drawSelectedCircle(this.app, this.container, e.location)
  }

  onCarrierRightClicked (e) {
    if (this.mode === 'galaxy') {
      this.emit('onCarrierRightClicked', e)
    }
  }

  onCarrierMouseOver (e) {
    // If the carrier is orbiting something then send the mouse over event
    // to the star.
    if (e.orbiting) {
      let star = this.stars.find(s => s.data._id === e.orbiting)
      star.onMouseOver()
    }
  }

  onCarrierMouseOut (e) {
    // If the carrier is orbiting something then send the mouse over event
    // to the star.
    if (e.orbiting) {
      let star = this.stars.find(s => s.data._id === e.orbiting)
      star.onMouseOut()
    }
  }

  onWaypointCreated (e) {
    this.emit('onWaypointCreated', e)
  }

  onRulerPointCreated (e) {
    this.emit('onRulerPointCreated', e)
  }

  onRulerPointsCleared (e) {
    this.emit('onRulerPointsCleared', e)
  }

  tryMultiSelect (location) {
    // See if there are any other objects close by, if so then
    // we want to allow the user to select which one they want as there might be
    // objects on the map that are on top of eachother or very close together.
    const distance = 10

    let closeStars = this.stars
      .map(s => {
        return {
          type: 'star',
          distance: GameHelper.getDistanceBetweenLocations(location, s.data.location),
          data: s.data
        }
      })
      .filter(s => s.distance <= distance)

    let closeCarriers = this.carriers
      .map(s => {
        return {
          type: 'carrier',
          distance: GameHelper.getDistanceBetweenLocations(location, s.data.location),
          data: s.data
        }
      })
      .filter(s => s.distance <= distance)

    // Combine the arrays and order by closest first.
    let closeObjects = closeStars.concat(closeCarriers)
      .sort((a, b) => a.distance - b.distance)

    if (closeObjects.length > 1) {
      this.emit('onObjectsClicked', closeObjects)

      return true
    }

    return false
  }

  refreshZoom (zoomPercent) {
    this.zoomPercent = zoomPercent

    this.stars.forEach(s => s.refreshZoom(zoomPercent))
    this.carriers.forEach(c => c.refreshZoom(zoomPercent))

    /*
    if (this.zoomPercent <= 100) {
      this.drawTerritories()
    } else {
      this.clearTerritories()
    }*/
    this.territories.refreshZoom(zoomPercent)
  }
}

export default Map
