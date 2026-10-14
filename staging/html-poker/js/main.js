// main.js - Entry point for the poker game

import { Game, GAME_PHASES } from './Game.js';
import { Player } from './Player.js';
import { AIPlayer } from './AIPlayer.js';
import { Card } from './Card.js';
import { evaluateHand } from './HandEvaluator.js';
import { formatChips, delay } from './utils.js';

// DOM Elements
const elements = {
    // Menu
    mainMenu: document.getElementById('main-menu'),
    btnSinglePlayer: document.getElementById('btn-single-player'),
    btnMultiplayer: document.getElementById('btn-multiplayer'),
    multiplayerPanel: document.getElementById('multiplayer-panel'),
    playerNameInput: document.getElementById('player-name'),
    serverIpInput: document.getElementById('server-ip'),
    btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'),
    btnBack: document.getElementById('btn-back'),

    // AI Setup Panel
    aiSetupPanel: document.getElementById('ai-setup-panel'),
    btnAddAI: document.getElementById('btn-add-ai'),
    btnRemoveAI: document.getElementById('btn-remove-ai'),
    aiCountDisplay: document.getElementById('ai-count-display'),
    aiList: document.getElementById('ai-list'),
    btnStartGame: document.getElementById('btn-start-game'),
    btnBackSetup: document.getElementById('btn-back-setup'),

    // Game Settings
    startingChipsInput: document.getElementById('starting-chips'),
    smallBlindInput: document.getElementById('small-blind'),
    bigBlindInput: document.getElementById('big-blind'),

    // Game
    gameContainer: document.getElementById('game-container'),
    communityCards: document.getElementById('community-cards'),
    potAmount: document.getElementById('pot-amount'),
    blindsDisplay: document.getElementById('blinds-display'),
    handDisplay: document.getElementById('hand-display'),
    phaseDisplay: document.getElementById('phase-display'),

    // Actions
    actionPanel: document.getElementById('action-panel'),
    callAmount: document.getElementById('call-amount'),
    raiseSlider: document.getElementById('raise-slider'),
    raiseAmountDisplay: document.getElementById('raise-amount-display'),
    btnFold: document.getElementById('btn-fold'),
    btnCheck: document.getElementById('btn-check'),
    btnCall: document.getElementById('btn-call'),
    btnRaise: document.getElementById('btn-raise'),
    btnAllIn: document.getElementById('btn-all-in'),

    // Winner
    winnerOverlay: document.getElementById('winner-overlay'),
    winnerText: document.getElementById('winner-text'),
    winnerHand: document.getElementById('winner-hand'),
    winnerPot: document.getElementById('winner-pot'),
    btnNextHand: document.getElementById('btn-next-hand'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

// Game State
let game = null;
let localPlayer = null;
let isMultiplayer = false;
let socket = null;
let aiCount = 1; // Number of AI opponents
const AI_STYLES = ['tight', 'loose', 'aggressive'];

// ========================================
// Initialization
// ========================================

async function init() {
    console.log('Initializing game...');
    try {
        setupMenuListeners();
        setupActionListeners();

        // Set default player name
        if (elements.playerNameInput) elements.playerNameInput.value = 'Player';
        if (elements.serverIpInput) elements.serverIpInput.value = 'localhost:8080';

        console.log('Game initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Failed to initialize game: ' + error.message);
    }
}

function setupMenuListeners() {
    if (elements.btnSinglePlayer) {
        elements.btnSinglePlayer.addEventListener('click', () => {
            console.log('Single Player button clicked');
            showAISetupPanel();
        });
    } else {
        console.error('Single Player button not found');
    }

    if (elements.btnMultiplayer) elements.btnMultiplayer.addEventListener('click', showMultiplayerOptions);
    if (elements.btnBack) elements.btnBack.addEventListener('click', hideMultiplayerOptions);
    if (elements.btnHost) elements.btnHost.addEventListener('click', hostMultiplayerGame);
    if (elements.btnJoin) elements.btnJoin.addEventListener('click', joinMultiplayerGame);

    // AI Setup Panel listeners
    if (elements.btnAddAI) elements.btnAddAI.addEventListener('click', addAI);
    if (elements.btnRemoveAI) elements.btnRemoveAI.addEventListener('click', removeAI);
    if (elements.btnStartGame) elements.btnStartGame.addEventListener('click', startSinglePlayerGame);
    if (elements.btnBackSetup) elements.btnBackSetup.addEventListener('click', hideAISetupPanel);
}

function setupActionListeners() {
    if (elements.raiseSlider) elements.raiseSlider.addEventListener('input', updateRaiseDisplay);
    if (elements.btnFold) elements.btnFold.addEventListener('click', () => performAction('fold'));
    if (elements.btnCheck) elements.btnCheck.addEventListener('click', () => performAction('check'));
    if (elements.btnCall) elements.btnCall.addEventListener('click', () => performAction('call'));
    if (elements.btnRaise) elements.btnRaise.addEventListener('click', () => performAction('raise'));
    if (elements.btnAllIn) elements.btnAllIn.addEventListener('click', () => performAction('all-in'));
    if (elements.btnNextHand) elements.btnNextHand.addEventListener('click', startNextHand);
}

// ========================================
// Menu Functions
// ========================================

function showMultiplayerOptions() {
    elements.multiplayerPanel.classList.remove('hidden');
    elements.btnSinglePlayer.classList.add('hidden');
    elements.btnMultiplayer.classList.add('hidden');
}

function hideMultiplayerOptions() {
    elements.multiplayerPanel.classList.add('hidden');
    elements.btnSinglePlayer.classList.remove('hidden');
    elements.btnMultiplayer.classList.remove('hidden');
}

// ========================================
// AI Setup Panel Functions
// ========================================

function showAISetupPanel() {
    elements.aiSetupPanel.classList.remove('hidden');
    elements.btnSinglePlayer.classList.add('hidden');
    elements.btnMultiplayer.classList.add('hidden');
    updateAIList();
    updateAIButtons();
}

function hideAISetupPanel() {
    elements.aiSetupPanel.classList.add('hidden');
    elements.btnSinglePlayer.classList.remove('hidden');
    elements.btnMultiplayer.classList.remove('hidden');
}

function addAI() {
    if (aiCount < 5) { // Max 5 AI opponents
        aiCount++;
        updateAIList();
        updateAIButtons();
    }
}

function removeAI() {
    if (aiCount > 1) { // Min 1 AI opponent
        aiCount--;
        updateAIList();
        updateAIButtons();
    }
}

function updateAIList() {
    if (!elements.aiList) return;

    elements.aiList.innerHTML = '';
    for (let i = 0; i < aiCount; i++) {
        const style = AI_STYLES[i % AI_STYLES.length];
        const aiItem = document.createElement('div');
        aiItem.className = 'ai-item';
        aiItem.textContent = `🤖 AI Bot ${i + 1} (${style.charAt(0).toUpperCase() + style.slice(1)})`;
        elements.aiList.appendChild(aiItem);
    }

    if (elements.aiCountDisplay) {
        elements.aiCountDisplay.textContent = aiCount;
    }
}

function updateAIButtons() {
    if (elements.btnRemoveAI) {
        elements.btnRemoveAI.disabled = aiCount <= 1;
    }
    if (elements.btnAddAI) {
        elements.btnAddAI.disabled = aiCount >= 5;
    }
}

// ========================================
// Single Player Game
// ========================================

function startSinglePlayerGame() {
    console.log('Starting Single Player Game with', aiCount, 'AI opponents...');
    try {
        isMultiplayer = false;

        // Clear any leftover UI state from previous game
        if (elements.winnerOverlay) elements.winnerOverlay.classList.add('hidden');
        if (elements.communityCards) elements.communityCards.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const seatEl = document.querySelector(`.seat-${i}`);
            if (seatEl) {
                seatEl.classList.remove('active', 'folded', 'all-in', 'winner');
                const cardsContainer = seatEl.querySelector('.player-cards');
                if (cardsContainer) cardsContainer.innerHTML = '';
                const handStrength = seatEl.querySelector('.hand-strength');
                if (handStrength) handStrength.classList.add('hidden');
                const dealerBtn = seatEl.querySelector('.dealer-button');
                if (dealerBtn) dealerBtn.classList.add('hidden');
                const turnIndicator = seatEl.querySelector('.turn-indicator');
                if (turnIndicator) turnIndicator.classList.add('hidden');
            }
        }

        // Read game settings from inputs
        const startingChips = parseInt(elements.startingChipsInput?.value) || 1000;
        const smallBlind = parseInt(elements.smallBlindInput?.value) || 10;
        const bigBlind = parseInt(elements.bigBlindInput?.value) || 20;

        console.log(`Settings: Chips=${startingChips}, SB=${smallBlind}, BB=${bigBlind}`);

        // Create game instance
        if (typeof Game === 'undefined') {
            throw new Error('Game class not loaded');
        }

        game = new Game({
            smallBlind: smallBlind,
            bigBlind: bigBlind,
            onStateChange: handleStateChange,
            onPlayerAction: handlePlayerAction,
            onShowdown: handleShowdown
        });

        console.log('Game instance created');

        // Create local player with custom starting chips
        localPlayer = new Player('player-1', 'You', startingChips, false);
        game.addPlayer(localPlayer);

        // Create AI opponents based on aiCount
        for (let i = 0; i < aiCount; i++) {
            const style = AI_STYLES[i % AI_STYLES.length];
            const aiPlayer = new AIPlayer(`ai-${i + 1}`, `AI Bot ${i + 1}`, startingChips, style);
            game.addPlayer(aiPlayer);
        }

        console.log('Players added:', game.players.length);

        // Hide menu and show game
        if (elements.mainMenu) elements.mainMenu.classList.remove('active');
        if (elements.gameContainer) elements.gameContainer.classList.remove('hidden');

        // Show/hide seats based on player count
        const totalPlayers = 1 + aiCount;
        for (let i = 0; i < 6; i++) {
            const seatEl = document.querySelector(`.seat-${i}`);
            if (seatEl) {
                if (i < totalPlayers) {
                    seatEl.classList.remove('hidden');
                } else {
                    seatEl.classList.add('hidden');
                }
            }
        }

        // Update blinds display
        if (elements.blindsDisplay) elements.blindsDisplay.textContent = `Blinds: $${game.smallBlind} / $${game.bigBlind}`;

        // Start first hand
        console.log('Starting first hand in 500ms...');
        setTimeout(() => {
            game.startHand().catch(e => {
                console.error('Error starting hand:', e);
                showToast('Error starting hand: ' + e.message, 'error');
            });
        }, 500);
    } catch (e) {
        console.error('Error starting game:', e);
        alert('Error starting game: ' + e.message);
    }
}

// ========================================
// Multiplayer Functions
// ========================================

function hostMultiplayerGame() {
    const playerName = elements.playerNameInput.value.trim() || 'Host';
    showToast('To host a game, run: node server/server.js', 'info');
    showToast('Then click "Join Game"', 'info');
}

function joinMultiplayerGame() {
    const playerName = elements.playerNameInput.value.trim() || 'Player';
    const serverAddress = elements.serverIpInput.value.trim() || 'localhost:8080';

    isMultiplayer = true;
    connectToServer(serverAddress, playerName);
}

function connectToServer(address, playerName) {
    try {
        socket = new WebSocket(`ws://${address}`);

        socket.onopen = () => {
            showToast('Connected to server!', 'success');

            // Send join request
            socket.send(JSON.stringify({
                type: 'join',
                name: playerName
            }));
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleServerMessage(message);
        };

        socket.onclose = () => {
            showToast('Disconnected from server', 'warning');
            if (isMultiplayer) {
                // Return to menu
                elements.mainMenu.classList.add('active');
                elements.gameContainer.classList.add('hidden');
            }
        };

        socket.onerror = (error) => {
            showToast('Connection error. Is the server running?', 'error');
            console.error('WebSocket error:', error);
        };

    } catch (error) {
        showToast('Failed to connect: ' + error.message, 'error');
    }
}

function handleServerMessage(message) {
    switch (message.type) {
        case 'joined':
            localPlayer = { id: message.playerId, name: message.name };
            elements.mainMenu.classList.remove('active');
            elements.gameContainer.classList.remove('hidden');
            showToast(`Welcome, ${message.name}!`, 'success');
            break;

        case 'state':
            renderMultiplayerState(message.state);
            break;

        case 'action':
            showToast(`${message.playerName} ${message.action}`, 'info');
            break;

        case 'showdown':
            displayShowdown(message.results, message.potWon);
            break;

        case 'chat':
            showToast(`${message.from}: ${message.text}`, 'info');
            break;

        case 'error':
            showToast(message.message, 'error');
            break;
    }
}

function sendAction(action, amount = 0) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'action',
            action,
            amount
        }));
    }
}

