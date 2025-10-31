#!/bin/bash

# Filtered dev server - suppresses repetitive polling logs
npm run dev 2>&1 | grep -v "GET /api/poker/events/" | grep -v "GET /api/poker/poker-game-1/state"
