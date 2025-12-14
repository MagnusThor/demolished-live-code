import { Modal } from "bootstrap";
import { DOMUtils } from "../engine/helpers/DOMUtis";
import { MediaHelpers } from "../engine/helpers/MediHelpers";


import { RTC_CONFIG } from "../engine/config/RTC_CONFIG";
import { ExtendWebRTCFactory } from "../io/CustomRTCFactory";
import { ClientFactory, Controller, IContextConnection, ThorIOConnection } from "thor-io.client-vnext";


import copy from 'copy-to-clipboard';


export class LiveStreamComponent {
    private modalElement: HTMLElement | null = null;
    private bsModal: Modal | null = null;
    private stream: MediaStream | null = null; // Holds the microphone + webcam stream from getUserMedia
    private screenShareStream: MediaStream | null = null; // Holds the screen share stream from getDisplayMedia
    private rtcFactory: ExtendWebRTCFactory | undefined;

    private isStreaming: boolean = false;


    private launchButton: HTMLButtonElement | null = null;

    // Video elements used as sources to draw onto the composition canvas
    private webcamVideoElement: HTMLVideoElement | null = null;
    private screenVideoElement: HTMLVideoElement | null = null;

    // The canvas used as the ultimate stream source (it is #result-canvas in this case)
    private compositionCanvas: HTMLCanvasElement | null = null;

    // Keep these, but they are technically managed by the composition logic now
    canvasStream: any;
    editorCanvas: HTMLCanvasElement | undefined;
    streamUUID: string;
    factory: ClientFactory;

    constructor(private parent: HTMLElement) {

        this.streamUUID = Math.random().toString(36).substring(2);

        // Connect to the ThorIO server

        const scheme = location.href.includes("https") ? "wss" : "ws";
        const factory = new ClientFactory(`${scheme}:/${location.host}`, ["conferenceController"]);

       
      

        factory.onOpen = (streamController: Controller) => {
            this.rtcFactory = new ExtendWebRTCFactory(streamController, RTC_CONFIG);

            this.rtcFactory.onContextCreated = (peerConnection: IContextConnection) => {
                console.log(`Created a context ${peerConnection.context}`);
            }

            this.rtcFactory.onContextConnected = (connection: ThorIOConnection, rtcPeerConnection: RTCPeerConnection) => {
                console.log(`onContextConnected ${connection}`);
            }

            this.rtcFactory.onContextChanged = (peerConnection: IContextConnection) => {
                console.log(peerConnection);
                // When context changes (i.e., we join a room), attempt to connect the peers
                this.rtcFactory?.connectContext();
            }

            this.rtcFactory.onLocalStream = (stream: MediaStream) => {
                console.log(`onLocalStream, ${stream.id}`);
            }

            this.rtcFactory.onRemoteTrack = (mediaStreamTrack: MediaStreamTrack, remoteConnection: ThorIOConnection, rtcEvent: RTCTrackEvent) => {
                // This component is a broadcaster, so we expect no remote streams
                console.log(`We will not be receieving any remote streams, but broadcast`)
            };

            streamController.connect();
        };

        this.factory = factory;
        
    }

    private updateLaunchButtonUI(): void {
        if (!this.launchButton) return;

        if (this.isStreaming) {
            this.launchButton.textContent = "STOP LIVESTREAM";
            this.launchButton.classList.remove("btn-primary");
            this.launchButton.classList.add("btn-danger");
        } else {
            this.launchButton.textContent = "START LIVESTREAM";
            this.launchButton.classList.remove("btn-danger");
            this.launchButton.classList.add("btn-primary");
        }
    }