// ========================================
// Game State Rendering
// ========================================

function handlePlayerAction(data) {
    const { player, action, amount } = data;

    // Log for debugging
    console.log(`Action: ${player.name} ${action} ${amount ? amount : ''}`);

    // Show toast for AI actions or significant player actions
    if (player.isAI || action === 'raise' || action === 'all-in') {
        let message = `${player.name} ${action}s`;
        if (amount) {
            if (action === 'raise') {
                message += ` to $${formatChips(player.currentBet)}`;
            } else if (action === 'call') {
                message += ` $${formatChips(amount)}`;
            } else {
                message += ` $${formatChips(amount)}`;
            }
        }
        showToast(message, 'info');
    }
}

/**
 * Handle showdown - display winner overlay
 */
function handleShowdown(data) {
    console.log('Showdown:', data);

    if (!data || !data.winners || data.winners.length === 0) {
        console.warn('No winner data in showdown');
        return;
    }

    // Get winner info
    const winner = data.winners[0];
    const winnerName = winner.playerName || winner.player?.name || 'Unknown';
    const winnerHand = winner.hand || 'N/A';
    const potWon = data.potWon || 0;

    // Check if local player is eliminated (has 0 chips after this hand)
    const localPlayerEliminated = localPlayer && localPlayer.chips <= 0;
    const playersWithChips = game ? game.players.filter(p => p.chips > 0) : [];
    // Game is over if local player is eliminated OR only 1 player remains
    const gameOver = localPlayerEliminated || playersWithChips.length < 2;

    console.log('Showdown state:', {
        localPlayerChips: localPlayer?.chips,
        localPlayerEliminated,
        playersWithChips: playersWithChips.length,
        gameOver
    });

    // Update winner overlay text
    if (elements.winnerText) {
        if (localPlayerEliminated) {
            elements.winnerText.textContent = 'Game Over - You Lost!';
        } else if (gameOver) {
            elements.winnerText.textContent = 'Congratulations - You Won!';
        } else {
            elements.winnerText.textContent = data.winners.length > 1
                ? 'Split Pot!'
                : `${winnerName} Wins!`;
        }
    }
    if (elements.winnerHand) {
        elements.winnerHand.textContent = data.byFold ? 'All Others Folded' : winnerHand;
    }
    if (elements.winnerPot) {
        elements.winnerPot.textContent = `Won $${formatChips(potWon)}`;
    }

    // Update button text based on game state
    if (elements.btnNextHand) {
        elements.btnNextHand.textContent = gameOver ? 'Return to Menu' : 'Next Hand';
    }

    // Show the winner overlay
    if (elements.winnerOverlay) {
        elements.winnerOverlay.classList.remove('hidden');
    }

    // If player is eliminated, auto-return to menu after delay
    if (localPlayerEliminated) {
        // Stop the game immediately to prevent AI from continuing
        game = null;

        // Show message and return to menu after delay
        showToast('You have been eliminated! Returning to menu...', 'error');
        setTimeout(() => {
            resetGameState();
        }, 3000);
    }
}

