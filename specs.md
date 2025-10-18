# Technical Specification: Autonomous Basename Bidding with x402

## Project Overview

**Goal**: Build a system where two autonomous agents compete for Basenames using x402 payments, with refunds as economic signals for being outbid.

**Core Mechanism**: Agents place bids via x402 payments → Server refunds previous bidder → Refund acts as signal → Agent retries with higher bid

**Stack**: Next.js (API + Frontend), MongoDB Atlas, CDP Server Wallets (Base Sepolia + Base Mainnet), x402 protocol, TypeScript agents with LlamaIndex

**Auction**: Time-based (5 minutes), two agents (A & B), testnet payments, mainnet Basename transfer

---

## Contract Addresses

### Base Mainnet (Basenames)
- **Registry**: `0xb94704422c2a1e396835a571837aa5ae53285a95`
- **BaseRegistrar (NFT)**: `0x03c4738ee98ae44591e1a4a4f3cab6641d95dd9a`
- **L2Resolver**: `0xC6d566A56A1aFf6508b41f6c90ff131615583BCD`
- **ReverseRegistrar**: `0x79ea96012eea67a83431f1701b3dff7e37f9e282`

### Base Sepolia (Testnet - for bidding/refunds)
- **USDC Token**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **x402 Facilitator**: `https://x402.org/facilitator`

---

## Phase 1: Project Initialization & Environment Setup

