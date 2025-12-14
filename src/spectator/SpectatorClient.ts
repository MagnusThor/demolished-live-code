import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap';
import { DOMUtils } from "../engine/helpers/DOMUtis";

import { RTC_CONFIG } from '../engine/config/RTC_CONFIG';
import { ExtendWebRTCFactory } from '../io/CustomRTCFactory';
import { ClientFactory, Controller, IContextConnection, ThorIOConnection } from 'thor-io.client-vnext';

export interface RemoteStream {
    id: string;
    mediaStreams: Map<string, MediaStream>;
}

export class SpectatorClient {
    rtcFactory: ExtendWebRTCFactory | undefined;
    private remoteStream: RemoteStream | undefined
    streamUUID: string;


    constructor(private parent: HTMLElement) {
        this.remoteStream = {
            id: crypto.randomUUID(),
            mediaStreams: new Map<string, MediaStream>()
        }
        this.streamUUID = location.hash.replace("#", "");
        this.initializeWebRTC();
    }

    private initializeWebRTC(): void {
        const scheme = location.href.includes("https") ? "wss" : "ws";
        const factory = new ClientFactory(`${scheme}:/${location.host}`, ["conferenceController"]);

        factory.onOpen = (streamController: Controller) => {
            this.rtcFactory = new ExtendWebRTCFactory(streamController, RTC_CONFIG);

            this.rtcFactory.onContextCreated = (peerConnection: IContextConnection) => {
                console.log(`Created a context ${peerConnection.context}`);
            }

            this.rtcFactory.onContextConnected = (connection: ThorIOConnection, rtcPeerConnection: RTCPeerConnection) => {
            }
            this.rtcFactory.onContextDisconnected = (connection: ThorIOConnection) => {
                console.log(`Context disconnected for connection ID: ${connection.id}`);
            };
            this.rtcFactory.onContextChanged = (peerConnection: IContextConnection) => {
                console.log(peerConnection);

                this.rtcFactory?.connectContext();
            }

            this.rtcFactory.onLocalStream = (stream: MediaStream) => {
                console.log(`onLocalStream, ${stream.id}`);
            }

            this.rtcFactory.onRemoteTrack = (mediaStreamTrack: MediaStreamTrack, remoteConnection: ThorIOConnection, rtcEvent: RTCTrackEvent) => {

                console.log(`Received track of kind: ${mediaStreamTrack.kind} () from ${remoteConnection.id}`);

                if (mediaStreamTrack.kind === "video") {
                    const newMediaStream = new MediaStream();
                    newMediaStream.addTrack(mediaStreamTrack);

                    this.remoteStream?.mediaStreams.set(mediaStreamTrack.id, newMediaStream);
                    this.renderVideoElement(newMediaStream);

                    mediaStreamTrack.onended = () => {
                        console.log(`Track ended: ${mediaStreamTrack.id} (${mediaStreamTrack.kind})`);
                        this.handleTrackLost(mediaStreamTrack);
                    };
                } else if (mediaStreamTrack.kind === "audio") {
                    const audioElement = DOMUtils.get<HTMLAudioElement>("#speaker-audio");
                    const audioStream = new MediaStream([mediaStreamTrack]);
                    audioElement.srcObject = audioStream;
                    audioElement.oncanplay = () => {
                        audioElement.play();
                    };
                }
            };
            streamController.connect();
        };
    }



    private handleTrackLost(track: MediaStreamTrack): void {
        DOMUtils.get<HTMLDivElement>(`#stream-thumb-${track.id}`)?.remove();
        this.remoteStream?.mediaStreams.delete(track.id);

        const selectedVideo = DOMUtils.get<HTMLVideoElement>("#selected-video-stream");

        if (selectedVideo.srcObject instanceof MediaStream && selectedVideo.srcObject.id === this.remoteStream?.id) {
        }

        if (this.remoteStream!.mediaStreams.size > 0) {
            const firstStream = this.remoteStream!.mediaStreams.values().next().value as MediaStream;
            selectedVideo.srcObject = firstStream;
        } else {
            selectedVideo.classList.add("d-none");
        }
    }

    /**
     * Renders a video element thumbnail for the received MediaStream.
     * Includes fixes for autoplay policy and lifecycle timing.
     */
    private renderVideoElement(mediaStream: MediaStream): void {

        const template = `
        <div class="mt-2" id="stream-thumb-${mediaStream.id}">
            <video class="img-fluid video-thumb" muted></video>
        </div>
        `;

        const dom = DOMUtils.toDOM(template);

        const videoThumb = DOMUtils.get<HTMLVideoElement>(".video-thumb", dom);

        videoThumb.srcObject = mediaStream;

        videoThumb.onloadedmetadata = () => {
            const playPromise = videoThumb.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log(`Thumbnail ${mediaStream.id} playback started.`);
                }).catch(error => {
                    console.warn(`Thumbnail ${mediaStream.id} playback blocked (Autoplay policy?):`, error.name, error.message);
                });
            }
        };

        DOMUtils.on("click", videoThumb, () => {

            const selectedVideo = DOMUtils.get<HTMLVideoElement>("#selected-video-stream");

            selectedVideo.classList.remove("d-none");

            selectedVideo.srcObject = mediaStream;

            selectedVideo.play().catch(e => console.error("Failed to play selected video:", e));
        });

        DOMUtils.get<HTMLDivElement>("#video-streams")?.append(dom);
    }
    render(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                const template = /*html*/ `
                    <audio id="speaker-audio" autoplay class="d-none"></audio>

                     <button id="btn-join" class="btn btn-primary position-absolute top-50 start-50 translate-middle">JOIN LIVESTREAM</button>
                    
                    
                    <div class="container-fluid h-100"">
                        <div class="row h-100"">
                            <div class="col-8 d-flex align-items-center justify-content-center">
                                
                            
                            <video 
                                id="selected-video-stream" 
                                class="w-100 border rounded shadow-sm d-none" 
                                autoplay 
                                muted 
                                ></video>
                            </div>
                            <div class="col-4" id="video-streams">
                              
                            </div>
                        </div>
                    </div>
                    `
                const dom = DOMUtils.toDOM(template);


                const joinButton = DOMUtils.get<HTMLButtonElement>("#btn-join", dom);

                if (this.streamUUID !== "") {
                    joinButton.disabled = false;
                } else {
                    joinButton.disabled = true;
                }


                DOMUtils.on("click", joinButton, () => {
                    this.rtcFactory?.changeContext(this.streamUUID);
                    joinButton.classList.add("d-none");
                    DOMUtils.get<HTMLVideoElement>("#selected-video-stream", dom)?.classList.remove("d-none");

                });

                this.parent.append(dom);

                this.initializeWebRTC();

                resolve();
            } catch (error) {
                reject(error)
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const mainElement = DOMUtils.get("main") || document.body;

    const client = new SpectatorClient(mainElement);
    client.render().then(p => {
        console.log(`Spectator client rendered. Ready to join.`);
    }).catch(e => {
        console.error("Failed to render client:", e);
    });
});