function handleStateChange(state) {
    renderGameState(state);
}

function renderGameState(state) {
    // Update phase display
    const phaseNames = {
        [GAME_PHASES.WAITING]: 'Waiting...',
        [GAME_PHASES.PRE_FLOP]: 'Pre-Flop',
        [GAME_PHASES.FLOP]: 'Flop',
        [GAME_PHASES.TURN]: 'Turn',
        [GAME_PHASES.RIVER]: 'River',
        [GAME_PHASES.SHOWDOWN]: 'Showdown'
    };
    elements.phaseDisplay.textContent = phaseNames[state.phase] || state.phase;

    // Update hand number
    elements.handDisplay.textContent = `Hand #${state.handNumber}`;

    // Update pot
    elements.potAmount.textContent = `$${formatChips(state.pot)}`;

    // Render community cards
    renderCommunityCards(state.communityCards);

    // Render players
    renderPlayers(state);

    // Update action panel
    updateActionPanel(state);
}

/**
 * Ensure we have a real Card instance (server sends plain JSON {rank, suit, value}).
 */
function toCard(card) {
    if (!card) return null;
    if (typeof card.createElement === 'function') return card;
    return new Card(card.rank, card.suit);
}

function renderCommunityCards(cards) {
    elements.communityCards.innerHTML = '';

    for (const card of cards) {
        const cardObj = toCard(card);
        if (!cardObj) continue;
        const cardEl = cardObj.createElement(true);
        cardEl.classList.add('dealing');
        elements.communityCards.appendChild(cardEl);
    }
}

