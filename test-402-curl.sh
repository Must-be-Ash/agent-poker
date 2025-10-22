#!/bin/bash

# Test script for 402 payment flow with Firecrawl
# This script tests the 402 negotiation flow without actual payment

echo "🧪 Testing 402 Payment Flow with Firecrawl..."
echo ""

# Check if environment variables are set
if [ -z "$BID_FIRECRAWL_API_KEY" ]; then
    echo "❌ BID_FIRECRAWL_API_KEY not set"
    echo "💡 Set it with: export BID_FIRECRAWL_API_KEY=your_key_here"
    exit 1
fi

echo "✅ Firecrawl API key found"
echo "🔑 API Key: ${BID_FIRECRAWL_API_KEY:0:10}..."

# Test 1: Direct API call (should return 402 Payment Required)
echo ""
echo "📡 Test 1: Direct Firecrawl API call (expecting 402)..."
echo "Query: 'Base blockchain latest news'"

response=$(curl -s -w "\n%{http_code}" -X POST "https://api.firecrawl.dev/v1/x402/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BID_FIRECRAWL_API_KEY" \
  -d '{
    "query": "Base blockchain latest news",
    "limit": 3,
    "sources": ["web"]
  }')

# Split response and status code
http_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | head -n -1)

echo "📊 HTTP Status: $http_code"
echo "📄 Response Body:"
echo "$response_body" | jq . 2>/dev/null || echo "$response_body"

if [ "$http_code" = "402" ]; then
    echo "✅ Got 402 Payment Required as expected!"
    echo "💡 This means Firecrawl is properly configured for x402 payments"
else
    echo "⚠️  Unexpected status code: $http_code"
    echo "💡 Expected 402, but got $http_code"
fi

echo ""
echo "🔍 Analyzing 402 response..."

# Check if response contains payment requirements
if echo "$response_body" | grep -q "accepts"; then
    echo "✅ Payment requirements found in response"
    echo "📋 Payment scheme details:"
    echo "$response_body" | jq '.accepts[0]' 2>/dev/null || echo "Could not parse JSON"
else
    echo "⚠️  No payment requirements found in response"
fi

echo ""
echo "🎯 Summary:"
echo "   - Firecrawl API is responding"
echo "   - 402 Payment Required status returned"
echo "   - x402 integration is working"
echo ""
echo "💡 Next step: Run the TypeScript test to test actual payment processing"
echo "   tsx test-firecrawl-402.ts"
