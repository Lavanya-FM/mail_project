import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';

export class VideoBackgroundProcessor {
    private selfieSegmentation: SelfieSegmentation | null = null;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private processedStream: MediaStream | null = null;
    private videoElement: HTMLVideoElement;
    private mode: 'blur' | 'image' | 'none' = 'none';
    private backgroundImage: HTMLImageElement | null = null;
    private isProcessing = false;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d')!;
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
    }

    async init() {
        if (this.selfieSegmentation) return;

        this.selfieSegmentation = new SelfieSegmentation({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });

        this.selfieSegmentation.setOptions({
            modelSelection: 1,
        });

        this.selfieSegmentation.onResults(this.onResults.bind(this));
    }

    private onResults(results: any) {
        if (!this.ctx || !this.canvas || !results.image) return;

        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw the mask
        this.ctx.drawImage(results.segmentationMask, 0, 0, this.canvas.width, this.canvas.height);

        // 2. Draw the person only where the mask is (source-in)
        // This keeps the person but discards the original background from this layer
        this.ctx.globalCompositeOperation = 'source-in';
        this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);

        // 3. Draw the background behind the person (destination-over)
        this.ctx.globalCompositeOperation = 'destination-over';

        if (this.mode === 'blur') {
            this.ctx.filter = 'blur(20px)';
            this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.filter = 'none';
        } else if (this.mode === 'image' && this.backgroundImage) {
            this.ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Default background if none
            this.ctx.fillStyle = '#202124';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.restore();
    }

    async startProcessing(stream: MediaStream): Promise<MediaStream> {
        await this.init();
        this.videoElement.srcObject = stream;

        await new Promise<void>((resolve) => {
            if (this.videoElement.readyState >= 2) resolve();
            this.videoElement.onloadeddata = () => resolve();
        });

        this.canvas.width = this.videoElement.videoWidth;
        this.canvas.height = this.videoElement.videoHeight;

        this.isProcessing = true;
        this.processFrame();

        this.processedStream = this.canvas.captureStream(30);
        return this.processedStream;
    }

    private async processFrame() {
        if (!this.isProcessing || !this.selfieSegmentation) return;

        if (this.mode === 'none') {
            // Pass through if mode is none? 
            // Actually, if mode is none, we should stop processing. 
            // But for now, let's keep loop.
        }

        await this.selfieSegmentation.send({ image: this.videoElement });
        requestAnimationFrame(this.processFrame.bind(this));
    }

    stopProcessing() {
        this.isProcessing = false;
        if (this.processedStream) {
            this.processedStream.getTracks().forEach(t => t.stop());
            this.processedStream = null;
        }
    }

    setMode(mode: 'blur' | 'image' | 'none', imageUrl?: string) {
        this.mode = mode;
        if (mode === 'image' && imageUrl) {
            const img = new Image();
            img.src = imageUrl;
            img.onload = () => { this.backgroundImage = img; };
        }
    }
}

export const backgroundProcessor = new VideoBackgroundProcessor();
