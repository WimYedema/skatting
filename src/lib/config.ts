export const APP_ID = 'estimate-p2p-tool'

export const NOSTR_RELAY_URLS = [
	'wss://nos.lol',
	'wss://relay.primal.net',
]

export function generateRoomId(): string {
	const consonants = 'bdfghjkmnprstvz'
	const vowels = 'aeiou'
	let id = ''
	for (let i = 0; i < 4; i++) {
		id += consonants[Math.floor(Math.random() * consonants.length)]
		id += vowels[Math.floor(Math.random() * vowels.length)]
	}
	return id
}
