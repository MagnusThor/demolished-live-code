import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';

import axios from "axios";
import {
    StoredShader,
    TypeOfShader,
    IDocumentData
} from "../editor/models/StoredShader";

import {
    OfflineStorage,
    IOfflineGraph
} from "../editor/store/OfflineStorage";

import { DOMUtils } from "../engine/helpers/DOMUtis";
import { mainShader } from "../engine/renderer/mainShader";
import {
    WGSLShaderRenderer,
    initWebGPU
} from "../engine/renderer/webgpu/wgslShaderRenderer";

import { Geometry, rectGeometry } from "../engine/renderer/webgpu/geometry";
import { Material, defaultWglslVertex } from "../engine/renderer/webgpu/material";

export class ViewShader {

    private renderer!: WGSLShaderRenderer;
    private storage!: OfflineStorage<StoredShader>;
    private currentShader!: StoredShader;

    /* ---------- PUBLIC API ---------- */

    async init(): Promise<boolean> {
        await this.initStorage();

        const canvas = DOMUtils.get<HTMLCanvasElement>("#result-canvas");
        const { device, context } = await initWebGPU(canvas);

        this.renderer = new WGSLShaderRenderer(canvas, device, context!);

        const shader = this.getShaderFromURL();
        if (!shader) {
            throw new Error("Shader could not be located");
        }

        this.currentShader = shader;
        await this.addShaderDocuments(shader.documents);
        this.startRenderer();

        return true;
    }

    /* ---------- RENDER LOOP ---------- */

    private startRenderer(): void {
        const gpuStats = DOMUtils.get("#stats-gpu");
        const fpsStats = DOMUtils.get("#stats-fps");

        this.renderer.start(0, 2000, (_frame, fps) => {
            if (this.renderer.gpuTimer.supportsTimeStampQuery) {
                gpuStats.textContent =
                    `${this.renderer.gpuAverage!.get().toFixed(0)}µs`;
            }
            fpsStats.textContent = `${fps}`;
        });
    }

    /* ---------- STORAGE ---------- */

    private async initStorage(): Promise<void> {
        this.storage = new OfflineStorage<StoredShader>("editor-dec");

        try {
            this.storage.init();
        } catch {
            await this.bootstrapDefaultStorage();
        }
    }

    private async bootstrapDefaultStorage(): Promise<void> {
        this.storage.setup();

        const response = await axios.get<IOfflineGraph<StoredShader>>(
            `../shaders/default.json?rnd=${crypto.randomUUID()}`
        );

        response.data.collection.forEach(shader =>
            this.storage.insert(shader)
        );

        this.storage.save();
    }

    /* ---------- SHADER SETUP ---------- */

    private async addShaderDocuments(
        documents: IDocumentData[]
    ): Promise<void> {

        this.renderer.renderPassBacklog.clear();

        const geometry = new Geometry(
            this.renderer.device,
            rectGeometry
        );

        await Promise.all(
            documents.map(async (doc, index) => {

                console.log(
                    `Adding ${doc.type} shader: ${doc.name}`
                );

                if (doc.type === TypeOfShader.Frag) {
                    const material = new Material(
                        this.renderer.device,
                        {
                            fragment: doc.source,
                            vertex: defaultWglslVertex
                        }
                    );

                    this.renderer.addRenderPass(
                        `RENDERPASS_${index}`,
                        material,
                        geometry,
                        []
                    );
                }

                if (doc.type === TypeOfShader.Compute) {
                    this.renderer.addComputeRenderPass(
                        `COMPUTE_${index}`,
                        doc.source
                    );
                }
            })
        );

        // Main output pass
        mainShader.fragment = documents[0].source;
        this.renderer.addMainRenderPass(mainShader);
    }

    /* ---------- URL HELPERS ---------- */

    private getShaderFromURL(): StoredShader | undefined {
        const params = new URLSearchParams(location.search);
        const id = params.get("shader");
        return id ? this.storage.findById(id) : undefined;
    }
}

/* ---------- BOOTSTRAP ---------- */

document.addEventListener("DOMContentLoaded", async () => {

    const params = new URLSearchParams(window.location.search);

    const width = Number(params.get("w")) || 800;
    const height = Number(params.get("h")) || 450;
    const shaderUUID = params.get("shader");

    const canvas = DOMUtils.get<HTMLCanvasElement>("#result-canvas");
    canvas.width = width;
    canvas.height = height;

    const view = new ViewShader();
    await view.init();

    DOMUtils.on("click", "#go-to-editor", () => {
        location.href = `https://magnusthor.github.io/demolished-live-code/public/?shader=${shaderUUID}`;
    });
});
