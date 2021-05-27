const cache = require('memory-cache');
const ValidationError = require('../errors/validation');

module.exports = class GameGalaxyService {

    constructor(broadcastService, gameService, mapService, playerService, starService, distanceService, 
        starDistanceService, starUpgradeService, carrierService, 
        waypointService, researchService, specialistService, technologyService, reputationService,
        guildUserService, historyService) {
        this.broadcastService = broadcastService;
        this.gameService = gameService;
        this.mapService = mapService;
        this.playerService = playerService;
        this.starService = starService;
        this.distanceService = distanceService;
        this.starDistanceService = starDistanceService;
        this.starUpgradeService = starUpgradeService;
        this.carrierService = carrierService;
        this.waypointService = waypointService;
        this.researchService = researchService;
        this.specialistService = specialistService;
        this.technologyService = technologyService;
        this.reputationService = reputationService;
        this.guildUserService = guildUserService;
        this.historyService = historyService;
    }

    async getGalaxy(gameId, userId, tick) {
        // Try loading the game for the user from the cache for historical ticks.
        let gameStateTick = await this.gameService.getGameStateTick(gameId);

        let isHistorical = tick != null && tick !== gameStateTick; // Indicates whether we are requesting a specific tick and not the CURRENT state of the galaxy.

        let cached;

        if (!isHistorical) {
            tick = gameStateTick;
        } else {
            cached = this._getCachedGalaxy(gameId, userId, tick, gameStateTick);

            if (cached && cached.galaxy) {
                return cached.galaxy;
            }
        }

        let game = await this.gameService.getByIdGalaxyLean(gameId);

        if (isHistorical && game.settings.general.timeMachine === 'disabled') {
            throw new ValidationError(`The time machine is disabled in this game.`);
        }

        // Check if the user is playing in this game.
        let player = this._getUserPlayer(game, userId);
        
        // Remove who created the game.
        delete game.settings.general.createdByUserId;
        delete game.settings.general.password; // Don't really need to explain why this is removed.

        await this._maskGalaxy(game, player, isHistorical, tick);

        // Append the player stats to each player.
        this._setPlayerStats(game);

        // if the user isn't playing this game, then only return
        // basic data about the stars, exclude any important info like garrisons.
        // If the game has finished then everyone should be able to view the full game.
        if (!player && !this.gameService.isFinished(game)) {
            this._setStarInfoBasic(game);

            // Also remove all carriers from players.
            this._clearPlayerCarriers(game);

            // We still need to filter the player data so that it's basic info.
            await this._setPlayerInfoBasic(game, null);
        } else {
            // Populate the rest of the details about stars,
            // carriers and players providing that they are in scanning range.
            this._setCarrierInfoDetailed(game, player);
            this._setStarInfoDetailed(game, player);
            await this._setPlayerInfoBasic(game, player);
        }

        // For extra dark mode games, overwrite the player stats as by this stage
        // scanning range will have kicked in and filtered out stars and carriers the player
        // can't see and therefore global stats should display what the current player can see
        // instead of their actual values.
        // TODO: Better to not overwrite, but just not do it above in the first place.
        if (this.gameService.isDarkModeExtra(game)) {
            this._setPlayerStats(game);
        }

        if (isHistorical && cached) {
            cache.put(cached.cacheKey, game, 1200000); // 20 minutes.
        }

        this._topSecretFeature(game);
        
        return game;
    }

    _getCachedGalaxy(gameId, userId, requestedTick, currentTick) {
        // Note: As we are only logging the last 24 ticks we can safely cache everything.
        // Otherwise we'll need to add in some logic to limit how far back we cache.
        
        // if (currentTick - requestedTick > 24) {
        //     return {
        //         cacheKey: null,
        //         galaxy: null
        //     };
        // }

        if (!userId) {
            return null;
        }

        let cacheKey = `galaxy_${gameId}_${userId}_${requestedTick}`;
        let galaxy = null;

        let cached = cache.get(cacheKey);

        if (cached) {
            galaxy = cached;
        }

        return {
            cacheKey,
            galaxy
        };
    }

    _getUserPlayer(doc, userId) {
        if (!userId) {
            return null;
        }
        
        return doc.galaxy.players.find(x => x.userId === userId.toString());
    }

    _setPlayerStats(doc) {
        // Get all of the player's statistics.
        doc.galaxy.players.forEach(p => {
            p.stats = this.playerService.getStats(doc, p);
        });
    }

    _setStarInfoBasic(doc) {
        // Work out whether we are in dark galaxy mode.
        // This is true if the dark galaxy setting is enabled,
        // OR if its "start only" and the game has not yet started.
        const isDarkStart = this.gameService.isDarkStart(doc);
        const isDarkMode = this.gameService.isDarkMode(doc);

        // If its a dark galaxy start then return no stars.
        if (isDarkMode || (isDarkStart && !doc.state.startDate)) {
            doc.galaxy.stars = [];
        }

        doc.galaxy.stars = doc.galaxy.stars
        .map(s => {
            return {
                _id: s._id,
                name: s.name,
                ownedByPlayerId: s.ownedByPlayerId,
                location: s.location,
                warpGate: false
            }
        });
    }

    _setStarInfoDetailed(doc, player) { 
        const isFinished = this.gameService.isFinished(doc);
        const isDarkStart = this.gameService.isDarkStart(doc);
        const isDarkMode = this.gameService.isDarkMode(doc);

        // If dark start and game hasn't started yet OR is dark mode, then filter out
        // any stars the player cannot see in scanning range.
        if (!isFinished && (isDarkMode || (isDarkStart && !doc.state.startDate))) {
            if (isDarkMode) {
                doc.galaxy.stars = this.starService.filterStarsByScanningRangeAndWaypointDestinations(doc, player);
            } else {
                doc.galaxy.stars = this.starService.filterStarsByScanningRange(doc, player);
            }
        }

        // Get all of the player's stars.
        let playerStars = [];

        if (player) {
            playerStars = this.starService.listStarsOwnedByPlayer(doc.galaxy.stars, player._id);
        }

        // Work out which ones are not in scanning range and clear their data.
        doc.galaxy.stars = doc.galaxy.stars
        .map(s => {
            delete s.garrisonActual; // Don't need to send this back.

            // Calculate the star's terraformed resources.
            if (s.ownedByPlayerId) {
                let owningPlayerEffectiveTechs = this.technologyService.getStarEffectiveTechnologyLevels(doc, s);

                s.terraformedResources = this.starService.calculateTerraformedResources(s.naturalResources, owningPlayerEffectiveTechs.terraforming);
            }

            // Ignore stars the player owns, they will always be visible.
            let isOwnedByCurrentPlayer = playerStars.find(y => y._id.equals(s._id));

            if (isOwnedByCurrentPlayer) {
                // Calculate infrastructure upgrades for the star.
                this.starUpgradeService.setUpgradeCosts(doc, s);
                
                if (s.specialistId) {
                    s.specialist = this.specialistService.getByIdStar(s.specialistId);
                }

                s.ignoreBulkUpgrade = s.ignoreBulkUpgrade || false; // TODO: For some reason this isn't being set in the mongoose defaults?

                return s;
            } else {
                // Remove fields that the user player shouldn't see.
                delete s.ignoreBulkUpgrade;
            }

            // Get the closest player star to this star.
            let inRange = isFinished || this.starService.isStarInScanningRangeOfPlayer(doc, s, player);

            // If its in range then its all good, send the star back as is.
            // Otherwise only return a subset of the data.
            if (inRange) {
                if (s.specialistId) {
                    s.specialist = this.specialistService.getByIdStar(s.specialistId);
                }
                
                let canSeeStarGarrison = isFinished || (player && this.starService.canPlayerSeeStarGarrison(player, s));

                if (!canSeeStarGarrison) {
                    s.garrison = null;
                }

                return s;
            } else {
                return {
                    _id: s._id,
                    name: s.name,
                    ownedByPlayerId: s.ownedByPlayerId,
                    location: s.location,
                    warpGate: false // Hide warp gates outside of scanning range.
                }
            }
        });
    }
        
    _setCarrierInfoDetailed(doc, player) {
        // If the game hasn't finished we need to filter and sanitize carriers.
        if (!this.gameService.isFinished(doc)) {
            doc.galaxy.carriers = this.carrierService.filterCarriersByScanningRange(doc, player);
        
            // Remove all waypoints (except those in transit) for all carriers that do not belong
            // to the player.
            doc.galaxy.carriers = this.carrierService.sanitizeCarriersByPlayer(doc, player);
        }

        // Populate the number of ticks it will take for all waypoints.
        doc.galaxy.carriers
            .forEach(c => {
                this.waypointService.populateCarrierWaypointEta(doc, c);
                
                if (c.specialistId) {
                    c.specialist = this.specialistService.getByIdCarrier(c.specialistId)
                }

                if (player && !this.carrierService.canPlayerSeeCarrierShips(player, c)) {
                    c.ships = null;
                }
            });
    }

    async _setPlayerInfoBasic(doc, player) {
        const isFinished = this.gameService.isFinished(doc);
        const isDarkModeExtra = this.gameService.isDarkModeExtra(doc);

        let onlinePlayers = this.broadcastService.getOnlinePlayers(doc); // Need this for later.

        // Get the list of all guilds associated to players, we'll need this later.
        let guildUsers = [];

        if (doc.settings.general.anonymity === 'normal') {
            let userIds = doc.galaxy.players.filter(x => x.userId).map(x => x.userId);
            guildUsers = await this.guildUserService.listUsersWithGuildTags(userIds)
        }

        // Calculate which players are in scanning range.
        let playersInRange = [];
        
        if (player) {
            playersInRange = this.playerService.getPlayersWithinScanningRangeOfPlayer(doc, doc.galaxy.players, player);
        }

        let displayOnlineStatus = doc.settings.general.playerOnlineStatus === 'visible';

        this._populatePlayerHasDuplicateIPs(doc);
        
        // Sanitize other players by only returning basic info about them.
        // We don't want players snooping on others via api responses containing sensitive info.
        doc.galaxy.players = doc.galaxy.players.map(p => {
            let isCurrentUserPlayer = player && p._id.equals(player._id);

            // Append the guild tag to the player alias.
            let playerGuild = null;

            if (p.userId) {
                let guildUser = guildUsers.find(u => u._id.toString() === p.userId.toString());

                if (guildUser) {
                    playerGuild = guildUser.guild;
    
                    if (playerGuild) {
                        p.alias += `[${playerGuild.tag}]`;
                    }
                }
            }

            p.isInScanningRange = playersInRange.find(x => x._id.equals(p._id)) != null;
            p.shape = p.shape || 'circle'; // TODO: I don't know why the shape isn't being returned by mongoose defaults.

            // If the user is in the game and it is the current
            // player we are looking at then return everything.
            if (isCurrentUserPlayer) {
                player.currentResearchTicksEta = this.researchService.calculateCurrentResearchETAInTicks(doc, player);

                delete p.notes; // Don't need to send this back.
                delete p.lastSeenIP; // Super sensitive data.

                return p;
            }

            // NOTE: From this point onwards, the player is NOT the current user.

            if (!displayOnlineStatus) {
                p.lastSeen = null;
                p.isOnline = null;
            } else {
                // Work out whether the player is online.
                p.isOnline = isCurrentUserPlayer || onlinePlayers.find(op => op._id.equals(p._id)) != null;
            }

            let reputation = null;

            if (player) {
                reputation = this.reputationService.getReputation(p, player);
            }

            let research = this._maskPlayerResearch(p, isFinished, isDarkModeExtra);

            // Return a subset of the user, key info only.
            return {
                _id: p._id,
                homeStarId: p.homeStarId,
                colour: p.colour,
                shape: p.shape,
                research,
                isEmptySlot: p.userId == null, // Do not send the user ID back to the client.
                isInScanningRange: p.isInScanningRange,
                defeated: p.defeated,
                afk: p.afk,
                ready: p.ready,
                alias: p.alias,
                avatar: p.avatar,
                stats: p.stats,
                reputation,
                lastSeen: p.lastSeen,
                isOnline: p.isOnline,
                guild: playerGuild,
                hasDuplicateIP: p.hasDuplicateIP
            };
        });
    }

    _populatePlayerHasDuplicateIPs(game) {
        for (let player of game.galaxy.players) {
            player.hasDuplicateIP = this.playerService.hasDuplicateLastSeenIP(game, player);
        }
    }

    _hasGameStarted(doc) {
        return doc.state.startDate != null;
    }

    _clearPlayerCarriers(doc) {
        doc.galaxy.carriers = [];
    }

    _maskPlayerResearch(player, isFinished, isDarkModeExtra) {
        let research = {
            scanning: { 
                level: player.research.scanning.level
            },
            hyperspace: { 
                level: player.research.hyperspace.level
            },
            terraforming: { 
                level: player.research.terraforming.level
            },
            experimentation: { 
                level: player.research.experimentation.level
            },
            weapons: { 
                level: player.research.weapons.level
            },
            banking: { 
                level: player.research.banking.level
            },
            manufacturing: { 
                level: player.research.manufacturing.level
            },
            specialists: { 
                level: player.research.specialists.level
            }
        };

        // In ultra dark mode games, research is visible 
        // only to players who are within scanning range.
        if (!isFinished && isDarkModeExtra) {
            if (player.isInScanningRange) {
                research = {
                    weapons: { 
                        level: player.research.weapons.level
                    }
                };
            }
            else {
                research = null;
            }
        }

        return research;
    }

    async _maskGalaxy(game, player, isHistorical, tick) {
        /*
            Masking of galaxy data occurs here, it prevent players from seeing what other
            players are doing until the tick has finished.

            This will be a combination of the current state of the galaxy for the player and
            the previous tick's galaxy data for other players.

            The following logic will be applied to the galaxy:
            1. Apply previous tick's data to all STARS the player does not own.
                - Garrison, specialist, warp gate and infrastructure needs to be reset.
            2. Apply previous tick's data to all CARRIERS the player does not own.
                - Remove any carriers that exist in the current tick but not in the previous tick.
                - Ships, specialist and gift status needs to be reset.
            3. Continue to run through current logic as we do today.
        */

        if (!this.gameService.isStarted(game) || tick === 0) {
            return;
        }

        let history = await this.historyService.getHistoryByTick(game._id, tick);

        if (!history) {
            return;
        }

        // Support for legacy games, not all history for players/stars/carriers have been logged so
        // bomb out if we're missing any of those.
        if (!history.players.length || !history.stars.length || !history.carriers.length) {
            return;
        }

        // If in historical mode, apply the previous tick's data for all players.
        // If the user is requesting the current tick then we need to ensure that the
        // data returned for players is based on the current state of the game because
        // players can be defeated, afk'd, ready etc. Player data does not need to be
        // masked if requesting the current tick.
        if (isHistorical) {
            for (let i = 0; i < game.galaxy.players.length; i++) {
                let gamePlayer = game.galaxy.players[i];
                
                let historyPlayer = history.players.find(x => x.playerId.equals(gamePlayer._id));

                if (historyPlayer) {
                    gamePlayer.userId = historyPlayer.userId;
                    gamePlayer.alias = historyPlayer.alias;
                    gamePlayer.avatar = historyPlayer.avatar;
                    gamePlayer.researchingNow = historyPlayer.researchingNow;
                    gamePlayer.researchingNext = historyPlayer.researchingNext;
                    gamePlayer.credits = historyPlayer.credits;
                    gamePlayer.creditsSpecialists = historyPlayer.creditsSpecialists;
                    gamePlayer.defeated = historyPlayer.defeated;
                    gamePlayer.afk = historyPlayer.afk;
                    gamePlayer.research = historyPlayer.research;
                    gamePlayer.ready = historyPlayer.ready;
                }
            }
        }
        
        // Apply previous tick's data to all STARS the player does not own.
        // If historical mode, then its all star data in the requested tick.
        // If not historical mode, then replace non-player owned star data.
        for (let i = 0; i < game.galaxy.stars.length; i++) {
            let gameStar = game.galaxy.stars[i];
            
            if (!isHistorical && player && gameStar.ownedByPlayerId && gameStar.ownedByPlayerId.equals(player._id)) {
                continue;
            }
            
            let historyStar = history.stars.find(x => x.starId.equals(gameStar._id));

            if (historyStar) {
                // If the player has abandoned the star in the current tick, then display that representation of the star
                // instead of the historical version.
                if (player && historyStar.ownedByPlayerId && gameStar.ownedByPlayerId == null && historyStar.ownedByPlayerId.equals(player._id)) {
                    continue;
                }

                gameStar.ownedByPlayerId = historyStar.ownedByPlayerId;
                gameStar.naturalResources = historyStar.naturalResources;
                gameStar.garrison = historyStar.garrison;
                gameStar.garrisonActual = historyStar.garrisonActual;
                gameStar.specialistId = historyStar.specialistId;
                gameStar.warpGate = historyStar.warpGate;
                gameStar.ignoreBulkUpgrade = historyStar.ignoreBulkUpgrade;
                gameStar.infrastructure = historyStar.infrastructure;
            }
        }

        // Apply previous tick's data to all CARRIERS the player does not own.
        // If historical mode, then its all carrier data in the requested tick.
        // If not historical mode, then replace non-player owned carrier data.
        for (let i = 0; i < game.galaxy.carriers.length; i++) {
            let gameCarrier = game.galaxy.carriers[i];

            if (!isHistorical && player && gameCarrier.ownedByPlayerId.equals(player._id)) {
                continue;
            }

            let historyCarrier = history.carriers.find(x => x.carrierId.equals(gameCarrier._id));

            // Remove any carriers that exist in the current tick but not in the previous tick.
            if (!historyCarrier) {
                game.galaxy.carriers.splice(i, 1);
                i--;
                continue;
            }
            
            gameCarrier.ownedByPlayerId = historyCarrier.ownedByPlayerId;
            gameCarrier.name = historyCarrier.name;
            gameCarrier.orbiting = historyCarrier.orbiting;
            gameCarrier.ships = historyCarrier.ships;
            gameCarrier.specialistId = historyCarrier.specialistId;
            gameCarrier.isGift = historyCarrier.isGift;
            gameCarrier.location = historyCarrier.location;
            gameCarrier.waypoints = historyCarrier.waypoints;
        }

        // Add any carriers that were in the previous tick that do not exist in the current tick
        // This is only applicable when requesting a historical tick as the current tick may have
        // destroyed carriers.
        if (isHistorical) {
            for (let historyCarrier of history.carriers) {
                let gameCarrier = game.galaxy.carriers.find(x => x._id.equals(historyCarrier.carrierId));
    
                if (!gameCarrier) {
                    game.galaxy.carriers.push(historyCarrier);
                }
            }
        }

        // If the user is requesting a specific tick then we also need to update the game state to match
        if (isHistorical) {
            game.state.tick = history.tick
            game.state.productionTick = history.productionTick
        }
    }

    _topSecretFeature(game) {
        if (false) {
            return;
        }

        let rnd = Math.floor(Math.random() * 100);

        if (rnd === 0) {
            let shapes = ['circle', 'square', 'diamond', 'hexagon'];
            let colours = require('../config/game/colours.json');
    
            for (let player of game.galaxy.players) {
                player.shape = shapes[Math.floor(Math.random() * shapes.length)];
                player.colour = colours[Math.floor(Math.random() * colours.length)];
            }
        }
    }

};
