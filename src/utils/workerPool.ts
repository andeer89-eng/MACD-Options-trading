/**
 * Simple Worker Pool to manage background processing tasks.
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: any[] = [];
  private activeTasks: Map<number, { resolve: Function; reject: Function }> = new Map();
  private nextTaskId = 0;

  constructor(private workerPath: string, private size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerPath, { type: 'module' });
      worker.onmessage = (e) => this.handleMessage(i, e);
      this.workers.push(worker);
    }
  }

  private handleMessage(workerIndex: number, e: MessageEvent) {
    const { taskId, result, error } = e.data;
    const task = this.activeTasks.get(taskId);
    if (task) {
      if (error) task.reject(error);
      else task.resolve(result);
      this.activeTasks.delete(taskId);
    }
  }

  run(taskData: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const taskId = this.nextTaskId++;
      this.activeTasks.set(taskId, { resolve, reject });
      
      // Simple round-robin distribution
      const workerIndex = taskId % this.size;
      this.workers[workerIndex].postMessage({ taskId, ...taskData });
    });
  }

  terminate() {
    this.workers.forEach(w => w.terminate());
  }
}
