import { ContextConnection, Controller, DataChannel, PeerChannel, ThorIOConnection } from "thor-io.client-vnext";
import { IE2EE } from "thor-io.client-vnext/dist/E2EE/E2EEBase";

/**
 * WebRTC abstraction layer for thor-io.vnext
 *
 * @export
 * @class ExtendWebRTCFactory
 */
export class ExtendWebRTCFactory {
    public peers: Map<string, ThorIOConnection>;
    public peer: RTCPeerConnection | undefined;
    public dataChannels: Map<string, DataChannel>;
    public localPeerId: string | undefined;
    public context!: string;
    public localStreams: Array<MediaStream>;

    public e2ee: IE2EE | undefined;
    public isEncrypted: boolean;

    // --- API / Public Properties (Preserved) ---

    onError: ((err: any) => (err: any) => void) | undefined;
    onContextCreated: ((peerConnection: ContextConnection) => void) | undefined;
    onContextChanged: ((context: { context: string; peerId: string; }) => void) | undefined;
    onRemoteAudioTrack: ((track: MediaStreamTrack, connection: ThorIOConnection, event: RTCTrackEvent) => void) | undefined;
    onRemoteVideoTrack: ((track: MediaStreamTrack, connection: ThorIOConnection, event: RTCTrackEvent) => void) | undefined;
    onRemoteTrack: ((track: MediaStreamTrack, connection: ThorIOConnection, event: RTCTrackEvent) => void) | undefined;
    onRemoteTrackLost: ((track: MediaStreamTrack, connection: ThorIOConnection, event: MediaStreamTrackEvent) => void) | undefined;
    onLocalStream: ((stream: MediaStream) => void) | undefined;
    onContextConnected: ((webRTCConnection: ThorIOConnection, rtcPeerConnection: RTCPeerConnection) => void) | undefined;
    onContextDisconnected: ((webRTCConnection: ThorIOConnection, rtcPeerConnection: RTCPeerConnection) => void) | undefined;

    // --- Constructor (Preserved Signaling Initialization) ---

    /**
     * Creates an instance of WebRTCFactory.
     * * @param {Controller} signalingController - The signaling controller
     * @param {RTCPeerConnectionConfig} rtcConfig - The RTC configuration
     * @param {IE2EE} [e2ee] - The end-to-end encryption instance
     */
    constructor(private signalingController: Controller, private rtcConfig: any, e2ee?: IE2EE) {
        this.isEncrypted = !!e2ee;
        this.e2ee = e2ee;
        this.localStreams = new Array<MediaStream>();
        this.dataChannels = new Map<string, DataChannel>();
        this.peers = new Map<string, ThorIOConnection>();

        // Signaling Event Handlers (Preserved)
        this.signalingController.on("contextSignal", (signal: any) => {
            let msg = JSON.parse(signal.message);
            switch (msg.type) {
                case "offer":
                    this.onOffer(signal, signal.skipLocalTracks || false);
                    break;
                case "answer":
                    this.onAnswer(signal);
                    break;
                case "candidate":
                    this.onCandidate(signal);
                    break;
            }
        });

        this.signalingController.on("contextCreated", (peer: ContextConnection) => {
            this.localPeerId = peer.peerId;
            this.context = peer.context;
            this.onContextCreated?.(peer);
        });
        this.signalingController.on("contextChanged", (context: any) => {
            this.context = context;
            this.onContextChanged?.(context);
        });
        this.signalingController.on("connectTo", (peers: Array<ContextConnection>) => {
            this.onConnectAll(peers);
        });
    }

    // --- Internal Connection & Signaling Logic (Refactored for Reliability) ---

    private onConnectAll(peerConnections: Array<ContextConnection>) {
        this.connect(peerConnections);
    }

    private onConnected(peerId: string) {
        if (this.onContextConnected)
            this.onContextConnected(this.findPeerConnection(peerId)!, this.getOrCreateRTCPeerConnection(peerId));
    }

    onDisconnected(peerId: string) {
        let peerConnection = this.getOrCreateRTCPeerConnection(peerId);
        if (this.onContextDisconnected)
            this.onContextDisconnected(this.findPeerConnection(peerId)!, peerConnection);
        
        peerConnection.close();
        this.removePeerConnection(peerId);
    }

    private addError(err: any) {
        this.onError?.(err);
    }