function renderPlayers(state) {
    state.players.forEach((playerData, index) => {
        const seatEl = document.querySelector(`.seat-${index}`);
        if (!seatEl) return;

        seatEl.classList.remove('hidden', 'folded', 'all-in', 'winner');

        // Get actual player object for cards (single player), or build Card
        // instances from the server-sent JSON (multiplayer, where game is null)
        const player = game ? game.players[index] : null;

        let holeCards = [];
        if (player && player.holeCards && player.holeCards.length > 0) {
            holeCards = player.holeCards;
        } else if (playerData.holeCards && playerData.holeCards.length > 0) {
            holeCards = playerData.holeCards.map(c => toCard(c)).filter(Boolean);
        }

        const communityCards = game
            ? game.communityCards
            : (state.communityCards || []).map(c => toCard(c)).filter(Boolean);

        // Update info
        const nameEl = seatEl.querySelector('.player-name');
        const chipsEl = seatEl.querySelector('.player-chips');
        const avatarEl = seatEl.querySelector('.player-avatar');

        nameEl.textContent = playerData.name;
        chipsEl.textContent = `$${formatChips(playerData.chips)}`;
        avatarEl.textContent = playerData.isAI ? '🤖' : '👤';

        // Folded state
        if (playerData.hasFolded) {
            seatEl.classList.add('folded');
        }

        // All-in state
        if (playerData.isAllIn) {
            seatEl.classList.add('all-in');
        }

        // Dealer button
        const dealerBtn = seatEl.querySelector('.dealer-button');
        if (playerData.isDealer) {
            dealerBtn.classList.remove('hidden');
            dealerBtn.textContent = 'D';
        } else if (index === state.sbIndex) {
            dealerBtn.classList.remove('hidden');
            dealerBtn.textContent = 'SB';
            dealerBtn.style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
        } else if (index === state.bbIndex) {
            dealerBtn.classList.remove('hidden');
            dealerBtn.textContent = 'BB';
            dealerBtn.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
        } else {
            dealerBtn.classList.add('hidden');
            dealerBtn.style.background = '';
        }

        // Turn indicator
        const turnIndicator = seatEl.querySelector('.turn-indicator');
        if (index === state.activePlayerIndex && state.phase !== GAME_PHASES.WAITING && state.phase !== GAME_PHASES.SHOWDOWN) {
            turnIndicator.classList.remove('hidden');
        } else {
            turnIndicator.classList.add('hidden');
        }

        // Player bet
        const betEl = seatEl.querySelector('.player-bet');
        if (playerData.currentBet > 0) {
            betEl.textContent = `$${formatChips(playerData.currentBet)}`;
            betEl.classList.remove('hidden');
        } else {
            betEl.classList.add('hidden');
        }

        // Render cards
        const cardsContainer = seatEl.querySelector('.player-cards');
        cardsContainer.innerHTML = '';

        if (holeCards.length > 0) {
            const seatPlayerId = player ? player.id : playerData.id;
            const isLocalPlayer = localPlayer && seatPlayerId === localPlayer.id;
            const isShowdown = state.phase === GAME_PHASES.SHOWDOWN;

            // Show face-up for: local player, or during showdown (if not folded)
            const faceUp = isLocalPlayer || (isShowdown && !playerData.hasFolded);

            for (const card of holeCards) {
                const cardEl = card.createElement(faceUp);
                cardEl.classList.add('mini');
                cardsContainer.appendChild(cardEl);
            }

            // Show hand strength
            const handStrengthEl = seatEl.querySelector('.hand-strength');
            if (handStrengthEl) {
                // Show for local player during game, or for all at showdown
                const showStrength = (isLocalPlayer && communityCards.length >= 3) ||
                    (isShowdown && !playerData.hasFolded && communityCards.length >= 3);

                if (showStrength) {
                    const allCards = [...holeCards, ...communityCards];
                    const evaluation = evaluateHand(allCards);

                    handStrengthEl.textContent = evaluation.name;
                    handStrengthEl.classList.remove('hidden', 'weak', 'medium', 'strong', 'premium');

                    // Color code by hand strength
                    if (evaluation.rank <= 1) {
                        handStrengthEl.classList.add('weak');
                    } else if (evaluation.rank <= 3) {
                        handStrengthEl.classList.add('medium');
                    } else if (evaluation.rank <= 6) {
                        handStrengthEl.classList.add('strong');
                    } else {
                        handStrengthEl.classList.add('premium');
                    }

                    // Mark winner during showdown
                    if (isShowdown && state.showdownResults) {
                        const isWinner = state.showdownResults.winners.some(w => w.playerId === seatPlayerId);
                        if (isWinner) {
                            seatEl.classList.add('winner');
                        }
                    }
                } else {
                    handStrengthEl.classList.add('hidden');
                }
            }
        }
    });
}

