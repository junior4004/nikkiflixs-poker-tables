// Game.js - Texas Hold'em game state machine

import { Deck } from './Deck.js';
import { evaluateHand } from './HandEvaluator.js';
import { delay } from './utils.js';

export const GAME_PHASES = {
    WAITING: 'waiting',
    PRE_FLOP: 'pre_flop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown'
};

export class Game {
    /**
     * @param {object} options 
     * @param {number} options.smallBlind - Small blind amount
     * @param {number} options.bigBlind - Big blind amount
     * @param {function} options.onStateChange - Callback when state changes
     * @param {function} options.onPlayerAction - Callback when a player acts
     * @param {function} options.onShowdown - Callback for showdown
     */
    constructor(options = {}) {
        this.smallBlind = options.smallBlind || 10;
        this.bigBlind = options.bigBlind || 20;
        this.onStateChange = options.onStateChange || (() => { });
        this.onPlayerAction = options.onPlayerAction || (() => { });
        this.onShowdown = options.onShowdown || (() => { });

        this.players = [];
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.currentBet = 0;
        this.phase = GAME_PHASES.WAITING;
        this.dealerIndex = 0;
        this.sbIndex = -1;
        this.bbIndex = -1;
        this.activePlayerIndex = 0;
        this.minRaise = this.bigBlind;
        this.lastRaiseAmount = this.bigBlind;
        this.handNumber = 0;
        this.showdownResults = null; // Stores results for display

        // For animations
        this.animationDelay = 500;

        // Prevent concurrent AI processing
        this.isProcessingAI = false;
    }

    /**
     * Add a player to the game.
     * @param {Player} player 
     */
    addPlayer(player) {
        player.seatIndex = this.players.length;
        this.players.push(player);
    }

