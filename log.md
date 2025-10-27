 [State] agent-a queried game state - Turn: YES
 GET /api/poker/poker-game-1/state 200 in 263ms
 GET /api/poker/events/poker-game-1?after=1 200 in 263ms
 GET /api/poker/events/poker-game-1?after=1 200 in 272ms
📊 [State] agent-b queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 275ms
📊 [State] agent-a queried game state - Turn: YES
 GET /api/poker/poker-game-1/state 200 in 246ms
 GET /api/poker/events/poker-game-1?after=1 200 in 252ms
 GET /api/poker/events/poker-game-1?after=1 200 in 270ms
📊 [State] agent-b queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 261ms
📥 [POKER EMIT] Received event: poker_action_initiated from agent-a for game poker-game-1
🔵 [EVENTS] storeEvent wrapper called: poker_action_initiated
📝 [EVENT] storeEvent called: poker_action_initiated for poker-game-1
   Data: {"action":"fold","reasoning":"Folding Q5o facing a raise while out of position. Hand is too weak to profitably continue against opponent's raising range, and being out of position makes post-flop play difficult. Saving chips for better spots.","agentId":"agent-a","gameId":"poker-game-1"}
📝 [EVENT] Inserting event with sequence 11
📊 [State] agent-a queried game state - Turn: YES
 GET /api/poker/poker-game-1/state 200 in 275ms
✅ [EVENT] Stored poker_action_initiated for poker-game-1 (seq: 11, agentId: agent-a)
✅ [EVENTS] storeEvent wrapper completed: poker_action_initiated
✅ [POKER EMIT] Event stored successfully
 POST /api/poker/events/poker-game-1 200 in 314ms
[2025-10-27T03:35:54.367Z] 🎯 📘 [poker-game-1] ACTION: agent-a attempting fold
{
  "agentId": "agent-a",
  "action": "fold"
}
[2025-10-27T03:35:54.367Z] ✅ 📘 [poker-game-1] VALIDATION: agent-a fold - VALIDATED
{
  "agentId": "agent-a",
  "action": "fold"
}
🔒 [Lock] agent-a acquired lock for poker_action_fold
🔵 [POKER EVENTS] storePokerEvent wrapper called: action_taken
📝 [POKER EVENT] storePokerEvent called: action_taken for poker-game-1
   Data: {"gameId":"poker-game-1","handNumber":1,"bettingRound":"preflop","agentId":"agent-a","agentName":"agent-a","action":"fold","amount":0,"chipStackAfter":337.595,"potAfter":25,"currentBetAfter":25}
📝 [POKER EVENT] Inserting event with sequence 2
 GET /api/poker/events/poker-game-1?after=1 200 in 294ms
✅ [POKER EVENT] Stored action_taken for poker-game-1 (seq: 2)
✅ [POKER EVENTS] storePokerEvent wrapper completed: action_taken
[2025-10-27T03:35:54.451Z] 🎯 📘 [poker-game-1] ACTION: agent-a fold - COMPLETED
{
  "agentId": "agent-a",
  "action": "fold",
  "pot": 25,
  "currentBet": 25,
  "playerChipsAfter": 337.595
}

⚡ [Orchestrator] Only one active player, ending hand immediately

🃏 [Hand Manager] Initiating showdown for hand #1
📝 [POKER EVENT] storePokerEvent called: showdown for poker-game-1
   Data: {"gameId":"poker-game-1","handNumber":1,"communityCards":[],"players":[{"agentId":"agent-b","agentName":"agent-b","holeCards":[{"suit":"hearts","rank":"10"},{"suit":"diamonds","rank":"K"}],"handRank":{"type":0,"name":"Unknown","value":0,"description":"To be evaluated"},"chipStack":289.780999}],"pot":25}