### 1.1 Project Structure
- [x] Create `/agent-bid` directory
- [x] Initialize Next.js 15 with App Router: \`npx create-next-app@latest agent-bid --typescript --tailwind --app --no-src-dir\`
- [x] Create subdirectories (see file structure in documentation section)

### 1.2 Dependencies Installation
- [x] Install core dependencies: \`npm install @coinbase/cdp-sdk mongodb dotenv viem @wagmi/core x402-hono x402 x402-axios @hono/node-server hono @llamaindex/anthropic llamaindex axios zod\`
- [x] Install dev dependencies: \`npm install -D @types/node tsx\`

### 1.3 Environment Configuration
- [x] Create \`.env.local\` with CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET, MONGODB_URI, SERVER_WALLET_ADDRESS, auction settings
- [x] Create \`agents/.env\` with AGENT_A_PRIVATE_KEY, AGENT_B_PRIVATE_KEY, agent configs, ANTHROPIC_API_KEY

---

## Phase 2: Database Schema & MongoDB Setup

### 2.1 MongoDB Atlas Setup
- [ ] Create MongoDB Atlas cluster at cloud.mongodb.com (M0 free tier)
- [ ] Configure IP whitelist and database user
- [x] Get connection string → \`.env.local\`

### 2.2 TypeScript Interfaces
- [x] Create \`types/index.ts\` with BidRecord, AgentConfig, BidEvent interfaces
- [x] BidRecord fields: basename, currentBid, currentWinner (agentId, walletAddress, externalId, timestamp), bidHistory, auctionStartTime, auctionEndTime, status, winnerNotified, basenameTransferTxHash

### 2.3 Database Utilities
- [x] Create \`lib/db.ts\` with connectToDatabase(), getBidRecord(), updateBidRecord(), addBidToHistory()

---

## Phase 3: CDP Server Wallet Integration

### 3.1 CDP Account Setup
- [x] Sign up at portal.cdp.coinbase.com
- [x] Create project → Generate CDP API Key + Wallet Secret
- [x] Save to \`.env.local\`

### 3.2 Wallet Initialization
- [x] Create \`lib/wallet.ts\` with initializeWallet(), getWalletBalance(), sendRefund()
- [x] Use \`cdp.evm.getOrCreateAccount({ name: 'basename-auction-server' })\` for persistence
- [x] Implement USDC transfer for refunds (ERC20 transfer with 6 decimals)

### 3.3 Wallet Funding
- [x] Fund server wallet with Base Sepolia ETH via \`cdp.evm.requestFaucet()\`
- [x] Fund with Base Sepolia USDC via CDP Faucet
- [ ] Fund with Base Mainnet ETH (purchase small amount for Basename transfer gas)

---

## Phase 4: x402 Bidding Server API

### 4.1 x402 Configuration
- [x] Create \`lib/x402-config.ts\` with facilitatorConfig, calculateCurrentBidPrice()

### 4.2 Bidding API Route
- [x] Create \`app/api/bid/[basename]/route.ts\` with POST handler
- [x] Integrate \`x402-hono\` middleware (study examples/typescript/servers/hono)
- [x] On 402: Return PaymentRequirementsResponse with current bid + increment
- [x] On payment verified: Update MongoDB, refund previous bidder, return success
- [x] Check auction end time: Reject with 410 Gone if auction ended

### 4.3 Auction Timer
- [x] On first bid: Set auctionEndTime = now + 5 minutes
- [x] On each bid: Check if auction ended → reject if so
- [ ] Create background job or endpoint to finalize ended auctions

### 4.4 Status & Events APIs
- [x] Create \`app/api/status/route.ts\` → return current BidRecord
- [x] Create \`app/api/events/route.ts\` → Server-Sent Events for real-time dashboard updates

---

## Phase 5: Autonomous Agent Implementation

### 5.1 Agent Wallet Setup
- [x] Generate two private keys with \`generatePrivateKey()\` from viem
- [x] Save to \`agents/.env\`
- [x] Fund Agent A and B wallets with Base Sepolia USDC via CDP Faucet

### 5.2 Shared Agent Base Class
- [x] Create \`agents/shared/agent-base.ts\` with BiddingAgent class
- [x] Initialize wallet with viem (baseSepolia chain)
- [x] Create axios client with \`withPaymentInterceptor()\` from x402-axios
- [x] Implement placeBid(): Call POST /api/bid/:basename with x402 header
- [x] Implement monitorForRefund(): Poll USDC balance every 2s, detect increases
- [x] On refund detected: Wait random 1-3s delay → bid again if still active

### 5.3 Individual Agent Files
- [x] Create \`agents/agentA.ts\` → Instantiate BiddingAgent with Agent A config → start()
- [x] Create \`agents/agentB.ts\` → Instantiate BiddingAgent with Agent B config → start()

### 5.4 Intelligence Enhancements (Optional)
- [ ] Add max bid checking (stop if exceeded)
- [ ] Add balance monitoring (stop if USDC too low)
- [ ] Integrate LlamaIndex for AI-driven bidding strategy

---

## Phase 6: Basename Transfer Integration

### 6.1 Contract ABI Research
- [ ] Verify 3-step ENS transfer process (ETH record, Manager, Owner NFT)
- [ ] Get ABIs from Basescan: L2Resolver.setAddr(), Registry.setOwner(), BaseRegistrar.safeTransferFrom()
- [ ] Alternative: Use etherscan.io/basescan.org verified contract ABIs

### 6.2 Transfer Implementation
- [ ] Create \`lib/basename-transfer.ts\` with transferBasename()
- [ ] Step 1: Call L2Resolver.setAddr(namehash, newOwnerAddress) on Base Mainnet
- [ ] Step 2: Call Registry.setOwner(namehash, newOwnerAddress)
- [ ] Step 3: Call BaseRegistrar.safeTransferFrom(from, to, tokenId)
- [ ] Use \`viem encodeFunctionData()\` for transaction data
- [ ] Implement namehash() using viem/ens or custom implementation
- [ ] Convert basename to tokenId (keccak256 of label)

### 6.3 Trigger Transfer on Auction End
- [ ] In auction end handler: Call transferBasename(basename, winner.walletAddress, cdp, serverAccount)
- [ ] Update MongoDB: Set status='finalized', save transaction hashes
- [ ] Add error handling: Log failures, optionally retry

---

## Phase 7: Frontend Dashboard (Read-Only Visualization)

### 7.1 Dashboard UI
- [x] Create \`app/auction/[basename]/page.tsx\` with real-time auction display
- [x] Components: Auction header (basename, current bid, time remaining), Agent status cards (A/B leading/outbid state), Live activity feed

### 7.2 Real-Time Updates
- [x] Fetch initial state from /api/status on mount
- [x] Connect EventSource to /api/events for SSE stream
- [x] Update UI on events: bid, refund, auction_end, transfer_complete

### 7.3 Styling & Animations
- [x] Use Tailwind CSS for styling
- [ ] Add animations: Bid flash, countdown timer, winner celebration
- [x] Responsive design for mobile/desktop

---

## Phase 8: Integration & Testing

### 8.1 Test Scripts
- [ ] Add npm scripts: "dev", "agent:a", "agent:b", "test:auction" (using concurrently)

### 8.2 End-to-End Test
- [ ] Start server → Start Agent A → Verify first bid → Start Agent B → Verify outbid/refund cycle
- [ ] Let auction run full 5 minutes
- [ ] Verify auction ends, new bids rejected
- [ ] Verify Basename transfer executes successfully

### 8.3 Edge Case Testing
- [ ] Agent runs out of USDC → Should stop gracefully
- [ ] Server runs out of refund USDC → Log error, handle gracefully  
- [ ] Network errors during bid → Retry logic
- [ ] Auction ends mid-bid → Return 410 Gone
- [ ] Basename transfer fails → Log, alert, manual intervention

---

## Phase 9: Documentation & Deployment

### 9.1 Documentation
- [ ] Comprehensive README.md: Overview, setup, running demo, architecture explanation
- [ ] .env.example templates for server and agents
- [ ] Code comments for complex logic
- [ ] Troubleshooting guide

### 9.2 Vercel Deployment
- [ ] Push to GitHub
- [ ] Connect to Vercel → Configure env vars → Deploy
- [ ] Test deployed endpoints with local agents

### 9.3 Production Considerations
- [ ] Rate limiting on bid endpoint
- [ ] Proper logging (Winston/Pino)
- [ ] Error monitoring (Sentry)
- [ ] MongoDB indexes for performance
- [ ] Consider WebSocket vs SSE for real-time updates

---

## Success Criteria

- Two agents compete in bidding loop with refunds as signals
- Auction ends after 5 minutes  
- Basename transfers to winner on Base Mainnet
- Frontend displays real-time agent activity
- All transactions verified on block explorers

---

## Technical Notes

### x402 Payment Flow
Agent → 402 response → x402-axios creates EIP-3009 authorization → Retry with X-PAYMENT header → Facilitator verifies → Settlement on-chain → Refund previous bidder

### Economic Signaling via Refunds
Money in → Money out = State change. No polling, no webhooks. Pure blockchain-native signaling.

### Basename Transfer  
3 transactions required: Update ETH record, Transfer manager, Transfer NFT ownership. Recipient must set as primary name separately.

---

## Resources

- x402 Docs: /Users/ashnouruzi/x402-bids/402-docs/
- CDP Wallet Docs: /Users/ashnouruzi/x402-bids/wallet-docs/
- Dynamic Agent Example: /Users/ashnouruzi/x402-bids/examples/typescript/dynamic_agent/
- Basename Contracts: https://github.com/base/basenames
- CDP Portal: https://portal.cdp.coinbase.com

---

**End of Specification**