function renderMultiplayerState(state) {
    // Similar to renderGameState but handles multiplayer-specific logic
    // Cards are only shown face-up for the local player
    renderGameState(state);
}

// ========================================
// Action Panel
// ========================================

function updateActionPanel(state) {
    if (!localPlayer) return;

    // Resolve the acting player's data from the local engine (single player)
    // or from the server-sent state (multiplayer, where game is null).
    let actingPlayerData, stateCurrentBet, stateMinRaise, phase;
    if (game && !isMultiplayer) {
        const cp = game.currentPlayer;
        if (!cp) return;
        actingPlayerData = { id: cp.id, currentBet: cp.currentBet, chips: cp.chips };
        stateCurrentBet = state.currentBet;
        stateMinRaise = state.minRaise;
        phase = state.phase;
    } else if (isMultiplayer) {
        actingPlayerData = state.players[state.activePlayerIndex];
        stateCurrentBet = state.currentBet;
        stateMinRaise = state.minRaise;
        phase = state.phase;
    } else {
        return;
    }

    const isMyTurn = actingPlayerData && actingPlayerData.id === localPlayer.id;

    // Disable panel if not my turn or game waiting
    if (!isMyTurn || phase === GAME_PHASES.WAITING || phase === GAME_PHASES.SHOWDOWN) {
        elements.actionPanel.classList.add('disabled');
        return;
    }

    elements.actionPanel.classList.remove('disabled');

    const toCall = stateCurrentBet - actingPlayerData.currentBet;
    const canCheck = toCall === 0;
    const minRaise = stateCurrentBet + stateMinRaise;
    const maxRaise = actingPlayerData.chips + actingPlayerData.currentBet;

    // Update call amount display
    elements.callAmount.textContent = toCall > 0 ? `To call: $${formatChips(toCall)}` : '';

    // Update buttons
    elements.btnCheck.disabled = !canCheck;
    elements.btnCheck.classList.toggle('hidden', !canCheck);
    elements.btnCall.classList.toggle('hidden', canCheck);
    elements.btnCall.textContent = `Call $${formatChips(toCall)}`;

    // Update raise slider
    elements.raiseSlider.min = minRaise;
    elements.raiseSlider.max = maxRaise;
    elements.raiseSlider.value = minRaise;
    updateRaiseDisplay();

    // Disable raise if not enough chips
    elements.btnRaise.disabled = actingPlayerData.chips <= toCall;
}

