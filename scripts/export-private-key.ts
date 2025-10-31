import { CdpClient } from '@coinbase/cdp-sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function exportPrivateKey() {
  try {
    console.log('🔑 Exporting private key for server wallet...');

    // Get wallet address from environment
    const address = process.env.SERVER_WALLET_ADDRESS;
    if (!address) {
      throw new Error('SERVER_WALLET_ADDRESS not found in .env.local');
    }

    if (!address.startsWith('0x')) {
      throw new Error('SERVER_WALLET_ADDRESS must start with 0x');
    }

    console.log(`📍 Wallet address: ${address}`);

    // Initialize CDP client
    const cdp = new CdpClient();

    // Export private key using the wallet address
    const privateKey = await cdp.evm.exportAccount({
      address: address as `0x${string}`
    });
    
    console.log('✅ Private key exported successfully!');
    console.log('Private key:', privateKey);
    console.log('\n📝 Add this to your .env.local file:');
    console.log(`SERVER_WALLET_PRIVATE_KEY=${privateKey}`);
    
  } catch (error: any) {
    console.error('❌ Error exporting private key:', error.message);
    
    if (error.message.includes('export')) {
      console.log('\n💡 Make sure your CDP API key has the "Export" permission enabled.');
      console.log('   Go to CDP Portal > API Keys > Edit your key > API-specific restrictions > Export (export private key)');
    }
  }
}

exportPrivateKey().catch(console.error);

