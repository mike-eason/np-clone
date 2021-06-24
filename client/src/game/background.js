import * as PIXI from 'pixi.js-legacy'
import TextureService from './texture'
import * as rng from 'random-seed'
import gameHelper from '../services/gameHelper'

class Background {

  static MAX_PARALLAX = 0.333
  static STAR_DENSITY = 10 // maybe make this into a user setting?
  static STAR_SCALE = 1.0/8.0
  static NEBULA_SCALE = 1.5
  static NEBULA_DELTA_SCALE = Background.NEBULA_SCALE*0.25
  static NEBULA_DELTA_ROTATION = (Math.PI*2.0)/64.0

  static zoomLevelDefinitions = {
    nebulas: 100,
    stars: 100,
  }

  constructor () {
    this.container = new PIXI.Container()
    this.starContainer = new PIXI.Container()
    this.zoomPercent = 0
    this.container.interactiveChildren = false
    this.starContainer.interactiveChildren = false
    this.time = 0
  }

  setup (game, userSettings) {
    this.game = game
    this.userSettings = userSettings
    this.rng = rng.create(game._id)
    this.galaxyCenterX = gameHelper.calculateGalaxyCenterX(game)
    this.galaxyCenterY = gameHelper.calculateGalaxyCenterY(game)
    this.clear()

    Background.zoomLevelDefinitions = userSettings.map.zoomLevels.background
    this.container.alpha = userSettings.map.background.nebulaOpacity
    this.starContainer.alpha = userSettings.map.background.starsOpacity

    this.moveNebulas = userSettings.map.background.moveNebulas == 'enabled'
    this.timeScale = (1.0/(2048.0*64.0)) * userSettings.map.background.nebulaMovementSpeed
    this.blendMode = userSettings.map.background.blendMode == 'ADD' ?
      PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL
  }

  clear () {
    this.container.removeChildren()
    this.starContainer.removeChildren()
  }

  draw () {
    this.clear()

    this.drawNebulas()
  }

