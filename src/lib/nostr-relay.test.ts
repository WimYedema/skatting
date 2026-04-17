import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('nostr-tools', () => {
	const publish = vi.fn().mockReturnValue([Promise.resolve()])
	const subscribeMany = vi.fn()
	const close = vi.fn()
	function SimplePool() {
		return { subscribeMany, publish, close }
	}
	return {
		SimplePool,
		finalizeEvent: vi.fn().mockReturnValue({ id: 'evt1', kind: 25078, content: 'enc', tags: [] }),
		__mockPublish: publish,
		__mockSubscribeMany: subscribeMany,
		__mockPoolClose: close,
	}
})

vi.mock('nostr-tools/utils', () => ({
	hexToBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
}))

vi.mock('./crypto', () => ({
	deriveRoomKey: vi.fn().mockResolvedValue({} as CryptoKey),
	computeDTag: vi.fn().mockResolvedValue('abcdef12'),
	encrypt: vi.fn().mockResolvedValue('encrypted-payload'),
	decrypt: vi.fn(),
}))

vi.mock('./debug', () => ({
	debugLog: vi.fn(),
}))

vi.mock('./config', () => ({
	NOSTR_RELAY_URLS: ['wss://test-relay.example'],
}))

import * as nostrTools from 'nostr-tools'
import { decrypt } from './crypto'
import { createNostrRelay } from './nostr-relay'

const {
	__mockPublish: mockPublish,
	__mockSubscribeMany: mockSubscribeMany,
	__mockPoolClose: mockPoolClose,
} = nostrTools as unknown as {
	__mockPublish: ReturnType<typeof vi.fn>
	__mockSubscribeMany: ReturnType<typeof vi.fn>
	__mockPoolClose: ReturnType<typeof vi.fn>
}

const SECRET_KEY_HEX = 'a'.repeat(64)

describe('createNostrRelay', () => {
	let onEventCallback: ((event: { content: string }) => void) | undefined

	beforeEach(() => {
		vi.clearAllMocks()
		onEventCallback = undefined
		mockSubscribeMany.mockImplementation(
			(
				_relays: string[],
				_filter: unknown,
				params: { onevent: (event: { content: string }) => void },
			) => {
				onEventCallback = params.onevent
				return { close: vi.fn() }
			},
		)
	})

	it('subscribes to the correct kind and room tag', async () => {
		await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', vi.fn())

		expect(mockSubscribeMany).toHaveBeenCalledWith(
			['wss://test-relay.example'],
			expect.objectContaining({
				kinds: [25078],
				'#r': ['abcdef12'],
			}),
			expect.any(Object),
		)
	})

	it('send() encrypts and publishes an event', async () => {
		const relay = await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', vi.fn())

		await relay.send('estimate', { mu: 2, sigma: 0.5 })

		expect(mockPublish).toHaveBeenCalled()
	})

	it('routes incoming messages from other peers to onMessage', async () => {
		const onMessage = vi.fn()
		const envelope = JSON.stringify({ action: 'estimate', from: 'peer-2', data: { mu: 3 } })
		vi.mocked(decrypt).mockResolvedValueOnce(envelope)

		await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', onMessage)

		// Simulate incoming event
		onEventCallback!({ content: 'ciphertext' })
		// Wait for async decrypt
		await vi.waitFor(() => {
			expect(onMessage).toHaveBeenCalledWith('estimate', 'peer-2', { mu: 3 }, undefined, undefined)
		})
	})

	it('filters out own messages', async () => {
		const onMessage = vi.fn()
		const envelope = JSON.stringify({ action: 'estimate', from: 'self-1', data: { mu: 3 } })
		vi.mocked(decrypt).mockResolvedValueOnce(envelope)

		await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', onMessage)

		onEventCallback!({ content: 'ciphertext' })
		await new Promise((r) => setTimeout(r, 10))
		expect(onMessage).not.toHaveBeenCalled()
	})

	it('silently skips undecryptable events', async () => {
		const onMessage = vi.fn()
		vi.mocked(decrypt).mockRejectedValueOnce(new Error('bad key'))

		await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', onMessage)

		onEventCallback!({ content: 'corrupted' })
		await new Promise((r) => setTimeout(r, 10))
		expect(onMessage).not.toHaveBeenCalled()
	})

	it('silently skips malformed envelopes', async () => {
		const onMessage = vi.fn()
		vi.mocked(decrypt).mockResolvedValueOnce(JSON.stringify({ notAction: true }))

		await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', onMessage)

		onEventCallback!({ content: 'ciphertext' })
		await new Promise((r) => setTimeout(r, 10))
		expect(onMessage).not.toHaveBeenCalled()
	})

	it('close() tears down subscription and pool', async () => {
		const mockSubClose = vi.fn()
		mockSubscribeMany.mockReturnValue({ close: mockSubClose })

		const relay = await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', vi.fn())
		relay.close()

		expect(mockSubClose).toHaveBeenCalled()
		expect(mockPoolClose).toHaveBeenCalledWith(['wss://test-relay.example'])
	})

	it('returns no-op relay when subscription fails', async () => {
		mockSubscribeMany.mockImplementation(() => {
			throw new Error('network')
		})

		const relay = await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', vi.fn())

		// send and close should not throw
		await relay.send('test', {})
		relay.close()
	})

	it('forwards name and isCreator from relay envelope to onMessage', async () => {
		const onMessage = vi.fn()
		const envelope = JSON.stringify({
			action: 'ping',
			from: 'peer-2',
			data: { ts: 123 },
			name: 'Alice',
			isCreator: true,
		})
		vi.mocked(decrypt).mockResolvedValueOnce(envelope)

		await createNostrRelay('test-room', SECRET_KEY_HEX, 'self-1', onMessage)

		onEventCallback!({ content: 'ciphertext' })
		await vi.waitFor(() => {
			expect(onMessage).toHaveBeenCalledWith('ping', 'peer-2', { ts: 123 }, 'Alice', true)
		})
	})

	it('includes identity from getIdentity in outgoing envelopes', async () => {
		const { encrypt } = await import('./crypto')
		const getIdentity = () => ({ name: 'Bob', isCreator: false })
		const relay = await createNostrRelay(
			'test-room',
			SECRET_KEY_HEX,
			'self-1',
			vi.fn(),
			getIdentity,
		)

		await relay.send('estimate', { mu: 2 })

		expect(encrypt).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('"name":"Bob"'))
	})
})
