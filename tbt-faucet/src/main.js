import { createClient, Binary } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider';
import { getPolkadotSignerFromPjs } from 'polkadot-api/pjs-signer';
import { getWallets } from '@talismn/connect-wallets';
import { passetHub } from '@polkadot-api/descriptors';

const WS_ENDPOINT = 'wss://testnet-passet-hub.polkadot.io';
const FAUCET_CONTRACT_ADDRESS = '0x0Fb083E49a9B7E8dc81B11B673fB983079919fAB';
const CLAIM_TBT_SELECTOR = '43beaff2'; // keccak256("claimTbt()")[:4]

let typedApi = null;
let selectedAccount = null;
let signer = null;
let wallet = null;

const statusEl = document.getElementById('status');
const accountSection = document.getElementById('account-section');
const accountAddress = document.getElementById('account-address');
const connectBtn = document.getElementById('connect-btn');
const claimBtn = document.getElementById('claim-btn');

function setStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status' + (type ? ' ' + type : '');
}

function showLoading(button, text) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span>${text}`;
}

function hideLoading(button, text) {
    button.disabled = false;
    button.innerHTML = text;
}

async function connectWallet() {
    try {
        showLoading(connectBtn, 'Connecting...');
        setStatus('Connecting to wallet...');

        const installedWallets = getWallets().filter(w => w.installed);

        if (installedWallets.length === 0) {
            throw new Error('No wallet extension found. Please install Polkadot.js or Talisman.');
        }

        wallet = installedWallets.find(w => w.extensionName === 'talisman')
            || installedWallets.find(w => w.extensionName === 'polkadot-js')
            || installedWallets[0];

        await wallet.enable('TBT Faucet');

        const accounts = await wallet.getAccounts();

        if (accounts.length === 0) {
            throw new Error('No accounts authorized. Please open your wallet extension and authorize accounts for this site.');
        }

        selectedAccount = accounts[0];

        signer = getPolkadotSignerFromPjs(
            selectedAccount.address,
            wallet.signer.signPayload,
            wallet.signer.signRaw
        );

        accountAddress.textContent = selectedAccount.address;
        accountSection.classList.remove('hidden');
        connectBtn.classList.add('hidden');
        claimBtn.classList.remove('hidden');

        setStatus('Connecting to chain...');
        const provider = getWsProvider(WS_ENDPOINT);
        const client = createClient(provider);
        typedApi = client.getTypedApi(passetHub);

        setStatus('Waiting for chain connection...');
        await typedApi.query.System.Number.getValue();

        setStatus('Wallet connected. You can now claim TBT.', 'success');
    } catch (error) {
        setStatus(`Failed to connect: ${error.message}`, 'error');
        hideLoading(connectBtn, 'Connect Wallet');
    }
}

async function claimTBT() {
    if (!typedApi || !selectedAccount) {
        setStatus('Please connect your wallet first', 'error');
        return;
    }

    try {
        showLoading(claimBtn, 'Claiming...');
        setStatus('Simulating transaction...');

        const data = Binary.fromHex(CLAIM_TBT_SELECTOR);

        const dryRunResult = await typedApi.apis.ReviveApi.call(
            selectedAccount.address,
            Binary.fromHex(FAUCET_CONTRACT_ADDRESS),
            0n,
            undefined,
            undefined,
            data,
        );

        const weight = dryRunResult.weight_required;
        const storageDeposit = dryRunResult.storage_deposit?.value || 0n;

        const tx = typedApi.tx.Revive.call({
            dest: Binary.fromHex(FAUCET_CONTRACT_ADDRESS),
            value: 0n,
            weight_limit: weight,
            storage_deposit_limit: storageDeposit * 2n,
            data: data,
        });

        setStatus('Please sign the transaction in your wallet...');

        const result = await tx.signAndSubmit(signer);

        setStatus(`TBT claimed! Block: ${result.block.hash.slice(0, 10)}...`, 'success');
    } catch (error) {
        setStatus(`Failed to claim: ${error.message}`, 'error');
    } finally {
        hideLoading(claimBtn, 'Claim TBT');
    }
}

connectBtn.addEventListener('click', connectWallet);
claimBtn.addEventListener('click', claimTBT);
