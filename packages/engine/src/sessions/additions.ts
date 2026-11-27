// The acrescentares of a Session (#272): what the Dono added to the request
// from the Cartaz, each once, in the order said (the versions in order,
// then the current one). The request (`context.request`) keeps the words
// she opened with; these say what came after ("chegou a Rosa").

import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'

const listOf = (value: YamlValue | undefined): ReadonlyArray<YamlValue> =>
  value !== undefined && pyTruthy(value) && isSequence(value) ? value : []

/** Every acrescentar of the Session's replies, each once, in order. */
export const additionsOf = (front: YamlMapping): string[] => {
  const replies = [
    ...listOf(front.get('versions')).flatMap((version) =>
      isMapping(version) ? listOf(version.get('replies')) : [],
    ),
    ...listOf(front.get('replies')),
  ]
  const additions: string[] = []
  for (const reply of replies) {
    if (!isMapping(reply)) continue
    const addition = reply.get('addition')
    if (addition === undefined || !pyTruthy(addition)) continue
    const text = pyStrValue(addition).trim()
    if (text !== '' && !additions.includes(text)) additions.push(text)
  }
  return additions
}
