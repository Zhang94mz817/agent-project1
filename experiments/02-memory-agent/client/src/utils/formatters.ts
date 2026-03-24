import type { MemoryFact } from '../types'

export function formatDateTime(value: string | undefined): string {
  if (!value) return '未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN')
}

export function explainUserFact(fact: MemoryFact): string {
  if (fact.key === 'profile.name') {
    return `记录了用户希望被称呼为 ${fact.value}。`
  }
  if (fact.key === 'profile.occupation') {
    return `记录了用户的职业或身份是 ${fact.value}。`
  }
  if (fact.key === 'profile.experienceYears') {
    return `记录了用户的经验年限是 ${fact.value} 年。`
  }
  if (fact.key === 'profile.languagePreference') {
    return `记录了用户偏好的回答语言是 ${fact.value}。`
  }
  if (fact.key === 'profile.responseStyle') {
    return `记录了用户偏好的回答风格是 ${fact.value}。`
  }
  return `这条记录表示用户长期记忆里保存了 ${fact.key} = ${fact.value}。`
}

export function explainProjectFact(fact: MemoryFact): string {
  if (fact.key === 'active.topic') {
    return `当前项目正在长期关注的主题是 ${fact.value}。`
  }
  return `这条记录表示项目记忆里保存了 ${fact.key} = ${fact.value}。`
}

export function formatInput(input: Record<string, unknown>): string {
  if (!input || typeof input !== 'object') return ''
  const first = Object.values(input)[0]
  const text = String(first ?? '')
  return text.length > 40 ? text.slice(0, 40) + '...' : text
}
