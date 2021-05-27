const bcrypt = require('bcrypt');

const GameModel = require('../models/Game');
const UserModel = require('../models/User');
const HistoryModel = require('../models/History');
const EventModel = require('../models/Event');
const GuildModel = require('../models/Guild');

const AdminService = require('../services/admin');
const PasswordService = require('../services/password');
const AuthService = require('../services/auth');
const BroadcastService = require('../services/broadcast');
const CarrierService = require('../services/carrier');
const CombatService = require('../services/combat');
const DistanceService = require('../services/distance');
const EmailService = require('../services/email');
const EventService = require('../services/event');
const LeaderboardService = require('../services/leaderboard');
const GameService = require('../services/game');
const GameCreateService = require('../services/gameCreate');
const GameGalaxyService = require('../services/gameGalaxy');
const GameListService = require('../services/gameList');
const GameTickService = require('../services/gameTick');
const MapService = require('../services/map');
const PlayerService = require('../services/player');
const RandomService = require('../services/random');
const ResearchService = require('../services/research');
const StarService = require('../services/star');
const StarDistanceService = require('../services/starDistance');
const NameService = require('../services/name');
const StarUpgradeService = require('../services/starUpgrade');
const TechnologyService = require('../services/technology');
const TradeService = require('../services/trade');
const WaypointService = require('../services/waypoint');
const ShipTransferService = require('../services/shipTransfer');
const UserService = require('../services/user');
const HistoryService = require('../services/history');
const LedgerService = require('../services/ledger');
const SpecialistService = require('../services/specialist');
const SpecialistHireService = require('../services/specialistHire');
const AchievementService = require('../services/achievement');
const ConversationService = require('../services/conversation');
const ReputationService = require('../services/reputation');
const AIService = require('../services/ai');
const AITradeService = require('../services/aiTrade');
const GuildService = require('../services/guild');
const GuildUserService = require('../services/guildUser');

const CircularMapService = require('../services/maps/circular');
const CircularBalancedMapService = require('../services/maps/circularBalanced');
const SpiralMapService = require('../services/maps/spiral');
const DoughnutMapService = require('../services/maps/doughnut');
const IrregularMapService = require('../services/maps/irregular');

const config = require('../config');
const gameNames = require('../config/game/gameNames');
const starNames = require('../config/game/starNames');

module.exports = (io) => {
    // Poor man's dependency injection.

    const passwordService = new PasswordService(bcrypt);
    
    const authService = new AuthService(UserModel, passwordService);
    const userService = new UserService(UserModel, passwordService);
    const adminService = new AdminService(UserModel, GameModel);

    const guildService = new GuildService(GuildModel, UserModel);
    const guildUserService = new GuildUserService(UserModel, guildService);

    const broadcastService = new BroadcastService(io);
    const distanceService = new DistanceService();
    const randomService = new RandomService();
    const gameListService = new GameListService(GameModel);
    const nameService = new NameService(gameNames, starNames, randomService);
    const starDistanceService = new StarDistanceService(distanceService);
    const achievementService = new AchievementService(UserModel);
    const specialistService = new SpecialistService();
    const technologyService = new TechnologyService(specialistService);
    const starService = new StarService(GameModel, randomService, nameService, distanceService, starDistanceService, technologyService, specialistService, userService);
    const carrierService = new CarrierService(GameModel, achievementService, distanceService, starService, technologyService, specialistService);
    const combatService = new CombatService(technologyService, specialistService);
    const circularMapService = new CircularMapService(randomService, starService, starDistanceService, distanceService);
    const circularBalancedMapService = new CircularBalancedMapService(randomService, starService, starDistanceService, distanceService);
    const spiralMapService = new SpiralMapService(randomService, starService, starDistanceService, distanceService);
    const doughnutMapService = new DoughnutMapService(randomService, starService, starDistanceService, distanceService);
    const irregularMapService = new IrregularMapService(randomService, starService, starDistanceService, distanceService);
    const mapService = new MapService(randomService, starService, starDistanceService, nameService, circularMapService, spiralMapService, doughnutMapService, circularBalancedMapService, irregularMapService);
    const playerService = new PlayerService(GameModel, randomService, mapService, starService, carrierService, starDistanceService, technologyService, specialistService);
    const ledgerService = new LedgerService(GameModel, playerService);
    const leaderboardService = new LeaderboardService(UserModel, userService, playerService, guildUserService);
    const gameService = new GameService(GameModel, userService, starService, carrierService, playerService, passwordService, achievementService);
    const researchService = new ResearchService(GameModel, technologyService, randomService, playerService, starService, userService);
    const reputationService = new ReputationService(GameModel, playerService);
    const tradeService = new TradeService(GameModel, userService, playerService, ledgerService, achievementService, reputationService, gameService);
    const waypointService = new WaypointService(GameModel, carrierService, starService, distanceService, starDistanceService, technologyService, gameService, playerService);
    const specialistHireService = new SpecialistHireService(GameModel, specialistService, achievementService, waypointService, playerService, starService);
    const conversationService = new ConversationService(GameModel, EventModel);
    const starUpgradeService = new StarUpgradeService(GameModel, starService, carrierService, achievementService, researchService, technologyService, playerService);
    const aiService = new AIService(starUpgradeService);
    const historyService = new HistoryService(HistoryModel, playerService, gameService);
    const gameCreateService = new GameCreateService(GameModel, gameListService, nameService, mapService, playerService, passwordService, conversationService, historyService);
    const gameGalaxyService = new GameGalaxyService(broadcastService, gameService, mapService, playerService, starService, distanceService, starDistanceService, starUpgradeService, carrierService, waypointService, researchService, specialistService, technologyService, reputationService, guildUserService, historyService);
    const emailService = new EmailService(config, gameService, userService, leaderboardService, playerService);
    const gameTickService = new GameTickService(distanceService, starService, carrierService, researchService, playerService, historyService, waypointService, combatService, leaderboardService, userService, gameService, technologyService, specialistService, starUpgradeService, reputationService, aiService, emailService);
    const shipTransferService = new ShipTransferService(GameModel, carrierService, starService);
    const aiTradeService = new AITradeService(reputationService, randomService, tradeService, gameService);
    
    const eventService = new EventService(EventModel, broadcastService, gameService, gameTickService, researchService, starService, starUpgradeService, tradeService,
        ledgerService, conversationService);

    return {
        adminService,
        passwordService,
        authService,
        broadcastService,
        carrierService,
        combatService,
        distanceService,
        emailService,
        eventService,
        leaderboardService,
        gameService,
        gameCreateService,
        gameGalaxyService,
        gameListService,
        gameTickService,
        guildService,
        guildUserService,
        mapService,
        playerService,
        randomService,
        researchService,
        starService,
        starDistanceService,
        nameService,
        starUpgradeService,
        technologyService,
        tradeService,
        userService,
        waypointService,
        shipTransferService,
        historyService,
        ledgerService,
        specialistService,
        specialistHireService,
        achievementService,
        conversationService,
        reputationService,
        aiService,
        aiTradeService,
    };
};