    /**
     * Remove a player from the game.
     * @param {string} playerId 
     */
    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.players.forEach((p, i) => p.seatIndex = i);
    }

    /**
     * Get active players (not folded, have chips or all-in).
     */
    get activePlayers() {
        return this.players.filter(p => p.isActive);
    }

    /**
     * Get players who can still act (not folded, not all-in).
     */
    get actingPlayers() {
        return this.players.filter(p => p.canAct);
    }

    /**
     * Get current player to act.
     */
    get currentPlayer() {
        return this.players[this.activePlayerIndex];
    }

    /**
     * Start a new hand.
     */
    async startHand() {
        // Get players with chips
        const playersWithChips = this.players.filter(p => p.chips > 0);

        if (playersWithChips.length < 2) {
            console.log('Game over - not enough players with chips');
            return;
        }

        this.handNumber++;

        // Reset state
        this.deck.reset();
        this.communityCards = [];
        this.pot = 0;
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        this.lastRaiseAmount = this.bigBlind;
        this.showdownResults = null; // Clear previous showdown

        // Reset players
        this.players.forEach(p => p.resetForNewHand());

        // Move dealer button to next player WITH chips
        let nextDealer = (this.dealerIndex + 1) % this.players.length;
        let attempts = 0;
        while (this.players[nextDealer].chips <= 0 && attempts < this.players.length) {
            nextDealer = (nextDealer + 1) % this.players.length;
            attempts++;
        }
        this.dealerIndex = nextDealer;
        this.players.forEach((p, i) => p.isDealer = i === this.dealerIndex);

        // Post blinds
        await this.postBlinds();

        // Deal hole cards only to players with chips
        await this.dealHoleCards();

        // Start pre-flop betting
        this.phase = GAME_PHASES.PRE_FLOP;

        // First to act is after big blind (skipping eliminated players)
        this.activePlayerIndex = this.findNextActivePlayer(this.bbIndex);

        // Special case for heads-up (2 players with chips)
        if (playersWithChips.length === 2) {
            // Heads-up: dealer (SB) acts first pre-flop
            this.activePlayerIndex = this.dealerIndex;
        }

        this.emitStateChange();

        // If current player is AI, trigger their action
        await this.checkForAIAction();
    }

    /**
     * Find next player who can act (has chips, not folded, not all-in).
     */
    findNextActivePlayer(fromIndex) {
        let nextIndex = (fromIndex + 1) % this.players.length;
        let attempts = 0;

        while (attempts < this.players.length) {
            const player = this.players[nextIndex];
            if (player.chips > 0 && !player.hasFolded && !player.isAllIn) {
                return nextIndex;
            }
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }

        return fromIndex; // Fallback
    }

    /**
     * Post blinds.
     */
    async postBlinds() {
        const playersWithChips = this.players.filter(p => p.chips > 0);

        // Calculate blind positions - only among players with chips
        if (playersWithChips.length === 2) {
            // Heads-up: dealer is small blind
            this.sbIndex = this.dealerIndex;
            this.bbIndex = this.findNextPlayerWithChips(this.dealerIndex);
        } else {
            this.sbIndex = this.findNextPlayerWithChips(this.dealerIndex);
            this.bbIndex = this.findNextPlayerWithChips(this.sbIndex);
        }

        const sbPlayer = this.players[this.sbIndex];
        const bbPlayer = this.players[this.bbIndex];

        const sbAmount = sbPlayer.bet(this.smallBlind);
        this.pot += sbAmount;

        const bbAmount = bbPlayer.bet(this.bigBlind);
        this.pot += bbAmount;
        this.currentBet = this.bigBlind;

        // Reset hasActed - blinds are forced bets, not voluntary actions
        // Players still need to act when it's their turn
        sbPlayer.hasActed = false;
        bbPlayer.hasActed = false;

        this.onPlayerAction({ player: sbPlayer, action: 'small_blind', amount: sbAmount });
        this.onPlayerAction({ player: bbPlayer, action: 'big_blind', amount: bbAmount });
    }

    /**
     * Find next player index with chips (starting from given index).
     */
    findNextPlayerWithChips(fromIndex) {
        let nextIndex = (fromIndex + 1) % this.players.length;
        let attempts = 0;

        while (this.players[nextIndex].chips <= 0 && attempts < this.players.length) {
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }

        return nextIndex;
    }

    /**
     * Deal hole cards to all players with chips.
     */
    async dealHoleCards() {
        for (const player of this.players) {
            // Only deal to players with chips
            if (player.chips > 0) {
                const cards = this.deck.drawMultiple(2);
                player.receiveCards(cards);
                await delay(this.animationDelay / 2);
            }
        }
    }

    /**
     * Deal community cards.
     * @param {number} count 
     */
    async dealCommunityCards(count) {
        // Burn a card
        this.deck.draw();

        for (let i = 0; i < count; i++) {
            const card = this.deck.draw();
            this.communityCards.push(card);
            await delay(this.animationDelay / 2);
        }

        this.emitStateChange();
    }

    /**
     * Handle a player action.
     * @param {string} playerId 
     * @param {'fold' | 'check' | 'call' | 'raise'} action 
     * @param {number} amount - For raise, the total bet amount
     */
    async handleAction(playerId, action, amount = 0) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || player.id !== this.currentPlayer.id) {
            console.error('Not this player\'s turn');
            return false;
        }

        if (player.hasFolded || player.isAllIn) {
            console.error('Player cannot act');
            // Force advance if player somehow can't act
            player.hasActed = true;
            await this.advanceToNextPlayer();
            return true;
        }

        const toCall = this.currentBet - player.currentBet;

        switch (action) {
            case 'fold':
                player.fold();
                this.onPlayerAction({ player, action: 'fold' });
                break;

            case 'check':
                if (toCall > 0) {
                    console.warn('Cannot check with bet to call, falling back to call');
                    // Fall back to call instead of failing
                    const callAmount = player.bet(toCall);
                    this.pot += callAmount;
                    this.onPlayerAction({ player, action: 'call', amount: callAmount });
                } else {
                    player.check();
                    this.onPlayerAction({ player, action: 'check' });
                }
                break;

            case 'call':
                if (toCall <= 0) {
                    // Nothing to call, just check
                    player.check();
                    this.onPlayerAction({ player, action: 'check' });
                } else {
                    const callAmount = player.bet(toCall);
                    this.pot += callAmount;
                    this.onPlayerAction({ player, action: 'call', amount: callAmount });
                }
                break;

            case 'raise':
                let raiseTotal = amount;
                const minRequired = this.currentBet + this.minRaise;

                // If raise amount is invalid, adjust it
                if (raiseTotal < minRequired) {
                    console.warn(`Raise ${raiseTotal} below minimum ${minRequired}, adjusting`);
                    raiseTotal = minRequired;
                }

                // Cap at player's max (all-in)
                const maxBet = player.chips + player.currentBet;
                if (raiseTotal > maxBet) {
                    raiseTotal = maxBet;
                }

                const raiseAmount = raiseTotal - player.currentBet;

                // If player can't afford even minimum raise, just call
                if (raiseAmount <= 0 || player.chips < raiseAmount) {
                    if (toCall > 0) {
                        const callAmount = player.bet(Math.min(toCall, player.chips));
                        this.pot += callAmount;
                        this.onPlayerAction({ player, action: 'call', amount: callAmount });
                    } else {
                        player.check();
                        this.onPlayerAction({ player, action: 'check' });
                    }
                    break;
                }

                const actualBet = player.bet(raiseAmount);
                this.pot += actualBet;

                // Update current bet and min raise if this was a valid raise
                if (player.currentBet > this.currentBet) {
                    this.lastRaiseAmount = player.currentBet - this.currentBet;
                    this.minRaise = Math.max(this.bigBlind, this.lastRaiseAmount);
                    this.currentBet = player.currentBet;

                    // Reset hasActed for all other players who can still act
                    this.players.forEach(p => {
                        if (p.id !== player.id && p.canAct) {
                            p.hasActed = false;
                        }
                    });
                }

                this.onPlayerAction({ player, action: 'raise', amount: actualBet });
                break;

            default:
                console.error('Unknown action:', action, '- folding instead');
                player.fold();
                this.onPlayerAction({ player, action: 'fold' });
                break;
        }

        // Check for hand over
        if (this.activePlayers.length === 1) {
            await this.awardPot(this.activePlayers[0]);
            return true;
        }

        // Move to next player
        await this.advanceToNextPlayer();

        return true;
    }

    /**
     * Advance to the next player or phase.
     */
    async advanceToNextPlayer() {
        // Check if betting round is complete
        if (this.isBettingRoundComplete()) {
            console.log('advanceToNextPlayer: betting round complete, calling advancePhase');
            await this.advancePhase();
            return;
        }

        // Find next player who needs to act
        let nextIndex = (this.activePlayerIndex + 1) % this.players.length;
        let attempts = 0;

        while (attempts < this.players.length) {
            const player = this.players[nextIndex];

            // Player needs to act if:
            // - Has chips (not eliminated)
            // - Not folded
            // - Not all-in  
            // - Either hasn't acted OR has a bet to match
            const needsToAct = player.chips > 0 &&
                !player.hasFolded &&
                !player.isAllIn &&
                (!player.hasActed || player.currentBet < this.currentBet);

            if (needsToAct) {
                this.activePlayerIndex = nextIndex;
                this.emitStateChange();
                await this.checkForAIAction();
                return;
            }

            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }

        // No one needs to act - advance phase
        await this.advancePhase();
    }

    /**
     * Check if the betting round is complete.
     */
    isBettingRoundComplete() {
        const activePlayers = this.players.filter(p => !p.hasFolded && (p.chips > 0 || p.isAllIn));

        console.log('isBettingRoundComplete check:', {
            currentBet: this.currentBet,
            activePlayers: activePlayers.map(p => ({
                name: p.name,
                chips: p.chips,
                currentBet: p.currentBet,
                hasActed: p.hasActed,
                isAllIn: p.isAllIn
            }))
        });

        // Only one player left - hand is over
        if (activePlayers.length <= 1) {
            console.log('isBettingRoundComplete: true (only 1 player left)');
            return true;
        }

        // Check if all active players have either:
        // 1. Acted and matched the current bet, OR
        // 2. Are all-in
        for (const player of activePlayers) {
            if (player.isAllIn) {
                continue; // All-in players don't need to act further
            }

            if (!player.hasActed) {
                console.log(`isBettingRoundComplete: false (${player.name} hasn't acted)`);
                return false; // Someone hasn't acted yet
            }

            if (player.currentBet < this.currentBet) {
                console.log(`isBettingRoundComplete: false (${player.name} bet ${player.currentBet} < current ${this.currentBet})`);
                return false; // Someone hasn't matched the bet
            }
        }

        console.log('isBettingRoundComplete: true');
        return true;
    }

    /**
     * Advance to the next betting phase.
     */
    async advancePhase() {
        console.log('advancePhase: entering, current phase:', this.phase);
        // Collect bets to pot and reset for new round
        this.players.forEach(p => p.resetForNewRound());
        this.currentBet = 0;
        this.minRaise = this.bigBlind;

        switch (this.phase) {
            case GAME_PHASES.PRE_FLOP:
                this.phase = GAME_PHASES.FLOP;
                await this.dealCommunityCards(3);
                break;
            case GAME_PHASES.FLOP:
                this.phase = GAME_PHASES.TURN;
                await this.dealCommunityCards(1);
                break;
            case GAME_PHASES.TURN:
                this.phase = GAME_PHASES.RIVER;
                await this.dealCommunityCards(1);
                break;
            case GAME_PHASES.RIVER:
                await this.showdown();
                return;
        }

        this.emitStateChange();

        // Check if only one or zero players can act (rest are all-in or folded)
        const playersWhoCanAct = this.players.filter(p => !p.hasFolded && !p.isAllIn && p.chips > 0);

        if (playersWhoCanAct.length <= 1) {
            // Run out remaining cards automatically (without recursion)
            while (this.communityCards.length < 5) {
                await delay(this.animationDelay);

                // Reset for new betting round
                this.players.forEach(p => p.resetForNewRound());
                this.currentBet = 0;

                // Deal next card(s)
                if (this.communityCards.length === 0) {
                    this.phase = GAME_PHASES.FLOP;
                    await this.dealCommunityCards(3);
                } else if (this.communityCards.length === 3) {
                    this.phase = GAME_PHASES.TURN;
                    await this.dealCommunityCards(1);
                } else if (this.communityCards.length === 4) {
                    this.phase = GAME_PHASES.RIVER;
                    await this.dealCommunityCards(1);
                }

                this.emitStateChange();
            }

            // Go directly to showdown
            await delay(this.animationDelay);
            await this.showdown();
            return;
        }

        // Find first active player after dealer who can act
        let startIndex = (this.dealerIndex + 1) % this.players.length;
        let attempts = 0;
        while ((this.players[startIndex].hasFolded || this.players[startIndex].isAllIn || this.players[startIndex].chips <= 0) && attempts < this.players.length) {
            startIndex = (startIndex + 1) % this.players.length;
            attempts++;
        }
        this.activePlayerIndex = startIndex;

        const activePlayer = this.players[this.activePlayerIndex];
        console.log('advancePhase: set active player to', activePlayer.name, 'isAI:', activePlayer.isAI);

        this.emitStateChange();
        await this.checkForAIAction();
    }

    /**
     * Handle showdown - determine winner(s).
     */
    async showdown() {
        this.phase = GAME_PHASES.SHOWDOWN;

        const contenders = this.activePlayers;

        if (contenders.length === 1) {
            await this.awardPot(contenders[0]);
            return;
        }

        // Evaluate all hands
        const results = contenders.map(player => {
            const allCards = [...player.holeCards, ...this.communityCards];
            const evaluation = evaluateHand(allCards);
            return {
                player,
                playerId: player.id,
                playerName: player.name,
                holeCards: player.holeCards, // Store for reveal
                evaluation,
                handName: evaluation.name,
                score: evaluation.score
            };
        });

        // Sort by score (highest first)
        results.sort((a, b) => b.score - a.score);

        // Find winner(s) - could be a tie
        const winningScore = results[0].score;
        const winners = results.filter(r => r.score === winningScore);

        // Split pot among winners (distribute odd chips one at a time)
        const baseWin = Math.floor(this.pot / winners.length);
        const remainder = this.pot % winners.length;
        winners.forEach((winner, i) => {
            winner.player.winChips(baseWin + (i < remainder ? 1 : 0));
            winner.isWinner = true;
        });
        const winAmount = baseWin;

        // Store showdown results for UI display
        this.showdownResults = {
            results: results.map(r => ({
                playerId: r.playerId,
                playerName: r.playerName,
                holeCards: r.holeCards,
                handName: r.handName,
                isWinner: r.isWinner || false
            })),
            winners: winners.map(w => ({
                playerId: w.playerId,
                playerName: w.playerName,
                hand: w.handName
            })),
            potWon: winAmount
        };

        // Emit showdown info
        this.onShowdown(this.showdownResults);

        // Keep showdown phase and pot visible until next hand
        this.emitStateChange();
    }

    /**
     * Award pot to a single winner (all others folded).
     */
    async awardPot(winner) {
        winner.winChips(this.pot);

        this.onShowdown({
            winners: [{ player: winner, hand: 'Fold', cards: [] }],
            potWon: this.pot,
            byFold: true
        });

        this.pot = 0;
        this.phase = GAME_PHASES.WAITING;
        this.emitStateChange();
    }

    /**
     * Check if current player is AI and trigger their action.
     */
    async checkForAIAction() {
        // Prevent concurrent AI action processing
        if (this.isProcessingAI) return;

        const player = this.currentPlayer;

        if (player && player.isAI && player.chips > 0 && !player.hasFolded && !player.isAllIn) {
            this.isProcessingAI = true;

            try {
                await delay(this.animationDelay * 1.5); // Thinking delay

                // Re-check after delay - player might have changed
                if (this.currentPlayer?.id !== player.id) {
                    this.isProcessingAI = false;
                    return;
                }

                const gameState = {
                    communityCards: this.communityCards,
                    currentBet: this.currentBet,
                    pot: this.pot,
                    bigBlind: this.bigBlind,
                    minRaise: this.minRaise,
                    players: this.players
                };

                const decision = player.decideAction(gameState);
                console.log(`AI ${player.name} decides: ${decision.action}`, decision.amount || '');

                // Reset flag BEFORE handleAction since it will call advanceToNextPlayer
                // which may need to trigger the next AI
                this.isProcessingAI = false;

                const success = await this.handleAction(player.id, decision.action, decision.amount);

                // If action failed for some reason, force a fold and continue
                if (!success) {
                    console.warn(`AI ${player.name} action failed, forcing fold`);
                    player.fold();
                    player.hasActed = true;
                    await this.advanceToNextPlayer();
                }
            } catch (error) {
                console.error(`AI ${player.name} error:`, error);
                // On any error, fold and continue to prevent freeze
                player.fold();
                player.hasActed = true;
                this.isProcessingAI = false;
                await this.advanceToNextPlayer();
            }
        }
    }

    /**
     * Get game state (for UI/network).
     */
    getState() {
        return {
            phase: this.phase,
            pot: this.pot,
            currentBet: this.currentBet,
            communityCards: this.communityCards,
            dealerIndex: this.dealerIndex,
            sbIndex: this.sbIndex,
            bbIndex: this.bbIndex,
            activePlayerIndex: this.activePlayerIndex,
            players: this.players.map(p => p.toJSON()),
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            handNumber: this.handNumber,
            minRaise: this.minRaise,
            showdownResults: this.showdownResults
        };
    }

    /**
     * Emit state change event.
     */
    emitStateChange() {
        this.onStateChange(this.getState());
    }
}
