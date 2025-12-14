

export function connectCanvasToVideo(width: number, height: number, frameRate: number = 60) {
    const canvas = document.querySelector("#result-canvas") as HTMLCanvasElement | null;
    if (!canvas) {
        console.error("Canvas element with ID 'result-canvas' not found.");
        return;
    }

    const video = document.querySelector("#video-result") as HTMLVideoElement | null;
    if (!video) {
        console.error("Video element with ID 'video-result' not found. Please add it to your HTML.");
        return;
    }

    canvas.width = width;
    canvas.height = height;

    const srcObj = canvas.captureStream(frameRate);

    video.srcObject = srcObj;

    video.muted = true;
    video.play().catch(err => {
        console.warn("Autoplay failed:", err.message);
    });

    console.log("Canvas stream connected to video element successfully.");
}
