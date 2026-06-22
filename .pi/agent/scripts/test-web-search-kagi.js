#!/usr/bin/env node

/**
 * Test script for web-search-kagi extension
 * This tests the fetch functionality and API response parsing
 */

const fs = require('fs');
const path = require('path');

// Test configuration (Kagi API v1)
const CONFIG = {
  limit: 10,
  safe_search: true,
};

/**
 * Load environment variables from ~/.pi/agent/.env
 */
function loadEnvFile() {
  try {
    const envPath = path.join(process.env.HOME || process.env.HOMEPATH || '~', '.pi', 'agent', '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    // .env file is optional
  }
}

async function testSearch(query) {
  // Load env vars from .env file
  loadEnvFile();
  const apiKey = process.env.KAGI_API_KEY;
  
  if (!apiKey) {
    console.log("⚠️  KAGI_API_KEY not set. Skipping actual search test.");
    console.log("To test, set: export KAGI_API_KEY=your_api_key");
    return false;
  }

  try {
    console.log(`🔍 Searching for: "${query}"`);

    const response = await fetch("https://kagi.com/api/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: CONFIG.limit,
        safe_search: CONFIG.safe_search,
      }),
    });

    if (!response.ok) {
      console.error(`❌ Search failed with status ${response.status}`);
      const errorText = await response.text();
      console.error(errorText);
      return false;
    }

    const data = await response.json();
    const results = data.data?.search ?? [];

    console.log(`✅ Found ${results.length} results`);

    if (results.length > 0) {
      console.log("\n📋 Top Results:");
      results.slice(0, 3).forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.title ?? "No title"}`);
        console.log(`   URL: ${result.url ?? "No URL"}`);
        console.log(`   Snippet: ${result.snippet ?? "No snippet"}`);
      });

      const adjacent = data.data?.adjacent_question ?? [];
      if (adjacent.length > 0) {
        console.log("\n❓ Related Questions:");
        adjacent.slice(0, 3).forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.props?.question ?? item.title}`);
        });
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Search failed: ${error.message}`);
    return false;
  }
}

// Run tests
async function main() {
  console.log("🚀 Web Search Kagi Extension - Test Script\n");
  
  // Test 1: Check API key
  console.log("Test 1: Checking API key...");
  loadEnvFile(); // Load from .env first
  if (process.env.KAGI_API_KEY) {
    console.log("✅ KAGI_API_KEY is set\n");
  } else {
    console.log("⚠️  KAGI_API_KEY is not set\n");
    console.log("💡 Tip: Add it to ~/.pi/agent/.env");
    console.log("   Example: echo 'KAGI_API_KEY=your_key' >> ~/.pi/agent/.env\n");
  }

  // Test 2: Perform a sample search
  console.log("Test 2: Performing sample search...");
  const success = await testSearch("TypeScript 5.5 new features");
  
  if (success) {
    console.log("\n✅ All tests passed!");
  } else {
    console.log("\n⚠️  Tests completed with warnings or errors");
  }
}

main().catch(console.error);