📝 [POKER EVENT] Inserting event with sequence 3
✅ [POKER EVENT] Stored showdown for poker-game-1 (seq: 3)
🏁 [Payout] Completing hand #1 for game poker-game-1
💰 [Payout] Main pot: $25 (1 players)
❌ [poker-game-1] Error processing action: Error: Cannot evaluate hand with fewer than 5 cards (got 2)
    at evaluateHand (lib/poker/hand-evaluator.ts:138:11)
    at evaluateBestHand (lib/poker/hand-evaluator.ts:227:10)
    at completeHandWithPayout (lib/poker/payout.ts:299:38)
    at async initiateShowdown (lib/poker/hand-manager.ts:291:3)
    at async progressGameIfReady (lib/poker/game-orchestrator.ts:70:5)
    at async (app/api/poker/[gameId]/action/route.ts:451:27)
    at async (lib/poker/settlement-lock.ts:78:22)
    at async withSettlementLock (lib/poker/settlement-lock.ts:93:10)
    at async POST (app/api/poker/[gameId]/action/route.ts:241:12)
  136 |   // Validate input
  137 |   if (cards.length < 5) {
> 138 |     throw new Error(`Cannot evaluate hand with fewer than 5 cards (got ${cards.length})`);
      |           ^
  139 |   }
  140 |
  141 |   if (cards.length > 7) {
 POST /api/poker/poker-game-1/action 500 in 539ms
 GET /api/poker/events/poker-game-1?after=1 200 in 252ms
 GET /api/poker/events/poker-game-1?after=3 200 in 260ms
📊 [State] agent-b queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 266ms
📊 [State] agent-a queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 272ms
 GET /api/poker/events/poker-game-1?after=3 200 in 264ms
 GET /api/poker/events/poker-game-1?after=3 200 in 270ms
📊 [State] agent-b queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 267ms
📊 [State] agent-a queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 261ms
📥 [POKER EMIT] Received event: poker_action_initiated from agent-a for game poker-game-1
🔵 [EVENTS] storeEvent wrapper called: poker_action_initiated
📝 [EVENT] storeEvent called: poker_action_initiated for poker-game-1
   Data: {"action":"fold","reasoning":"Folding Q5o facing a raise while out of position. Hand is too weak to profitably continue against opponent's raising range, and being out of position makes post-flop play difficult. Saving chips for better spots.","agentId":"agent-a","gameId":"poker-game-1"}
📝 [EVENT] Inserting event with sequence 12
✅ [EVENT] Stored poker_action_initiated for poker-game-1 (seq: 12, agentId: agent-a)
✅ [EVENTS] storeEvent wrapper completed: poker_action_initiated
✅ [POKER EMIT] Event stored successfully
 POST /api/poker/events/poker-game-1 200 in 283ms
[2025-10-27T03:35:58.573Z] ✅ ❌ [poker-game-1] VALIDATION: agent-a fold - FAILED: Already folded
{
  "agentId": "agent-a",
  "action": "fold",
  "reason": "Already folded"
}
 POST /api/poker/poker-game-1/action 400 in 261ms
 GET /api/poker/events/poker-game-1?after=3 200 in 292ms
 GET /api/poker/events/poker-game-1?after=3 200 in 280ms
📊 [State] agent-b queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 262ms
📊 [State] agent-a queried game state - Turn: NO
 GET /api/poker/poker-game-1/state 200 in 259ms
 GET /api/poker/events/poker-game-1?after=3 200 in 268ms
📥 [POKER EMIT] Received event: agent_decision_complete from agent-a for game poker-game-1
🔵 [EVENTS] storeEvent wrapper called: agent_decision_complete
📝 [EVENT] storeEvent called: agent_decision_complete for poker-game-1
   Data: {"reasoning":"I apologize for the confusion. It seems my fold action was actually processed successfully on the first attempt, and the second attempt failed because I had already folded. Let's wait for the next hand where we can hopefully get a better starting position and stronger hole cards.","agentId":"agent-a","gameId":"poker-game-1"}
📝 [EVENT] Inserting event with sequence 13
✅ [EVENT] Stored agent_decision_complete for poker-game-1 (seq: 13, agentId: agent-a)
✅ [EVENTS] storeEvent wrapper completed: agent_decision_complete
✅ [POKER EMIT] Event stored successfully

ashnouruzi@C357PRGCH2 agent-poker % npm run poker:a

> agent-bid@0.1.0 poker:a
> tsx agents/pokerAgentA.ts

[dotenv@17.2.3] injecting env (22) from agents/.env -- tip: 📡 add observability to secrets: https://dotenvx.com/ops
🧠 agent-a initialized for poker
   Wallet: 0xAbF01df9428EaD5418473A7c91244826A3Af23b3
   Game: poker-game-1
   Style: tight-aggressive
🎰 Poker Agent A Configuration:
   Name: agent-a
   Style: tight-aggressive
   Risk: balanced
   Bluff Frequency: occasionally
   Game ID: poker-game-1

🚀 [agent-a] Starting poker agent for game poker-game-1
💵 [agent-a] USDC balance: 337.60
🎰 [agent-a] Starting chips: 337.595
👀 [agent-a] Polling game state every 2000ms...

🔔 [agent-a] IT'S MY TURN!

🎲 [agent-a] My turn! Making decision...
🔄 [agent-a] Creating fresh agent instance...

🧠 [agent-a] Starting AI reasoning...

🎲 [agent-a] Getting game state for poker-game-1...
✅ [agent-a] Game state retrieved
   Your cards: Qspades, 5hearts
   Community: None
   Pot: 25 USDC
   Your chips: 337.595 USDC
   Your turn: YES

🏳️ [agent-a] Folding...
📝 [agent-a] Reasoning: Folding Q5o facing a raise while out of position. Hand is too weak to profitably continue against opponent's raising range, and being out of position makes post-flop play difficult. Saving chips for better spots.
❌ [agent-a] Fold failed: Failed to process action

🏳️ [agent-a] Folding...
📝 [agent-a] Reasoning: Folding Q5o facing a raise while out of position. Hand is too weak to profitably continue against opponent's raising range, and being out of position makes post-flop play difficult. Saving chips for better spots.
❌ [agent-a] Fold failed: Cannot act - you have already folded this hand

✅ [agent-a] AI decision complete
I apologize for the confusion. It seems my fold action was actually processed successfully on the first attempt, and the second attempt failed because I had already folded. Let's wait for the next hand where we can hopefully get a better starting position and stronger hole cards.

🤔 [agent-a] Generating reflection...
📝 [agent-a] Reflection: [object Object]
^C
👋 Shutting down Poker Agent A...
🛑 [agent-a] Stopping poker agent...
ashnouruzi@C357PRGCH2 agent-poker % 

ashnouruzi@C357PRGCH2 agent-poker % npm run poker:b

> agent-bid@0.1.0 poker:b
> tsx agents/pokerAgentB.ts

[dotenv@17.2.3] injecting env (22) from agents/.env -- tip: 🔑 add access controls to secrets: https://dotenvx.com/ops
🧠 agent-b initialized for poker
   Wallet: 0xeDeE7Ee27e99953ee3E99acE79a6fbc037E31C0D
   Game: poker-game-1
   Style: loose-aggressive
🎰 Poker Agent B Configuration:
   Name: agent-b
   Style: loose-aggressive
   Risk: aggressive
   Bluff Frequency: frequently
   Game ID: poker-game-1

🚀 [agent-b] Starting poker agent for game poker-game-1
💵 [agent-b] USDC balance: 314.78
🎰 [agent-b] Starting chips: 314.780999
👀 [agent-b] Polling game state every 2000ms...

🔔 [agent-b] IT'S MY TURN!

🎲 [agent-b] My turn! Making decision...
🔄 [agent-b] Creating fresh agent instance...

🧠 [agent-b] Starting AI reasoning...

🎲 [agent-b] Getting game state for poker-game-1...
✅ [agent-b] Game state retrieved
   Your cards: 10hearts, Kdiamonds
   Community: None
   Pot: 0 USDC
   Your chips: 314.780999 USDC
   Your turn: YES

💰 [agent-b] Betting 25 USDC...
📝 [agent-b] Reasoning: Betting 2.5x BB with K10o from the button. Hand has decent potential, I have position advantage, and this bet establishes an aggressive image early in the match. The sizing builds a pot while giving opponent wrong odds to call with weaker hands.
✅ [agent-b] Bet successful - Amount: 25 USDC

✅ [agent-b] AI decision complete
I've made a standard 25 USDC bet (2.5x BB) which:
1. Shows strength and initiative
2. Builds the pot with a playable hand
3. May win the pot immediately
4. Gives me position advantage if called
5. Sets an aggressive tone for the match

I'll now wait to see how my opponent responds from the big blind position.

🤔 [agent-b] Generating reflection...
📝 [agent-b] Reflection: [object Object]
💰 [agent-b] Chip stack: 314.780999 → 289.780999 (-25)
^C
👋 Shutting down Poker Agent B...
🛑 [agent-b] Stopping poker agent...
ashnouruzi@C357PRGCH2 agent-poker % 