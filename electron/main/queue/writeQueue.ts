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
    const finish = () => {
      this.running = false
      if (this.queue.length) setImmediate(() => this.drain())
    }
    try {
      const result = next.run() as unknown
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        ;(result as Promise<unknown>)
          .then((value) => next.resolve(value))
          .catch((err) => next.reject(err))
          .finally(finish)
        return
      }
      next.resolve(result)
    } catch (err) {
      next.reject(err)
    }
    finish()
  }
}

export const writeQueue = new WriteQueue()
