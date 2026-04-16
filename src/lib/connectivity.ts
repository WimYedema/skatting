import { debugLog } from './debug'

export interface ConnectivityResult {
	webSocket: 'ok' | 'fail' | 'pending'
	stun: 'ok' | 'fail' | 'pending'
	webRtcLocal: 'ok' | 'fail' | 'pending'
	details: string[]
}

const TIMEOUT = 8000

/** Test WebSocket connectivity to a relay */
async function testWebSocket(url: string): Promise<{ ok: boolean; error?: string }> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			ws.close()
			resolve({ ok: false, error: `timeout (${TIMEOUT}ms)` })
		}, TIMEOUT)
		let ws: WebSocket
		try {
			ws = new WebSocket(url)
		} catch (e) {
			clearTimeout(timer)
			resolve({ ok: false, error: String(e) })
			return
		}
		ws.onopen = () => {
			clearTimeout(timer)
			ws.close()
			resolve({ ok: true })
		}
		ws.onerror = () => {
			clearTimeout(timer)
			ws.close()
			resolve({ ok: false, error: 'connection error' })
		}
	})
}

/** Test if STUN servers are reachable by gathering ICE candidates */
async function testStun(): Promise<{ ok: boolean; candidateTypes: string[]; error?: string }> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			pc.close()
			resolve({
				ok: candidateTypes.length > 0,
				candidateTypes,
				error: candidateTypes.length === 0 ? `no ICE candidates within ${TIMEOUT}ms` : undefined,
			})
		}, TIMEOUT)
		const candidateTypes: string[] = []
		const pc = new RTCPeerConnection({
			iceServers: [
				{ urls: 'stun:stun.l.google.com:19302' },
				{ urls: 'stun:stun1.l.google.com:19302' },
				{ urls: 'stun:stun.cloudflare.com:3478' },
			],
		})
		pc.onicecandidate = (e) => {
			if (e.candidate) {
				const type = e.candidate.type ?? 'unknown'
				if (!candidateTypes.includes(type)) candidateTypes.push(type)
				// srflx = server-reflexive = got through STUN (public IP mapped)
				if (type === 'srflx') {
					clearTimeout(timer)
					pc.close()
					resolve({ ok: true, candidateTypes })
				}
			}
		}
		pc.onicegatheringstatechange = () => {
			if (pc.iceGatheringState === 'complete') {
				clearTimeout(timer)
				pc.close()
				resolve({
					ok: candidateTypes.includes('srflx'),
					candidateTypes,
					error: candidateTypes.includes('srflx') ? undefined : 'no server-reflexive candidates (STUN blocked?)',
				})
			}
		}
		// Create a dummy data channel + offer to trigger ICE gathering
		pc.createDataChannel('test')
		pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch((e) => {
			clearTimeout(timer)
			pc.close()
			resolve({ ok: false, candidateTypes: [], error: String(e) })
		})
	})
}

/** Test local WebRTC data channel (two peers in same browser) */
async function testLocalWebRtc(): Promise<{ ok: boolean; error?: string }> {
	return new Promise((resolve) => {
		const iceConfig = {
			iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
		}
		const pc1 = new RTCPeerConnection(iceConfig)
		const pc2 = new RTCPeerConnection(iceConfig)
		const timer = setTimeout(() => {
			pc1.close()
			pc2.close()
			resolve({ ok: false, error: `local loopback timeout (${TIMEOUT}ms)` })
		}, TIMEOUT)

		// Buffer ICE candidates until remote description is set — candidates
		// arriving before setRemoteDescription would be silently dropped.
		const pending1: RTCIceCandidate[] = []
		const pending2: RTCIceCandidate[] = []
		let pc2Ready = false
		let pc1Ready = false

		pc1.onicecandidate = (e) => {
			if (!e.candidate) return
			if (pc2Ready) pc2.addIceCandidate(e.candidate).catch(() => {})
			else pending1.push(e.candidate)
		}
		pc2.onicecandidate = (e) => {
			if (!e.candidate) return
			if (pc1Ready) pc1.addIceCandidate(e.candidate).catch(() => {})
			else pending2.push(e.candidate)
		}

		const dc = pc1.createDataChannel('test')
		pc2.ondatachannel = (e) => {
			e.channel.onmessage = (msg) => {
				if (msg.data === 'ping') {
					clearTimeout(timer)
					pc1.close()
					pc2.close()
					resolve({ ok: true })
				}
			}
		}
		dc.onopen = () => dc.send('ping')

		pc1.createOffer()
			.then((offer) => pc1.setLocalDescription(offer))
			.then(() => pc2.setRemoteDescription(pc1.localDescription!))
			.then(() => {
				pc2Ready = true
				for (const c of pending1) pc2.addIceCandidate(c).catch(() => {})
				return pc2.createAnswer()
			})
			.then((answer) => pc2.setLocalDescription(answer))
			.then(() => pc1.setRemoteDescription(pc2.localDescription!))
			.then(() => {
				pc1Ready = true
				for (const c of pending2) pc1.addIceCandidate(c).catch(() => {})
			})
			.catch((e) => {
				clearTimeout(timer)
				pc1.close()
				pc2.close()
				resolve({ ok: false, error: String(e) })
			})
	})
}

/** Run all connectivity checks. Returns results progressively via callback. */
export async function runConnectivityCheck(
	relayUrls: string[],
	onUpdate: (result: ConnectivityResult) => void,
): Promise<ConnectivityResult> {
	const result: ConnectivityResult = {
		webSocket: 'pending',
		stun: 'pending',
		webRtcLocal: 'pending',
		details: [],
	}
	onUpdate({ ...result })

	// 1. WebSocket relay check (test first 2 relays)
	const wsTests = relayUrls.slice(0, 2).map(async (url) => {
		const r = await testWebSocket(url)
		return { url, ...r }
	})
	const wsResults = await Promise.all(wsTests)
	const wsOk = wsResults.some((r) => r.ok)
	result.webSocket = wsOk ? 'ok' : 'fail'
	for (const r of wsResults) {
		result.details.push(`WS ${r.url}: ${r.ok ? '✓' : '✗ ' + r.error}`)
		debugLog('check', `WebSocket ${r.url}`, r.ok ? 'OK' : r.error)
	}
	onUpdate({ ...result, details: [...result.details] })

	// 2. STUN check
	const stunResult = await testStun()
	result.stun = stunResult.ok ? 'ok' : 'fail'
	result.details.push(`STUN: ${stunResult.ok ? '✓' : '✗'} candidates=[${stunResult.candidateTypes.join(',')}]${stunResult.error ? ' — ' + stunResult.error : ''}`)
	debugLog('check', 'STUN', stunResult)
	onUpdate({ ...result, details: [...result.details] })

	// 3. Local WebRTC loopback
	const loopback = await testLocalWebRtc()
	result.webRtcLocal = loopback.ok ? 'ok' : 'fail'
	result.details.push(`WebRTC local: ${loopback.ok ? '✓' : '✗'}${loopback.error ? ' — ' + loopback.error : ''}`)
	debugLog('check', 'WebRTC local', loopback)
	onUpdate({ ...result, details: [...result.details] })

	return result
}