    private onCandidate(event: any) {
        const msg = JSON.parse(event.message);
        let candidate = msg.iceCandidate;
        let pc = this.getOrCreateRTCPeerConnection(event.sender);
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
            this.addError(err);
        });
    }

    private onAnswer(event: any) {
        let pc = this.getOrCreateRTCPeerConnection(event.sender);
        pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(event.message))).catch((err) => {
            this.addError(err);
        });
    }

    private onOffer(event: any, skipLocalTracks: boolean) {
        let pc = this.getOrCreateRTCPeerConnection(event.sender);
        
        // 1. Add Tracks if this is an initial offer/not skipped
        if (!skipLocalTracks) {
            this.addLocalTracksToPeer(pc);
        }

        // 2. Set Remote Description
        pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(event.message)));

        // 3. Create and Send Answer
        const rtcAnswer = { offerToReceiveAudio: true, offerToReceiveVideo: true } as RTCAnswerOptions;
        pc.createAnswer(rtcAnswer).then((description: RTCSessionDescriptionInit) => {
            return pc.setLocalDescription(description);
        }).then(() => {
            const answer = {
                sender: this.localPeerId,
                recipient: event.sender,
                message: JSON.stringify(pc.localDescription)
            };
            this.signalingController.invoke("contextSignal", answer);
        }).catch((err: any) => this.addError(err));
    }
    
    /**
     * Helper to add all current local tracks to a new peer connection, 
     * including E2EE stream setup if enabled.
     * @param pc The RTCPeerConnection to add tracks to.
     */
    private addLocalTracksToPeer(pc: RTCPeerConnection): void {
        this.localStreams.forEach((stream: MediaStream) => {
            stream.getTracks().forEach((track) => {
                // Check if the track is already added to prevent duplicates on renegotiation
                const existingSenders = pc.getSenders();
                if (!existingSenders.some(s => s.track && s.track.id === track.id)) {
                    const rtpSender = pc.addTrack(track, stream);

                    // E2EE Setup (Preserved and kept in one place)
                    if (this.isEncrypted) {
                        try {
                            // Ensure the sender is treated as 'any' to access non-standard methods
                            let senderStreams = (rtpSender as any).createEncodedStreams();
                            senderStreams.readableStream
                                .pipeThrough(new TransformStream({
                                    transform: this.e2ee!.encode.bind(this.e2ee),
                                }))
                                .pipeTo(senderStreams.writableStream);
                        } catch (e) {
                            this.addError(`E2EE stream setup failed: ${e}`);
                        }
                    }
                }
            });
            this.onLocalStream?.(stream);
        });
    }

    /**
     * Centralized function to handle Offer creation and signaling.
     * Used for initial connection and re-negotiation.
     * @param peerId The ID of the peer to create the offer for.
     * @param skipLocalTracks Flag to indicate if this is a re-negotiation for track updates.
     */
    private async createAndSendOffer(peerId: string, skipLocalTracks: boolean = false): Promise<void> {
        const pc = this.getOrCreateRTCPeerConnection(peerId);

        // Add tracks only if it's the initial offer
        if (!skipLocalTracks) {
            this.addLocalTracksToPeer(pc);
        }

        const offerOptions: RTCOfferOptions = { 
            offerToReceiveAudio: true, 
            offerToReceiveVideo: true 
        };

        try {
            const description = await pc.createOffer(offerOptions);
            await pc.setLocalDescription(description);

            const offer = {
                sender: this.localPeerId,
                recipient: peerId,
                message: JSON.stringify(pc.localDescription),
                skipLocalTracks: skipLocalTracks // Pass the skip flag for the recipient to handle
            };
            this.signalingController.invoke("contextSignal", offer);
        } catch (err) {
            this.addError(err);
        }
    }


    private createRTCPeerConnection(id: string): RTCPeerConnection {
        let config: any;

        if (this.isEncrypted) {
            config = {
                ...this.rtcConfig,
                encodedInsertableStreams: true,
                // These may be non-standard, but kept to preserve original logic
                forceEncodedVideoInsertableStreams: true, 
                forceEncodedAudioInsertableStreams: true,
            };
        } else {
            config = this.rtcConfig;
        }

        let rtcPeerConnection = new RTCPeerConnection(config);
        
        // --- Key Improvement: Standard Negotiation Handler ---
        // This handler fires automatically when pc.addTrack() or pc.removeTrack() is called.
        // It centralizes the re-negotiation offer creation logic. 
        rtcPeerConnection.onnegotiationneeded = () => {
             // For re-negotiation (after a track change), we skip adding all local tracks again.
            this.createAndSendOffer(id, true); 
        };
        // --------------------------------------------------

        rtcPeerConnection.onsignalingstatechange = (state) => { };
        rtcPeerConnection.onicecandidate = (event: any) => {
            if (!event || !event.candidate || !this.localPeerId) return;
            
            let msg = {
                sender: this.localPeerId,
                recipient: id,
                message: JSON.stringify({
                    type: 'candidate',
                    iceCandidate: event.candidate
                })
            };
            this.signalingController.invoke("contextSignal", msg);
        };
        rtcPeerConnection.oniceconnectionstatechange = (event: any) => {
            switch (event.target.iceConnectionState) {
                case "connected":
                    this.onConnected(id);
                    break;
                case "disconnected":
                case "failed": // Added 'failed' for robustness
                    this.cleanUp(id);
                    this.onDisconnected(id);
                    break;
            }
        };
        rtcPeerConnection.ontrack = (event: RTCTrackEvent) => {
            const track = event.track;
            const kind = event.track.kind;
            const connection = this.peers.get(id);

            event.track.onended = (e: any) => {
                this.onRemoteTrackLost?.(track, connection!, e);
            }

            if (kind === "video") {
                this.onRemoteVideoTrack?.(track, connection!, event);
            } else if (kind === "audio") {
                this.onRemoteAudioTrack?.(track, connection!, event);
            }
            this.onRemoteTrack?.(track, connection!, event);
        };

        // Data Channel Setup (Preserved)
        this.dataChannels.forEach((dataChannel: DataChannel) => {
            // Create outgoing data channel
            let pc = new PeerChannel(id, rtcPeerConnection.createDataChannel(dataChannel.label), dataChannel.label);
            dataChannel.addPeerChannel(pc);
        });

        // Incoming Data Channel Listener (Preserved)
        rtcPeerConnection.ondatachannel = (event: RTCDataChannelEvent) => {
            let channel = event.channel;
            let dataChannel = this.dataChannels.get(channel.label);
            if (!dataChannel) return; // Handle unknown channels

            channel.onopen = (e: Event) => {
                dataChannel!.onOpen(e, id, channel.label);
            };
            channel.onclose = (e: any) => {
                dataChannel!.removePeerChannel(id);
                dataChannel!.onClose(e, id, channel.label);
            };
            channel.onmessage = (message: MessageEvent) => {
                dataChannel!.onMessage(message);
            };
        };

        return rtcPeerConnection;
    }

    private getOrCreateRTCPeerConnection(id: string): RTCPeerConnection {
        let match = this.peers.get(id);
        if (match) {
            return match.peerConnection;
        }
        
        let pc = new ThorIOConnection(id, this.createRTCPeerConnection(id));
        this.peers.set(id, pc);
        return pc.peerConnection;
    }

    // --- Public API Methods (Preserved) ---
    
    /**
     * Add a MediaStreamTrack to remote peers.
     * **IMPROVED: Now uses RTCRtpSender reference and relies on `onnegotiationneeded`.**
     *
     * @param {MediaStreamTrack} track - The media stream track
     */
    addTrackToPeers(track: MediaStreamTrack) {
        const stream = this.localStreams.find(s => s.getTracks().includes(track));
        if (!stream) {
            this.addError(`Cannot find MediaStream for track: ${track.id}. Add the stream first.`);
            return;
        }

        this.peers.forEach((p: ThorIOConnection) => {
            const pc = p.peerConnection;
            
            // This action triggers the pc.onnegotiationneeded handler 
            // defined in createRTCPeerConnection, which sends the offer.
            pc.addTrack(track, stream);
        });
    }

    /**
     * Remove a MediaStreamTrack from the remote peers
     *
     * @param {MediaStreamTrack} track - The media stream track
     */
    removeTrackFromPeers(track: MediaStreamTrack) {
        this.peers.forEach((p: ThorIOConnection) => {
            // Find the sender associated with the track
            const sender = p.getSenders().find((s: RTCRtpSender) => s.track?.id === track.id);
            
            if (sender) {
                // This action triggers the pc.onnegotiationneeded handler
                p.peerConnection.removeTrack(sender);
            }
        });
    }
    
    // --- Rest of Public API (Preserved) ---
    
    getRtpSenders(peerId: string): Array<RTCRtpSender> | undefined {
        if (!this.peers.has(peerId)) throw "Cannot find the peer"
        return this.peers.get(peerId)!.getSenders();
    }

    getRtpReceivers(peerId: string): Array<RTCRtpReceiver> {
        if (!this.peers.has(peerId)) throw "Cannot find the peer"
        return this.peers.get(peerId)!.getReceivers();
    }

    private setMediaBitrate(sdp: string, media: string, bitrate: number): string {
        let lines = sdp.split("\n");
        let line = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("m=" + media) === 0) {
                line = i;
                break;
            }
        }
        if (line === -1) {
            return sdp;
        }
        line++;
        while (lines[line].indexOf("i=") === 0 || lines[line].indexOf("c=") === 0) {
            line++;
        }
        if (lines[line].indexOf("b") === 0) {
            lines[line] = "b=AS:" + bitrate;
            return lines.join("\n");
        }
        var newLines = lines.slice(0, line);
        newLines.push("b=AS:" + bitrate);
        newLines = newLines.concat(lines.slice(line, lines.length));
        return newLines.join("\n");
    }

    createDataChannel(name: string): DataChannel {
        const channel = new DataChannel(name);
        this.dataChannels.set(name, channel);
        
        // When a new DataChannel is created, ensure it's established on existing peers
        this.peers.forEach((p: ThorIOConnection) => {
            let pc = new PeerChannel(p.id, p.peerConnection.createDataChannel(name), name);
            channel.addPeerChannel(pc);
            // NOTE: Re-negotiation (offer/answer) is required here for the DataChannel to be seen by the remote peer.
            // Since this method is usually called before `connectContext`, this may be fine, 
            // but for runtime creation, you'd need to manually call `p.peerConnection.onnegotiationneeded()` 
            // or trigger it via a dummy track.
        });
        
        return channel;
    }

    removeDataChannel(name: string): void {
        this.dataChannels.delete(name);
    }

    applyVideoConstraints(mtc: MediaTrackConstraints): Promise<any> {
        let work = Array.from(this.peers.values()).flatMap(v => {
            return v.getSenders()
                .filter(sender => sender.track?.kind === 'video') // Only video tracks
                .map(sender => sender.track!.applyConstraints(mtc));
        });
        return Promise.all(work);
    }

    // applyBandwithConstraints(bandwidth: number): void {
    //     this.peers.forEach((p: ThorIOConnection) => {
    //         p.getSenders().forEach((sender: RTCRtpSender) => {
    //             // Check if the sender's track is active/exists
    //             if (!sender.track) return;
                
    //             const parameters = sender.getParameters();
    //             if (!parameters.encodings || parameters.encodings.length === 0) {
    //                 parameters.encodings = [{}];
    //             }
                
    //             // Apply maxBitrate to the first encoding (typically the only one for a simple stream)
    //             if (parameters.encodings[0]) {
    //                 parameters.encodings[0].maxBitrate = bandwidth * 1000;
    //                 sender.setParameters(parameters).catch(e => {
    //                     this.addError(e);
    //                 });
    //             }
    //         });
    //     });
    // }

    addLocalStream(stream: MediaStream): ExtendWebRTCFactory {
        // Prevent adding the same stream multiple times
        if (!this.localStreams.includes(stream)) {
            this.localStreams.push(stream);
        }
        return this;
    }

    addIceServer(iceServer: RTCIceServer): ExtendWebRTCFactory {
        this.rtcConfig.iceServers.push(iceServer);
        return this;
    }

    removePeerConnection(id: string) {
        this.peers.delete(id);
    }

    private cleanUp(id: string) {
        this.dataChannels.forEach((d: DataChannel) => {
            d.removePeerChannel(id);
        });
    }

    findPeerConnection(id: string): ThorIOConnection | undefined {
        return this.peers.get(id);
    }
    
    reconnectAll(): Array<ContextConnection> {
        throw "not yet implemeted";
    }
    
    disconnect() {
        this.peers.forEach((connection: ThorIOConnection) => {
            connection.peerConnection.close();
        });
        this.changeContext(Math.random().toString(36).substring(2));
    }
    
    disconnectPeer(id: string): void {
        let peer = this.findPeerConnection(id);
        if (peer)
            peer.peerConnection.close();
    }

    connect(peerConnections: Array<ContextConnection>): void {
        peerConnections.forEach((peerConnection: ContextConnection) => {
            this.connectTo(peerConnection)
        });
    }
 
    connectTo(peerConnection: ContextConnection): void {
        if (this.peers.has(peerConnection.peerId)) return; // Already connected

        // 1. Get/Create the connection object, which internally creates the RTCPeerConnection
        const pc = this.getOrCreateRTCPeerConnection(peerConnection.peerId); 

        // 2. Start the negotiation by creating and sending the initial offer (skipLocalTracks=false)
        this.createAndSendOffer(peerConnection.peerId, false);
    }
  
    changeContext(context: string): ExtendWebRTCFactory {
        this.signalingController.invoke("changeContext", { context: context });
        return this;
    }
    private connectPeers() {
        this.signalingController.invoke("connectContext", {});
    }
  
    connectContext() {
        this.connectPeers();
    }
}