  drawNebulas () {

    let NEBULA_FREQUENCY = this.userSettings.map.background.nebulaFrequency
    let NEBULA_DENSITY = this.userSettings.map.background.nebulaDensity
    let GENERATE_STARS = this.userSettings.map.background.backgroundStars == 'enabled'

    const FALLBACK_NEBULA_COLOR = 0xffffff

    let NEBULA_COLOUR1
    let NEBULA_COLOUR2
    let NEBULA_COLOUR3

    try {
      NEBULA_COLOUR1 = this._getNumberFromHexString(this.userSettings.map.background.nebulaColour1)
      NEBULA_COLOUR2 = this._getNumberFromHexString(this.userSettings.map.background.nebulaColour2)
      NEBULA_COLOUR3 = this._getNumberFromHexString(this.userSettings.map.background.nebulaColour3)
    }
    catch(err) {
      NEBULA_COLOUR1 = FALLBACK_NEBULA_COLOR
      NEBULA_COLOUR2 = FALLBACK_NEBULA_COLOR
      NEBULA_COLOUR3 = FALLBACK_NEBULA_COLOR
      console.error(err)
    }

    //divide the galaxy in chunks roughly the nebula size

    const CHUNK_SIZE = 512.0
    const MINIMUM_STARS = 2 //chunks must have these many stars to be elegible to host a nebula
    const NEBULA_MAX_OFFSET = CHUNK_SIZE/4.0

    let minX = gameHelper.calculateMinStarX(this.game)
    let minY = gameHelper.calculateMinStarY(this.game)
    let maxX = gameHelper.calculateMaxStarX(this.game)
    let maxY = gameHelper.calculateMaxStarY(this.game)

    let firstChunkX = Math.floor(minX/CHUNK_SIZE)
    let firstChunkY = Math.floor(minY/CHUNK_SIZE)
    let lastChunkX = Math.floor(maxX/CHUNK_SIZE)
    let lastChunkY = Math.floor(maxY/CHUNK_SIZE)

    let chunksXlen = (lastChunkX-firstChunkX)+1
    let chunksYlen = (lastChunkY-firstChunkY)+1

    let chunks = Array(chunksXlen)
    for(let x=0; x<chunksXlen; x+=1) {
      chunks[x] = Array(chunksYlen)
      for(let y=0; y<chunksYlen; y+=1) {
        chunks[x][y] = Array()
      }
    }

    //add locations to the chunks for quick lookup
    for(let star of this.game.galaxy.stars) {
      let cx = Math.floor(star.location.x/CHUNK_SIZE)-firstChunkX
      let cy = Math.floor(star.location.y/CHUNK_SIZE)-firstChunkY
      chunks[cx][cy].push(star.location)
    }

    //generate nebulas and starfields on the chunks
    //TODO use these chunks to implement viewport culling
    for( let x=0; x<chunksXlen; x+=1) {
      for( let y=0; y<chunksYlen; y+=1) {
        if(chunks[x][y].length > MINIMUM_STARS) {

          let i
          let texture
          let sprite
          let nebulaTextureCount
          let textures
          if(GENERATE_STARS) {
            nebulaTextureCount = TextureService.STARLESS_NEBULA_TEXTURES.length
            textures = TextureService.STARLESS_NEBULA_TEXTURES
          }
          else {
            nebulaTextureCount = TextureService.NEBULA_TEXTURES.length
            textures = TextureService.NEBULA_TEXTURES
          }

          if( Math.round(this.rng.random()*16) <= NEBULA_FREQUENCY ) {
            let nebulaCount = 0
            while(nebulaCount < NEBULA_DENSITY) {
              nebulaCount+=1
              if(NEBULA_DENSITY>2) { if(this.rng.random()<0.5) { continue; } }
              i = Math.round(this.rng.random()*(nebulaTextureCount-1))
              texture = textures[i]
              sprite = new PIXI.Sprite(texture)
              sprite.x = (x*CHUNK_SIZE) + (firstChunkX*CHUNK_SIZE) + (CHUNK_SIZE/2.0)
              sprite.x += NEBULA_MAX_OFFSET * Math.round( (this.rng.random()*2.0)-1.0 )
              sprite.y = (y*CHUNK_SIZE) + (firstChunkY*CHUNK_SIZE) + (CHUNK_SIZE/2.0)
              sprite.y += NEBULA_MAX_OFFSET * Math.round( (this.rng.random()*2.0)-1.0 )
              sprite.anchor.set(0.5)

              sprite.parallax = this.rng.random()*Background.MAX_PARALLAX
              sprite.blendMode = this.blendMode

              sprite.originX = sprite.x
              sprite.originY = sprite.y
              sprite.baseRotation = this.rng.random()*Math.PI*2.0
              sprite.baseRotationTime = this.rng.random()*Math.PI*2.0
              sprite.baseScaleTime = this.rng.random()*Math.PI*2.0

              if(GENERATE_STARS) {
                sprite.tint = NEBULA_COLOUR1
                if(this.rng.random()>(1.0/3.0)) { sprite.tint = NEBULA_COLOUR2 }
                if(this.rng.random()>(1.0/3.0*2.0)) { sprite.tint = NEBULA_COLOUR3 }
                sprite.scale.x = Background.NEBULA_SCALE
                sprite.scale.y = Background.NEBULA_SCALE
              }

              this.container.addChild(sprite)

              if(GENERATE_STARS) {
                let starCount = 0
                texture = TextureService.STAR_TEXTURE
                while(starCount < Background.STAR_DENSITY) {
                  starCount+=1
                  sprite = new PIXI.Sprite(texture)
                  sprite.x = (x*CHUNK_SIZE) + (firstChunkX*CHUNK_SIZE) + (CHUNK_SIZE*this.rng.random())
                  sprite.x += NEBULA_MAX_OFFSET * Math.round( (this.rng.random()*2.0)-1.0 )
                  sprite.y = (y*CHUNK_SIZE) + (firstChunkY*CHUNK_SIZE) + (CHUNK_SIZE*this.rng.random())
                  sprite.y += NEBULA_MAX_OFFSET * Math.round( (this.rng.random()*2.0)-1.0 )
                  sprite.anchor.set(0.5)

                  sprite.parallax = this.rng.random()*Background.MAX_PARALLAX
                  sprite.blendMode = this.blendMode

                  sprite.originX = sprite.x
                  sprite.originY = sprite.y

                  let inverseParallaxNormalized = 1.0-(sprite.parallax/Background.MAX_PARALLAX)
                  sprite.scale.x = ( (Background.STAR_SCALE) + (inverseParallaxNormalized*Background.STAR_SCALE) )/2.0
                  sprite.scale.y = ( (Background.STAR_SCALE) + (inverseParallaxNormalized*Background.STAR_SCALE) )/2.0

                  this.starContainer.addChild(sprite)
                }
              }

            }
          }
        }
      }
    }
  }

  refreshZoom (zoomPercent) {
    this.zoomPercent = zoomPercent

    if (this.container) {
      this.container.visible = zoomPercent > Background.zoomLevelDefinitions.nebulas
    }
    if (this.starContainer) {
      this.starContainer.visible = zoomPercent > Background.zoomLevelDefinitions.stars
    }
  }

  onTick (zoomPercent, deltaTime, viewportData) {
    this.refreshZoom(zoomPercent)
    this.time += deltaTime*1000
    let compressedTime = this.time*this.timeScale
    for (let i = 0; i < this.container.children.length; i++) {
      let child = this.container.children[i]
      let deltax = viewportData.center.x-child.originX
      let deltay = viewportData.center.y-child.originY

      child.x = child.originX + deltax * child.parallax
      child.y = child.originY + deltay * child.parallax

      if( this.moveNebulas ) { // TODO compare performance of this conditional branch with looping the child array twice
        child.scale.x = Background.NEBULA_SCALE + Math.sin(child.baseScaleTime+compressedTime)*Background.NEBULA_DELTA_SCALE
        child.rotation = child.baseRotation + Math.sin(child.baseRotationTime+compressedTime)*Background.NEBULA_DELTA_ROTATION
      }
    }

    for (let i = 0; i < this.starContainer.children.length; i++) {
      let child = this.starContainer.children[i]
      let deltax = viewportData.center.x-child.originX
      let deltay = viewportData.center.y-child.originY

      child.x = child.originX + deltax * child.parallax
      child.y = child.originY + deltay * child.parallax
    }
  }

  _getNumberFromHexString( colorString ) {
    let hexString = colorString.replace(/^#/, '')

    if( !(/^[0-9A-F]{6}$/i.test(hexString)) ) { throw new Error('Invalid Hex Color String') }

    let hex = parseInt(hexString, 16)

    return hex
  }
}

export default Background