function updateRaiseDisplay() {
    const value = parseInt(elements.raiseSlider.value);
    elements.raiseAmountDisplay.textContent = `$${formatChips(value)}`;
}

function performAction(action) {
    if (!game || !localPlayer) return;

    if (isMultiplayer) {
        // Send to server
        const amount = action === 'raise' ? parseInt(elements.raiseSlider.value) : 0;
        sendAction(action, amount);
    } else {
        // Local game
        let amount = 0;

        if (action === 'raise') {
            amount = parseInt(elements.raiseSlider.value);
        } else if (action === 'all-in') {
            action = 'raise';
            amount = localPlayer.chips + localPlayer.currentBet;
        }

        game.handleAction(localPlayer.id, action, amount);
    }
}

// ========================================
// Showdown Display
// ========================================

function displayShowdown(winners, potWon, byFold = false) {
    // Show winner cards first (for single player, reveal AI cards)
    if (!isMultiplayer && game) {
        // Re-render to show all cards face up
        game.players.forEach((player, index) => {
            const seatEl = document.querySelector(`.seat-${index}`);
            if (!seatEl) return;

            const cardsContainer = seatEl.querySelector('.player-cards');
            cardsContainer.innerHTML = '';

            if (player.holeCards.length > 0 && !player.hasFolded) {
                for (const card of player.holeCards) {
                    const cardEl = card.createElement(true);
                    cardEl.classList.add('mini');
                    cardsContainer.appendChild(cardEl);
                }
            }
        });
    }

    // Delay for card reveal, then show overlay
    setTimeout(() => {
        const winner = winners[0];
        // Single-player winners carry a player object; server winners carry playerName
        const winnerName = winner.playerName || (winner.player && winner.player.name) || 'Unknown';
        elements.winnerText.textContent = `${winnerName} Wins!`;
        elements.winnerHand.textContent = byFold ? 'Everyone else folded' : winner.hand;
        elements.winnerPot.textContent = `Won $${formatChips(potWon)}`;

        elements.winnerOverlay.classList.remove('hidden');
    }, 1000);
}

