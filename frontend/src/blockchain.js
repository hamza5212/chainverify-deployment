import { ethers } from 'ethers'
import contractAddress from './contract-address.json'
import ChainVerifyABI from './ChainVerifyABI.json'

const HARDHAT_CHAIN_ID = '0x7a69'
const RPC_URL = 'http://127.0.0.1:8545'

export function hasMetaMask() { return typeof window !== 'undefined' && Boolean(window.ethereum) }

async function ensureCorrectNetwork() {
  if (!window.ethereum) throw new Error('MetaMask is not installed.')
  const current = await window.ethereum.request({ method: 'eth_chainId' })
  if (current === HARDHAT_CHAIN_ID) return
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: HARDHAT_CHAIN_ID }] })
  } catch (err) {
    if (err.code === 4902 || /Unrecognized chain/i.test(err.message || '')) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: HARDHAT_CHAIN_ID, chainName: 'Hardhat Local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [RPC_URL] }] })
    } else { throw err }
  }
}

export async function connectWallet() {
  if (!hasMetaMask()) throw new Error('MetaMask is not installed.')
  await ensureCorrectNetwork()
  const provider = new ethers.BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  const signer = await provider.getSigner()
  return { provider, signer, address: await signer.getAddress() }
}

export async function getContract() {
  if (!contractAddress.ChainVerify) throw new Error('Contract address not found.')
  const { signer } = await connectWallet()
  return new ethers.Contract(contractAddress.ChainVerify, ChainVerifyABI, signer)
}

function extractErrorMessage(err) {
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') return 'You rejected the transaction in MetaMask.'
  if (err?.reason) return err.reason
  if (err?.info?.error?.message && err.info.error.message !== 'Internal JSON-RPC error.') return err.info.error.message
  if (typeof err?.message === 'string' && err.message !== 'Internal JSON-RPC error.') return err.message
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
    // Ignore read errors
  }

  try {
    // Explicitly set gasLimit and gasPrice to lock the fee to a constant amount
    const tx = await contract.registerArticle(articleId, contentHash, watermarkId, { 
      gasLimit: 300000,
      gasPrice: ethers.parseUnits("1", "gwei") 
    })
    const receipt = await tx.wait()
    
    if (!receipt || receipt.status !== 1) throw new Error('Transaction reverted on the blockchain.')
    return { txHash: tx.hash, blockNumber: receipt.blockNumber }
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function recordVerificationOnChain(articleId) {
  const contract = await getContract()
  try {
    // Explicitly set gasLimit and gasPrice to lock the fee to a constant amount
    const tx = await contract.recordVerification(articleId, { 
      gasLimit: 100000,
      gasPrice: ethers.parseUnits("1", "gwei")
    })
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) throw new Error('Transaction reverted on the blockchain.')
    return { txHash: tx.hash, blockNumber: receipt.blockNumber }
  } catch (err) {
    throw new Error(extractErrorMessage(err))
  }
}

export async function getOnChainEvents() {
  if (!contractAddress.ChainVerify) return []
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const contract = new ethers.Contract(contractAddress.ChainVerify, ChainVerifyABI, provider)
  const events = await contract.queryFilter(contract.filters.ArticleRegistered(), 0, 'latest')
  return events.map((ev) => ({
    articleId: ev.args.articleId, contentHash: ev.args.contentHash, watermarkId: ev.args.watermarkId,
    registeredBy: ev.args.registeredBy, timestamp: Number(ev.args.timestamp), txHash: ev.transactionHash, blockNumber: ev.blockNumber,
  }))
}