
import { ethers } from 'ethers'
import contractAddress from './contract-address.json'
import ChainVerifyABI from './ChainVerifyABI.json'

const SEPOLIA_CHAIN_ID = '0xaa36a7'
const SEPOLIA_RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL
const SEPOLIA_EXPLORER_URL = 'https://sepolia.etherscan.io'

export function hasMetaMask() {
  return typeof window !== 'undefined' && Boolean(window.ethereum)
}

async function ensureCorrectNetwork() {
  if (!window.ethereum) {
    throw new Error(
      'MetaMask is not installed. Open this website in a browser with the MetaMask extension enabled.'
    )
  }

  const current = await window.ethereum.request({ method: 'eth_chainId' })

  if (current === SEPOLIA_CHAIN_ID) return

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    })
  } catch (err) {
    if (err.code === 4902 || /Unrecognized chain/i.test(err.message || '')) {
      if (!SEPOLIA_RPC_URL) {
        throw new Error(
          'Sepolia RPC URL is not configured. Set VITE_SEPOLIA_RPC_URL in Vercel Environment Variables.'
        )
      }

      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Ethereum Sepolia',
          nativeCurrency: {
            name: 'Sepolia Ether',
            symbol: 'ETH',
            decimals: 18,
          },
          rpcUrls: [SEPOLIA_RPC_URL],
          blockExplorerUrls: [SEPOLIA_EXPLORER_URL],
        }],
      })
    } else {
      throw err
    }
  }

  const updated = await window.ethereum.request({ method: 'eth_chainId' })

  if (updated !== SEPOLIA_CHAIN_ID) {
    throw new Error('Please switch MetaMask to Ethereum Sepolia and try again.')
  }
}

export async function connectWallet() {
  if (!hasMetaMask()) {
    throw new Error(
      'MetaMask is not detected. Open the website in a browser with the MetaMask extension enabled.'
    )
  }

  await ensureCorrectNetwork()

  const provider = new ethers.BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  const signer = await provider.getSigner()

  return {
    provider,
    signer,
    address: await signer.getAddress(),
  }
}

export async function getContract() {
  if (!contractAddress.ChainVerify) {
    throw new Error('Contract address not found.')
  }

  const { signer } = await connectWallet()
  const contract = new ethers.Contract(
    contractAddress.ChainVerify,
    ChainVerifyABI,
    signer
  )

  const network = await signer.provider.getNetwork()

  if (network.chainId !== 11155111n) {
    throw new Error('The wallet must be connected to Ethereum Sepolia.')
  }

  return contract
}

function extractErrorMessage(err) {
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
    return 'You rejected the transaction in MetaMask.'
  }

  if (err?.reason) return err.reason

  if (
    err?.info?.error?.message &&
    err.info.error.message !== 'Internal JSON-RPC error.'
  ) {
    return err.info.error.message
  }

  if (
    typeof err?.message === 'string' &&
    err.message !== 'Internal JSON-RPC error.'
  ) {
    return err.message
  }

  return 'The transaction was rejected by the contract.'
}

export async function registerOnChain(articleId, contentHash, watermarkId) {
  const contract = await getContract()

  try {
    const existing = await contract.getArticle(articleId)

    if (existing && existing.contentHash) {
      return { txHash: 'synced-from-chain', blockNumber: 0 }
    }
  } catch (e) {
    // Ignore read errors and let registration report any real failure.
  }

  try {
    const tx = await contract.registerArticle(
      articleId,
      contentHash,
      watermarkId
    )

    const receipt = await tx.wait()

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction reverted on the blockchain.')
    }

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    }
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function recordVerificationOnChain(articleId) {
  const contract = await getContract()

  try {
    const tx = await contract.recordVerification(articleId)
    const receipt = await tx.wait()

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction reverted on the blockchain.')
    }

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    }
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getOnChainEvents() {
  if (!contractAddress.ChainVerify) return []

  if (!SEPOLIA_RPC_URL) {
    throw new Error('Sepolia RPC URL is not configured.')
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
  const contract = new ethers.Contract(
    contractAddress.ChainVerify,
    ChainVerifyABI,
    provider
  )

  const events = await contract.queryFilter(
    contract.filters.ArticleRegistered(),
    0,
    'latest'
  )

  return events.map((ev) => ({
    articleId: ev.args.articleId,
    contentHash: ev.args.contentHash,
    watermarkId: ev.args.watermarkId,
    registeredBy: ev.args.registeredBy,
    timestamp: Number(ev.args.timestamp),
    txHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
  }))
}