function startNextHand() {
    elements.winnerOverlay.classList.add('hidden');

    if (isMultiplayer && socket) {
        socket.send(JSON.stringify({ type: 'ready' }));
    } else if (game) {
        // Check if any player is out of chips
        const playersWithChips = game.players.filter(p => p.chips > 0);

        if (playersWithChips.length < 2) {
            const winner = playersWithChips[0];
            showToast(`${winner.name} wins the game!`, 'success');

            // Full cleanup and return to menu
            setTimeout(() => {
                resetGameState();
            }, 2000);
            return;
        }

        game.startHand().catch(e => {
            console.error('Error starting hand:', e);
            showToast('Error starting hand: ' + e.message, 'error');
        });
    }
}

/**
 * Fully reset game state and UI, return to menu
 */
function resetGameState() {
    // Reset game variables
    game = null;
    localPlayer = null;
    aiCount = 1;

    // Hide game UI
    elements.gameContainer.classList.add('hidden');
    elements.winnerOverlay.classList.add('hidden');
    elements.actionPanel.classList.add('disabled');

    // Clear community cards
    if (elements.communityCards) {
        elements.communityCards.innerHTML = '';
    }

    // Reset all seats
    for (let i = 0; i < 6; i++) {
        const seatEl = document.querySelector(`.seat-${i}`);
        if (seatEl) {
            seatEl.classList.remove('active', 'folded', 'all-in', 'winner');
            const cardsContainer = seatEl.querySelector('.player-cards');
            if (cardsContainer) cardsContainer.innerHTML = '';
            const handStrength = seatEl.querySelector('.hand-strength');
            if (handStrength) handStrength.classList.add('hidden');
            const dealerBtn = seatEl.querySelector('.dealer-button');
            if (dealerBtn) dealerBtn.classList.add('hidden');
            const turnIndicator = seatEl.querySelector('.turn-indicator');
            if (turnIndicator) turnIndicator.classList.add('hidden');
        }
    }

    // Reset pot display
    if (elements.potAmount) elements.potAmount.textContent = '$0';

    // Reset AI setup panel
    hideAISetupPanel();
    updateAIList();
    updateAIButtons();

    // Show main menu
    elements.mainMenu.classList.add('active');
}

// ========================================
// Toast Notifications
// ========================================


function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// Start
// ========================================

init();
