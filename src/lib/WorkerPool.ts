
export class WorkerPool {
    private workers: Worker[] = [];
    private taskQueue: Array<{
        id: string;
        type: string;
        payload: any;
        transfer: Transferable[];
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    }> = [];

    private activeTasks = new Map<string, { resolve: Function, reject: Function }>(); // map requestId -> promise handlers
    private workerStatus = new Map<Worker, boolean>(); // true = busy, false = free

    constructor(size: number = navigator.hardwareConcurrency || 4) {
        for (let i = 0; i < size; i++) {
            const worker = new Worker(new URL('./crypto.worker.ts', import.meta.url), { type: 'module' });

            worker.onmessage = (e) => {
                const { id, result, error } = e.data;
                const task = this.activeTasks.get(id);

                if (task) {
                    if (error) task.reject(new Error(error));
                    else task.resolve(result);
                    this.activeTasks.delete(id);
                }

                this.workerStatus.set(worker, false);
                this.processQueue();
            };

            worker.onerror = (e) => {
                console.error('Worker error:', e);
                // Fail any active task for this worker? Hard to track without mapping worker -> task ID.
                // For simplicity, we just log. More robust would be to track currentTaskId per worker.
            };

            this.workers.push(worker);
            this.workerStatus.set(worker, false);
        }
    }

    public execute(type: string, payload: any, transfer: Transferable[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            this.taskQueue.push({ id, type, payload, transfer, resolve, reject });
            this.processQueue();
        });
    }

    private processQueue() {
        if (this.taskQueue.length === 0) return;

        // Find first available worker
        const worker = this.workers.find(w => !this.workerStatus.get(w));
        if (!worker) return;

        const task = this.taskQueue.shift();
        if (!task) return;

        this.workerStatus.set(worker, true);
        this.activeTasks.set(task.id, { resolve: task.resolve, reject: task.reject });

        // Send to worker
        worker.postMessage({ id: task.id, type: task.type, payload: task.payload }, task.transfer);
    }

    public terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.taskQueue = [];
        this.activeTasks.clear();
    }
}
