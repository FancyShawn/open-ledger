import { promises as fs } from 'fs'
import path from 'path'
import type { Account, AccountRule, SkipRule, Member, AppData } from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function readJSON<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJSON<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// ========== Accounts ==========

const accountsPath = path.join(DATA_DIR, 'accounts.json')

export async function getAccounts(): Promise<Account[]> {
  return readJSON<Account[]>(accountsPath, [])
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  await writeJSON(accountsPath, accounts)
}

// ========== Unified Rules (AccountRule) ==========

const rulesPath = path.join(DATA_DIR, 'rules.json')

export async function getRules(): Promise<AccountRule[]> {
  return readJSON<AccountRule[]>(rulesPath, [])
}

export async function saveRules(rules: AccountRule[]): Promise<void> {
  await writeJSON(rulesPath, rules)
}

// ========== Members ==========

const membersPath = path.join(DATA_DIR, 'members.json')

export async function getMembers(): Promise<Member[]> {
  return readJSON<Member[]>(membersPath, [])
}

export async function saveMembers(members: Member[]): Promise<void> {
  await writeJSON(membersPath, members)
}

// ========== AI Config ==========

export async function getAIConfig() {
  const configPath = path.join(process.cwd(), 'config', 'ai.json')
  return readJSON(configPath, {
    enabled: false,
    provider: 'openai',
    base_url: '',
    api_key: '',
    model: '',
    temperature: 0.3,
  })
}

export interface AIConfig {
  enabled: boolean
  provider: string
  base_url: string
  api_key: string
  model: string
  temperature: number
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  const configPath = path.join(process.cwd(), 'config', 'ai.json')
  await writeJSON(configPath, config)
}

// ========== Skip Rules ==========

const skipRulesPath = path.join(DATA_DIR, 'skip-rules.json')

export async function getSkipRules(): Promise<SkipRule[]> {
  return readJSON<SkipRule[]>(skipRulesPath, [])
}

export async function saveSkipRules(rules: SkipRule[]): Promise<void> {
  await writeJSON(skipRulesPath, rules)
}

// ========== Bulk ==========

export async function getAppData(): Promise<AppData> {
  const [accounts, rules, skipRules, members] = await Promise.all([
    getAccounts(),
    getRules(),
    getSkipRules(),
    getMembers(),
  ])
  return { accounts, rules, skipRules, members }
}
