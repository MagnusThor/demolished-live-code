

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


export function snapshotFromVideo(
  video: HTMLVideoElement,
  width: number,
  height: number,
  quality = 0.4
): string | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    console.warn("Video frame not ready yet");
    return null;
  }

  const snapCanvas = document.createElement("canvas");
  snapCanvas.width = width;
  snapCanvas.height = height;

  const ctx = snapCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, width, height);

  return snapCanvas.toDataURL("image/png", quality);
}
