type Task<T> = {
  run: () => T
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

export class WriteQueue {
  private queue: Task<unknown>[] = []
  private running = false
  private waitMs: number

  constructor(waitMs = 15000) {
    this.waitMs = waitMs
  }

  enqueue<T>(fn: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('انتهت مهلة انتظار قفل قاعدة البيانات. حاول مرة أخرى.'))
      }, this.waitMs)

      this.queue.push({
        run: fn,
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value as T)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      })
      this.drain()
    })
  }

  private drain(): void {
    if (this.running) return
    const next = this.queue.shift()
    if (!next) return
    this.running = true
    try {
      const result = next.run()
      next.resolve(result)
    } catch (err) {
      next.reject(err)
    } finally {
      this.running = false
      if (this.queue.length) {
        setImmediate(() => this.drain())
      }
    }
  }
}

export const writeQueue = new WriteQueue()