    render(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {

                const template = /*html*/ `
                <div class="row mb-3">
                    <button class="btn btn-primary" id="launch-settings-button">
                    START LIVESTREAM
                    </button>
                </div>

                <div class="modal fade" id="liveStreamSettingsModal" tabindex="-1" aria-labelledby="liveStreamSettingsModalLabel" aria-hidden="true">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="liveStreamSettingsModalLabel">Livestream Settings & Device Selection</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                
                                <div class="row" id="device-selector">
                                    <h5 class="mb-2">Select Devices (One of each is streamed):</h5>
                                    <div id="audio-input-devices" class="col-md-6">
                                        <h6>Microphones: <i class="text-muted small">Loading...</i></h6>
                                    </div>
                                    <div id="video-input-devices" class="col-md-6">
                                        <h6>Cameras: <i class="text-muted small">Loading...</i></h6>
                                    </div>
                                </div>
                                
                                <hr>
                                <div class="row">
                                    <div class="col-12">
                                        <p class="text-muted small">
                                        NOTE: Streaming will combine the result canvas, selected webcam, selected microphone, and the desktop/window/tab into a single stream for broadcast.</p>
                                    </div>
                                    <div class="col-12">
                                    <label for="share-url" class="form-label">Stream URL</label>
                                    <div class="input-group mb-3">
                                
                                    <input type="text" class="form-control" readonly id="share-url" value="">
                                    <div class="input-group-append">
                                        <button class="btn btn-light copy-me" type="button">COPY</button>
                                    </div>
                                    </div>
                                </div>

                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-success" id="start-stream-button" disabled>Start Stream</button>
                            </div>
                        </div>
                    </div>
                </div>
                `;

                const result = DOMUtils.toDOM(template);

                this.launchButton = DOMUtils.get<HTMLButtonElement>("#launch-settings-button", result);
                this.modalElement = DOMUtils.get<HTMLDivElement>("#liveStreamSettingsModal", result);
                const audioInputContainer = DOMUtils.get<HTMLDivElement>("#audio-input-devices", result);
                const videoInputContainer = DOMUtils.get<HTMLDivElement>("#video-input-devices", result);
                const startStreamButton = DOMUtils.get<HTMLButtonElement>("#start-stream-button", result);

                const streamUrlInput = DOMUtils.get<HTMLInputElement>("#share-url", result);
                streamUrlInput.value = `${window.location.href}spectate/#${this.streamUUID}`;

            
                this.updateLaunchButtonUI();

                if (this.modalElement) {
                    this.bsModal = new Modal(this.modalElement);

                    // Listen for changes to radio buttons to update the Start Stream button state
                    DOMUtils.on("change", this.modalElement, (e) => {
                        const target = e.target as HTMLInputElement;
                        if (target.matches('input[type="radio"]')) {
                            this.updateStartButtonState(this.modalElement!, startStreamButton, true);
                        }
                    });

                } else {
                    console.error("Modal element not found in DOM.");
                }

                DOMUtils.on("click", this.launchButton, async () => {
                    if (this.isStreaming) {
                        await this.stopStream();
                    } else {
                        if (this.bsModal) {
                            this.bsModal.show();
                        }

                        startStreamButton.disabled = true;

                        audioInputContainer.innerHTML = '<h6>Microphones: <i class="text-muted small">Loading...</i></h6>';
                        videoInputContainer.innerHTML = '<h6>Cameras: <i class="text-muted small">Loading...</i></h6>';

                        try {
                            const devices = await MediaHelpers.getMediaDevices();

                            audioInputContainer.querySelector('h6 i')?.remove();
                            videoInputContainer.querySelector('h6 i')?.remove();

                            let audioCount = 0;
                            let videoCount = 0;

                            devices.forEach(device => {
                                let innerHTML: string;
                                const isAudio = device.kind === 'audioinput';
                                const isVideo = device.kind === 'videoinput';
                                let isChecked = false;
                                let nameAttribute = ''; // Used to group radio buttons

                                if (isAudio) {
                                    isChecked = audioCount === 0; // Check the first audio device
                                    nameAttribute = 'audio-device-select';
                                } else if (isVideo) {
                                    isChecked = videoCount === 0; // Check the first video device
                                    nameAttribute = 'video-device-select';
                                }

                                if (isAudio || isVideo) {
                                    // Using radio buttons instead of checkboxes
                                    innerHTML = `
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" ${isChecked ? 'checked' : ''} 
                                                   name="${nameAttribute}" value="${device.deviceId}" id="${device.deviceId}" 
                                                   data-kind="${device.kind}">
                                            <label class="form-check-label" for="${device.deviceId}">
                                                ${device.label || `(Unknown ${device.kind})`}
                                            </label>
                                        </div>
                                    `;

                                    const deviceElement = DOMUtils.toDOM(innerHTML);

                                    if (isAudio) {
                                        audioInputContainer.appendChild(deviceElement);
                                        audioCount++;
                                    } else if (isVideo) {
                                        videoInputContainer.appendChild(deviceElement);
                                        videoCount++;
                                    }
                                }
                            });

                            if (audioCount === 0) {
                                audioInputContainer.appendChild(DOMUtils.toDOM('<p class="text-muted small">No microphone detected or permission denied.</p>'));
                            }
                            if (videoCount === 0) {
                                videoInputContainer.appendChild(DOMUtils.toDOM('<p class="text-muted small">No cameras detected.</p>'));
                            }

                            // Update button state based on initial selection (requires audio)
                            this.updateStartButtonState(this.modalElement!, startStreamButton, true);

                        } catch (error) {
                            console.error("Error fetching media devices:", error);
                            audioInputContainer.querySelector('h6 i')?.remove();
                            videoInputContainer.querySelector('h6 i')?.remove();
                            audioInputContainer.appendChild(DOMUtils.toDOM('<p class="text-danger small">Error loading devices. Check media permissions.</p>'));
                            videoInputContainer.appendChild(DOMUtils.toDOM('<p class="text-danger small">Error loading devices. Check media permissions.</p>'));
                        }
                    }
                });

                DOMUtils.on("click", startStreamButton, async () => {
                    const selectedDevices = this.getSelectedDevices(this.modalElement!);

                    const constraints = this.createMediaConstraints(selectedDevices.audio, selectedDevices.video);

                    if (this.bsModal) {
                        this.bsModal.hide();
                    }

                    await this.startStream(constraints);

                });

                this.parent.append(result);

                DOMUtils.getAll(".copy-me").forEach(el => {
                    const btn = el as HTMLButtonElement;
                    DOMUtils.on("click", btn, () => {
                        copy(streamUrlInput.value);
                        el.classList.add("btn-success");
                        el.textContent = "Copied!";

                    });
                });
       


            } catch (error) {
                reject(error);
            }

            resolve();
        });
    }



    public async stopStream(): Promise<void> {
        console.log("Attempting to stop stream and disconnect RTC.");

        // Stop mic/webcam stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Stop screen share stream
        if (this.screenShareStream) {
            this.screenShareStream.getTracks().forEach(track => track.stop());
            this.screenShareStream = null;
        }

        // Cleanup video elements
        if (this.webcamVideoElement) {
            this.webcamVideoElement.srcObject = null;
            this.webcamVideoElement = null;
        }
        if (this.screenVideoElement) {
            this.screenVideoElement.srcObject = null;
            this.screenVideoElement = null;
        }

        // Reset canvas references
        this.compositionCanvas = null;
        this.canvasStream = undefined;
        this.editorCanvas = undefined;

        this.rtcFactory?.disconnect();

        this.isStreaming = false;

        DOMUtils.get<HTMLDivElement>("#share-container")?.classList.add("d-none");
        DOMUtils.get<HTMLButtonElement>("#btn-pip")?.click();

        this.updateLaunchButtonUI();


        console.log("Livestream successfully stopped.");
    }

    /**
      * Uses getUserMedia for audio/webcam and getDisplayMedia for screen,
      * composites all video sources onto a canvas, and streams the canvas + mic audio.
      */
    public async startStream(constraints: MediaStreamConstraints): Promise<void> {
        console.log("Attempting to start composited stream with constraints:", constraints);

        if (this.isStreaming) {
            await this.stopStream();
        }

        // 1. Get the main source canvas: This is the result of the visual editor
        const editorCanvasElement = DOMUtils.get<HTMLCanvasElement>("#result-canvas");
        if (!editorCanvasElement) {
            throw new Error("#result-canvas element not found in DOM. Cannot start stream.");
        }
        this.compositionCanvas = editorCanvasElement;


        try {
            const combinedStream = new MediaStream();

            // 2. Get Mic/Webcam stream based on device selection
            const micWebcamStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.stream = micWebcamStream;

            this.stream.getTracks().forEach(track => {
                combinedStream.addTrack(track);
                console.log(`Added Track ${track.label} of ${track.kind}`);
            });

            // 3. Get Screen Share stream (user selects desktop/window/tab via browser prompt)
            const displayMediaConstraints: MediaStreamConstraints = { video: true, audio: false };
            const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints);
            this.screenShareStream = screenStream;

            combinedStream.addTrack(screenStream.getVideoTracks()[0]);


            // 4. Get Canvas stream (The composited visual output)
            const outputVideoTrack = this.compositionCanvas.captureStream(30).getVideoTracks()[0];
            combinedStream.addTrack(outputVideoTrack);
            console.log(`Added Video Track (Composition Canvas): ${outputVideoTrack.label}`);


            // 5. Setup WebRTC Factory
            this.rtcFactory?.addLocalStream(combinedStream);
            this.rtcFactory?.changeContext(this.streamUUID); // Join the context/room

            this.isStreaming = true;

            DOMUtils.get<HTMLButtonElement>("#btn-pip")?.click(); // Try to launch Picture-in-Picture
            DOMUtils.get<HTMLDivElement>("#share-container")?.classList.remove("d-none");

            this.updateLaunchButtonUI();

        } catch (error) {
            console.error("Failed to start composited media stream:", error);
            alert(`Error starting stream: ${error instanceof Error ? error.name : 'Unknown Error'}. Check permissions.`);

            this.stopStream(); // Ensure cleanup on failure
        }
    }


    private updateStartButtonState(containerElement: HTMLElement | DocumentFragment, button: HTMLButtonElement, requireAudioOnly: boolean = false): void {
        const selected = this.getSelectedDevices(containerElement);

        // Button is enabled if at least one audio device is selected
        const isReady = selected.audio.length > 0;

        button.disabled = !isReady;
    }

    private createMediaConstraints(audioIds: string[], videoIds: string[]): MediaStreamConstraints {
        const constraints: MediaStreamConstraints = {};

        // Audio constraints (Only take the first selected radio button)
        if (audioIds.length > 0) {
            constraints.audio = {
                deviceId: { exact: audioIds[0] }
            };
        } else {
            constraints.audio = false;
        }

        // Video constraints (Only take the first selected radio button)
        if (videoIds.length > 0) {
            constraints.video = {
                deviceId: { exact: videoIds[0] }
            };
        } else {
            // Set to false to prevent getUserMedia from randomly selecting a camera
            constraints.video = false;
        }

        return constraints;
    }

    private getSelectedDevices(containerElement: HTMLElement | DocumentFragment): { audio: string[], video: string[] } {
        const audioDevices: string[] = [];
        const videoDevices: string[] = [];

        // Query for checked radio buttons
        const checkedInputs = containerElement.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked');

        checkedInputs.forEach(input => {
            const kind = input.getAttribute('data-kind');
            if (kind === 'audioinput') {
                audioDevices.push(input.value);
            } else if (kind === 'videoinput') {
                videoDevices.push(input.value);
            }
        });

        // Since we are using radio buttons, there will be at most one device ID per array.
        return { audio: audioDevices, video: videoDevices };
    }
}